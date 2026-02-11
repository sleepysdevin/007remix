import { io, Socket } from 'socket.io-client';
import { NetworkConfig } from './network-config';
import {
  NetworkEventType,
  PlayerConnectedEvent,
  PlayerDisconnectedEvent,
  PlayerStateUpdate,
  GameStateSnapshot,
  WeaponFireEvent,
  DamageEvent,
  PlayerDeathEvent,
  PlayerRespawnEvent,
  GrenadeThrowEvent,
  GrenadeExplosionEvent,
  FlashlightToggleEvent,
  DestructibleDestroyedEvent,
  GameOverEvent,
} from './network-events';

/**
 * NetworkManager handles all client-side networking via Socket.IO.
 * Provides a clean API for connecting to the server, sending/receiving messages,
 * and managing connection state.
 */
export class NetworkManager {
  private socket: Socket | null = null;
  private connected = false;
  private _playerId: string | null = null;
  private username: string;

  // Ping tracking
  private _ping = 0; // Current ping in milliseconds
  private lastPingUpdate = 0; // Timestamp of last ping calculation
  private pingSmoothing = 0.3; // Smoothing factor for ping (0-1, lower = smoother)
  private sentTimestamps: Map<number, number> = new Map(); // Sequence -> sent timestamp

  /**
   * Callbacks for network events.
   */
  onPlayerConnected: ((event: PlayerConnectedEvent) => void) | null = null;
  onPlayerDisconnected: ((event: PlayerDisconnectedEvent) => void) | null = null;
  onGameStateSnapshot: ((snapshot: GameStateSnapshot) => void) | null = null;

  // Combat event callbacks (Phase 3)
  onWeaponFire: ((event: WeaponFireEvent) => void) | null = null;
  onPlayerDamaged: ((event: DamageEvent) => void) | null = null;
  onPlayerDied: ((event: PlayerDeathEvent) => void) | null = null;
  onPlayerRespawned: ((event: PlayerRespawnEvent) => void) | null = null;

  // Equipment event callbacks (Phase 5)
  onGrenadeThrow: ((event: GrenadeThrowEvent) => void) | null = null;
  onGrenadeExplosion: ((event: GrenadeExplosionEvent) => void) | null = null;
  onFlashlightToggle: ((event: FlashlightToggleEvent) => void) | null = null;
  onDestructibleDestroyed: ((event: DestructibleDestroyedEvent) => void) | null = null;

  // Game mode (Phase 4)
  onGameOver: ((event: GameOverEvent) => void) | null = null;

  constructor(username: string = 'Player') {
    this.username = username;
  }

  /**
   * Get the local player's ID (assigned by server on connection).
   */
  get playerId(): string | null {
    return this._playerId;
  }

  /**
   * Get the local player's username.
   */
  get localUsername(): string {
    return this.username;
  }

  /**
   * Get current ping in milliseconds.
   */
  get ping(): number {
    return this._ping;
  }

  /**
   * Check if currently connected to server.
   */
  get isConnected(): boolean {
    return this.connected && this.socket !== null;
  }

  /**
   * Connect to the game server.
   * Returns a promise that resolves when connection is established.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(NetworkConfig.SERVER_URL, {
        reconnection: NetworkConfig.RECONNECTION.enabled,
        reconnectionAttempts: NetworkConfig.RECONNECTION.attempts,
        reconnectionDelay: NetworkConfig.RECONNECTION.delay,
        reconnectionDelayMax: NetworkConfig.RECONNECTION.delayMax,
      });

      // Connection successful
      this.socket.on('connect', () => {
        console.log('[NetworkManager] Connected to server');
        this.connected = true;
        this._playerId = this.socket!.id ?? null;

        // Send initial player info
        this.socket!.emit(NetworkEventType.PLAYER_CONNECTED, {
          playerId: this._playerId,
          username: this.username,
        } as PlayerConnectedEvent);

        resolve();
      });

      // Connection error
      this.socket.on('connect_error', (error) => {
        console.error('[NetworkManager] Connection error:', error);
        this.connected = false;
        reject(error);
      });

      // Disconnected
      this.socket.on('disconnect', (reason) => {
        console.log('[NetworkManager] Disconnected:', reason);
        this.connected = false;
        this._playerId = null;
      });

      // Player connected event
      this.socket.on(NetworkEventType.PLAYER_CONNECTED, (event: PlayerConnectedEvent) => {
        console.log('[NetworkManager] Player connected:', event.playerId);
        this.onPlayerConnected?.(event);
      });

      // Player disconnected event
      this.socket.on(NetworkEventType.PLAYER_DISCONNECTED, (event: PlayerDisconnectedEvent) => {
        console.log('[NetworkManager] Player disconnected:', event.playerId);
        this.onPlayerDisconnected?.(event);
      });

      // Game state snapshot (broadcast from server)
      this.socket.on(NetworkEventType.GAME_STATE_SNAPSHOT, (snapshot: GameStateSnapshot) => {
        // Calculate ping (roundtrip time)
        const now = performance.now();
        const sentTime = this.sentTimestamps.get(snapshot.timestamp);
        if (sentTime) {
          const rawPing = now - sentTime;
          // Smooth ping to avoid jitter
          this._ping = this._ping === 0
            ? rawPing
            : this._ping * (1 - this.pingSmoothing) + rawPing * this.pingSmoothing;
          this.lastPingUpdate = now;
          this.sentTimestamps.delete(snapshot.timestamp);
        }

        // Clean up old timestamps (older than 5 seconds)
        const cutoff = now - 5000;
        for (const [timestamp, sentTime] of this.sentTimestamps.entries()) {
          if (sentTime < cutoff) {
            this.sentTimestamps.delete(timestamp);
          }
        }

        this.onGameStateSnapshot?.(snapshot);
      });

      // Combat events (Phase 3)
      this.socket.on(NetworkEventType.WEAPON_FIRE, (event: WeaponFireEvent) => {
        this.onWeaponFire?.(event);
      });

      this.socket.on(NetworkEventType.PLAYER_DAMAGED, (event: DamageEvent) => {
        this.onPlayerDamaged?.(event);
      });

      this.socket.on(NetworkEventType.PLAYER_DIED, (event: PlayerDeathEvent) => {
        this.onPlayerDied?.(event);
      });

      this.socket.on(NetworkEventType.PLAYER_RESPAWNED, (event: PlayerRespawnEvent) => {
        this.onPlayerRespawned?.(event);
      });

      // Equipment events (Phase 5)
      this.socket.on(NetworkEventType.GRENADE_THROW, (event: GrenadeThrowEvent) => {
        this.onGrenadeThrow?.(event);
      });

      this.socket.on(NetworkEventType.GRENADE_EXPLOSION, (event: GrenadeExplosionEvent) => {
        this.onGrenadeExplosion?.(event);
      });

      this.socket.on(NetworkEventType.FLASHLIGHT_TOGGLE, (event: FlashlightToggleEvent) => {
        this.onFlashlightToggle?.(event);
      });

      this.socket.on(NetworkEventType.DESTRUCTIBLE_DESTROYED, (event: DestructibleDestroyedEvent) => {
        this.onDestructibleDestroyed?.(event);
      });

      this.socket.on(NetworkEventType.GAME_OVER, (event: GameOverEvent) => {
        this.onGameOver?.(event);
      });
    });
  }

  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this._playerId = null;
      console.log('[NetworkManager] Disconnected from server');
    }
  }

  /**
   * Send player state update to server.
   * Should be called at ~20Hz (every 50ms).
   */
  sendPlayerState(state: PlayerStateUpdate): void {
    if (!this.isConnected) return;
    // Track send time for ping calculation
    if (state.timestamp) {
      this.sentTimestamps.set(state.timestamp, performance.now());
    }
    this.socket!.emit(NetworkEventType.PLAYER_STATE_UPDATE, state);
  }

  /**
   * Send weapon fire event to server (Phase 3).
   * Server will validate hit and broadcast damage if confirmed.
   */
  sendWeaponFire(event: WeaponFireEvent): void {
    if (!this.isConnected) return;
    this.socket!.emit(NetworkEventType.WEAPON_FIRE, event);
  }

  /**
   * Send grenade throw event to server (Phase 5).
   */
  sendGrenadeThrow(event: GrenadeThrowEvent): void {
    if (!this.isConnected) return;
    this.socket!.emit(NetworkEventType.GRENADE_THROW, event);
  }

  /**
   * Send grenade explosion event to server (Phase 5).
   * Server will calculate damage to players in radius.
   */
  sendGrenadeExplosion(event: GrenadeExplosionEvent): void {
    if (!this.isConnected) return;
    this.socket!.emit(NetworkEventType.GRENADE_EXPLOSION, event);
  }

  /**
   * Send flashlight toggle event to server (Phase 5).
   */
  sendFlashlightToggle(event: FlashlightToggleEvent): void {
    if (!this.isConnected) return;
    this.socket!.emit(NetworkEventType.FLASHLIGHT_TOGGLE, event);
  }

  /**
   * Send destructible destroyed event to server (Phase 5).
   */
  sendDestructibleDestroyed(event: DestructibleDestroyedEvent): void {
    if (!this.isConnected) return;
    this.socket!.emit(NetworkEventType.DESTRUCTIBLE_DESTROYED, event);
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.disconnect();
    this.onPlayerConnected = null;
    this.onPlayerDisconnected = null;
    this.onGameStateSnapshot = null;
    this.onWeaponFire = null;
    this.onPlayerDamaged = null;
    this.onPlayerDied = null;
    this.onPlayerRespawned = null;
    this.onGrenadeThrow = null;
    this.onGrenadeExplosion = null;
    this.onFlashlightToggle = null;
    this.onDestructibleDestroyed = null;
    this.onGameOver = null;
  }
}
