import { ServerPlayerState, createPlayerState } from './player-state';
import type {
  WeaponFireEvent,
  DamageEvent,
  PlayerDeathEvent,
  PlayerRespawnEvent,
  GrenadeThrowEvent,
  GrenadeExplosionEvent,
  FlashlightToggleEvent,
  DestructibleDestroyedEvent,
  GameOverEvent,
} from '../src/network/network-events';

/**
 * GameRoom manages a single multiplayer session/match.
 * Tracks all players in the room and broadcasts state updates.
 */
export class GameRoom {
  private players: Map<string, ServerPlayerState> = new Map();
  private readonly updateRate = 20; // Hz
  private updateInterval: NodeJS.Timeout | null = null;
  private respawnTimers: Map<string, NodeJS.Timeout> = new Map(); // Player ID -> respawn timer

  // Anti-cheat: Movement speed validation
  private readonly MAX_SPEED = 9.9; // units/second (sprint speed)
  private readonly SPEED_TOLERANCE = 1.5; // 50% tolerance for network jitter, lag, edge cases

  // Anti-cheat: Fire rate validation
  private lastFireTime: Map<string, number> = new Map(); // Player ID -> last fire timestamp

  // Game mode: First to X kills wins
  private readonly KILLS_TO_WIN = 25;
  private gameOver = false;

  /**
   * Spawn points for players (random selection).
   * TODO: Load from level data.
   */
  private readonly spawnPoints = [
    { x: 0, y: 1, z: 0 },
    { x: -5, y: 1, z: -5 },
    { x: 5, y: 1, z: -5 },
    { x: -5, y: 1, z: 5 },
    { x: 5, y: 1, z: 5 },
    { x: 0, y: 1, z: -8 },
    { x: 0, y: 1, z: 8 },
    { x: -8, y: 1, z: 0 },
    { x: 8, y: 1, z: 0 },
  ];

  /**
   * Callback for broadcasting game state to all clients.
   * Set this to the Socket.IO broadcast function.
   */
  onBroadcast: ((eventName: string, data: any) => void) | null = null;

  constructor() {
    // Start game state broadcast loop
    this.startBroadcastLoop();
  }

  /**
   * Add a player to the room.
   */
  addPlayer(id: string, username: string): void {
    const playerState = createPlayerState(id, username);
    this.players.set(id, playerState);
    console.log(`[GameRoom] Player ${username} (${id}) joined. Total players: ${this.players.size}`);
  }

  /**
   * Remove a player from the room.
   */
  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (player) {
      // Clear any pending respawn timer
      const respawnTimer = this.respawnTimers.get(id);
      if (respawnTimer) {
        clearTimeout(respawnTimer);
        this.respawnTimers.delete(id);
      }

      // Clear fire rate tracking
      this.lastFireTime.delete(id);

      this.players.delete(id);
      console.log(`[GameRoom] Player ${player.username} (${id}) left. Total players: ${this.players.size}`);
    }
  }

  /**
   * Update a player's state from client input.
   * Validates movement speed to prevent speedhacking.
   */
  updatePlayerState(id: string, update: Partial<ServerPlayerState>): void {
    const player = this.players.get(id);
    if (!player) return;

    // Validate position update (anti-cheat: movement speed check)
    if (update.position) {
      const now = Date.now();
      const timeDelta = (now - player.lastUpdateTime) / 1000; // seconds

      // Calculate distance moved
      const distance = this.calculateDistance(player.position, update.position);

      // Calculate maximum allowed distance based on time and max speed (with tolerance)
      const maxAllowedDistance = this.MAX_SPEED * this.SPEED_TOLERANCE * timeDelta;

      if (distance > maxAllowedDistance && timeDelta > 0.016) {
        // Reject suspicious movement (unless it's the first update or very rapid updates)
        const speed = distance / timeDelta;
        console.warn(
          `[GameRoom] Rejected suspicious movement from ${player.username}: ` +
          `${distance.toFixed(2)} units in ${(timeDelta * 1000).toFixed(0)}ms ` +
          `(${speed.toFixed(2)} units/s, max allowed: ${(this.MAX_SPEED * this.SPEED_TOLERANCE).toFixed(2)})`
        );
        // Don't update position, but continue with other updates
      } else {
        // Valid movement, update position
        player.position = update.position;
      }
    }

    // Update other fields (always allowed)
    if (update.rotation !== undefined) player.rotation = update.rotation;
    if (update.health !== undefined) player.health = update.health;
    if (update.armor !== undefined) player.armor = update.armor;
    if (update.currentWeapon) player.currentWeapon = update.currentWeapon;
    if (update.crouching !== undefined) player.crouching = update.crouching;
    if (update.isMoving !== undefined) player.isMoving = update.isMoving;

    player.lastUpdateTime = Date.now();
  }

  /**
   * Get all player states (for broadcasting).
   */
  getAllPlayerStates(): Record<string, ServerPlayerState> {
    const states: Record<string, ServerPlayerState> = {};
    this.players.forEach((player, id) => {
      states[id] = player;
    });
    return states;
  }

  /**
   * Get player count.
   */
  get playerCount(): number {
    return this.players.size;
  }

  /**
   * Get player by ID.
   */
  getPlayer(id: string): ServerPlayerState | undefined {
    return this.players.get(id);
  }

  /**
   * Handle weapon fire event from client (Phase 3).
   * Validates fire rate and hit, broadcasts damage if confirmed.
   */
  handleWeaponFire(event: WeaponFireEvent): void {
    const shooter = this.players.get(event.playerId);
    if (!shooter) {
      console.log(`[GameRoom] Weapon fire from unknown player: ${event.playerId}`);
      return;
    }

    // Anti-cheat: Validate fire rate
    const now = Date.now();
    const lastFire = this.lastFireTime.get(event.playerId) ?? 0;
    const timeSinceLastFire = now - lastFire;
    const minInterval = this.getWeaponFireInterval(event.weaponType);
    const tolerance = 0.9; // 10% tolerance for network lag

    if (timeSinceLastFire < minInterval * tolerance) {
      console.warn(
        `[GameRoom] Rejected rapid fire from ${shooter.username}: ` +
        `${timeSinceLastFire}ms since last shot (min: ${minInterval}ms for ${event.weaponType})`
      );
      return; // Reject this shot
    }

    // Track fire time
    this.lastFireTime.set(event.playerId, now);

    console.log(`[GameRoom] ${shooter.username} fired ${event.weaponType}, hit claim: ${event.hitPlayerId ?? 'none'}`);

    // Broadcast weapon fire to all clients (for muzzle flash/animations)
    this.onBroadcast?.('weapon:fire', event);

    // Client claims to have hit someone
    if (event.hitPlayerId) {
      const victim = this.players.get(event.hitPlayerId);
      if (!victim) {
        console.log(`[GameRoom] Hit claim for unknown player: ${event.hitPlayerId}`);
        return;
      }

      // Basic validation: check if victim is alive and in reasonable range
      if (victim.health <= 0) return;

      const distance = this.calculateDistance(event.origin, victim.position);
      const maxRange = this.getWeaponRange(event.weaponType);

      if (distance > maxRange) {
        console.log(`[GameRoom] Rejected hit: distance ${distance.toFixed(2)} > max range ${maxRange}`);
        return;
      }

      // Calculate damage
      const damage = this.getWeaponDamage(event.weaponType);
      const wasHeadshot = false; // TODO: check hit point height for headshots

      // Apply damage
      this.applyDamage(victim, damage);

      // Broadcast damage event
      const damageEvent: DamageEvent = {
        shooterId: event.playerId,
        victimId: event.hitPlayerId,
        damage,
        wasHeadshot,
        timestamp: Date.now(),
      };
      this.onBroadcast?.('player:damaged', damageEvent);

      // Check for death
      if (victim.health <= 0) {
        shooter.kills += 1;
        victim.deaths += 1;

        const deathEvent: PlayerDeathEvent = {
          victimId: victim.id,
          killerId: shooter.id,
          weaponType: event.weaponType,
          timestamp: Date.now(),
        };
        this.onBroadcast?.('player:died', deathEvent);
        console.log(`[GameRoom] Player ${victim.username} killed by ${shooter.username}`);

        // Check win condition
        if (!this.gameOver && shooter.kills >= this.KILLS_TO_WIN) {
          this.gameOver = true;
          const gameOverEvent: GameOverEvent = {
            winnerId: shooter.id,
            winnerUsername: shooter.username,
            reason: 'kills',
            timestamp: Date.now(),
          };
          this.onBroadcast?.('game:over', gameOverEvent);
          console.log(`[GameRoom] ${shooter.username} wins! (${shooter.kills} kills)`);
        }

        // Schedule respawn after 3 seconds
        this.scheduleRespawn(victim.id);
      }
    }
  }

  /**
   * Schedule a player respawn after delay.
   */
  private scheduleRespawn(playerId: string): void {
    // Clear any existing respawn timer
    const existingTimer = this.respawnTimers.get(playerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule respawn after 3 seconds
    const timer = setTimeout(() => {
      this.respawnPlayer(playerId);
      this.respawnTimers.delete(playerId);
    }, 3000);

    this.respawnTimers.set(playerId, timer);
    console.log(`[GameRoom] Player ${playerId} will respawn in 3 seconds`);
  }

  /**
   * Respawn a player at a random spawn point.
   */
  private respawnPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // Get random spawn point
    const spawnPoint = this.getRandomSpawnPoint();

    // Reset player state
    player.health = 100;
    player.armor = 0;
    player.position = { ...spawnPoint };

    // Broadcast respawn event
    const respawnEvent: PlayerRespawnEvent = {
      playerId: player.id,
      position: spawnPoint,
      health: player.health,
      armor: player.armor,
      timestamp: Date.now(),
    };
    this.onBroadcast?.('player:respawned', respawnEvent);

    console.log(`[GameRoom] Player ${player.username} respawned at (${spawnPoint.x}, ${spawnPoint.y}, ${spawnPoint.z})`);
  }

  /**
   * Get a random spawn point.
   */
  private getRandomSpawnPoint(): { x: number; y: number; z: number } {
    const index = Math.floor(Math.random() * this.spawnPoints.length);
    return { ...this.spawnPoints[index] };
  }

  /**
   * Apply damage to a player, accounting for armor.
   */
  private applyDamage(player: ServerPlayerState, damage: number): void {
    // Armor absorbs 60% of damage
    const armorAbsorption = 0.6;
    const damageToArmor = Math.min(player.armor, damage * armorAbsorption);
    const damageToHealth = damage - damageToArmor;

    player.armor = Math.max(0, player.armor - damageToArmor);
    player.health = Math.max(0, player.health - damageToHealth);
  }

  /**
   * Calculate distance between two points.
   */
  private calculateDistance(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number }
  ): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get weapon damage values.
   */
  private getWeaponDamage(weaponType: string): number {
    const damages: Record<string, number> = {
      pistol: 25,
      rifle: 30,
      shotgun: 80,
      sniper: 100,
    };
    return damages[weaponType] ?? 25;
  }

  /**
   * Get weapon max range.
   */
  private getWeaponRange(weaponType: string): number {
    const ranges: Record<string, number> = {
      pistol: 50,
      rifle: 100,
      shotgun: 20,
      sniper: 200,
    };
    return ranges[weaponType] ?? 50;
  }

  /**
   * Get weapon minimum fire interval (ms between shots).
   */
  private getWeaponFireInterval(weaponType: string): number {
    const fireRates: Record<string, number> = {
      pistol: 3, // 3 rounds/second
      rifle: 8, // 8 rounds/second
      shotgun: 1.2, // 1.2 rounds/second
      sniper: 0.8, // 0.8 rounds/second
    };
    const rate = fireRates[weaponType] ?? 3;
    return 1000 / rate; // Convert to ms between shots
  }

  /**
   * Start the broadcast loop that sends game state to all clients.
   */
  private startBroadcastLoop(): void {
    const intervalMs = 1000 / this.updateRate;

    this.updateInterval = setInterval(() => {
      if (this.onBroadcast && this.players.size > 0) {
        const snapshot = {
          timestamp: Date.now(),
          players: this.getAllPlayerStates(),
        };
        this.onBroadcast('game:state:snapshot', snapshot);
      }
    }, intervalMs);
  }

  /**
   * Handle grenade throw event from client.
   * Validates and broadcasts to all clients for synchronized grenade physics.
   */
  handleGrenadeThrow(event: GrenadeThrowEvent): void {
    const player = this.players.get(event.playerId);
    if (!player) {
      console.log(`[GameRoom] Grenade throw from unknown player: ${event.playerId}`);
      return;
    }

    console.log(`[GameRoom] ${player.username} threw ${event.grenadeType} grenade`);

    // Broadcast grenade throw to all clients
    this.onBroadcast?.('grenade:throw', event);
  }

  /**
   * Handle grenade explosion event.
   * Calculates damage to all players in radius and broadcasts explosion.
   */
  handleGrenadeExplosion(event: GrenadeExplosionEvent): void {
    const thrower = this.players.get(event.playerId);
    if (!thrower) return;

    console.log(`[GameRoom] ${thrower.username}'s ${event.grenadeType} grenade exploded`);

    // Broadcast explosion to all clients (for visuals)
    this.onBroadcast?.('grenade:explosion', event);

    // Calculate damage to players
    if (event.grenadeType === 'frag') {
      const explosionRadius = 4;
      const explosionDamage = 80;

      this.players.forEach((victim, victimId) => {
        if (victim.health <= 0) return; // Skip dead players

        const distance = this.calculateDistance(event.position, victim.position);
        if (distance <= explosionRadius) {
          // Falloff damage (full at center, 0 at edge)
          const falloff = 1 - distance / explosionRadius;
          const damage = explosionDamage * falloff;

          // Apply damage
          this.applyDamage(victim, damage);

          // Broadcast damage event
          const damageEvent: DamageEvent = {
            shooterId: event.playerId,
            victimId,
            damage,
            wasHeadshot: false,
            timestamp: Date.now(),
          };
          this.onBroadcast?.('player:damaged', damageEvent);

          // Check for death
          if (victim.health <= 0) {
            thrower.kills += 1;
            victim.deaths += 1;

            const deathEvent: PlayerDeathEvent = {
              victimId,
              killerId: event.playerId,
              weaponType: 'pistol', // Grenade kill - use generic
              timestamp: Date.now(),
            };
            this.onBroadcast?.('player:died', deathEvent);
            console.log(`[GameRoom] Player ${victim.username} killed by ${thrower.username}'s grenade`);

            if (!this.gameOver && thrower.kills >= this.KILLS_TO_WIN) {
              this.gameOver = true;
              const gameOverEvent: GameOverEvent = {
                winnerId: thrower.id,
                winnerUsername: thrower.username,
                reason: 'kills',
                timestamp: Date.now(),
              };
              this.onBroadcast?.('game:over', gameOverEvent);
            }

            this.scheduleRespawn(victimId);
          }
        }
      });
    }
    // Gas grenades handle damage per-frame on client (based on tactical overlay)
  }

  /**
   * Handle flashlight toggle event from client.
   * Broadcasts to all clients so remote players see flashlight cone.
   */
  handleFlashlightToggle(event: FlashlightToggleEvent): void {
    const player = this.players.get(event.playerId);
    if (!player) return;

    console.log(`[GameRoom] ${player.username} flashlight: ${event.isOn ? 'ON' : 'OFF'}`);

    // Broadcast flashlight state to all clients
    this.onBroadcast?.('flashlight:toggle', event);
  }

  /**
   * Handle destructible prop destroyed event.
   * Broadcasts to all clients so everyone sees the destruction.
   */
  handleDestructibleDestroyed(event: DestructibleDestroyedEvent): void {
    console.log(`[GameRoom] Destructible ${event.type} destroyed at (${event.position.x}, ${event.position.y}, ${event.position.z})`);

    // Broadcast destruction to all clients
    this.onBroadcast?.('destructible:destroyed', event);

    // If barrel, trigger explosion damage to players
    if (event.type === 'barrel') {
      const barrelExplosionRadius = 3;
      const barrelExplosionDamage = 50;

      this.players.forEach((victim, victimId) => {
        if (victim.health <= 0) return;

        const distance = this.calculateDistance(event.position, victim.position);
        if (distance <= barrelExplosionRadius) {
          const falloff = 1 - distance / barrelExplosionRadius;
          const damage = barrelExplosionDamage * falloff;

          this.applyDamage(victim, damage);

          const damageEvent: DamageEvent = {
            shooterId: '', // No specific shooter for barrel explosions
            victimId,
            damage,
            wasHeadshot: false,
            timestamp: Date.now(),
          };
          this.onBroadcast?.('player:damaged', damageEvent);

          if (victim.health <= 0) {
            victim.deaths += 1;

            const deathEvent: PlayerDeathEvent = {
              victimId,
              killerId: '', // Killed by environment
              weaponType: 'pistol', // Environment death
              timestamp: Date.now(),
            };
            this.onBroadcast?.('player:died', deathEvent);
            console.log(`[GameRoom] Player ${victim.username} killed by barrel explosion`);
            this.scheduleRespawn(victimId);
          }
        }
      });
    }
  }

  /**
   * Stop the broadcast loop and cleanup.
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Clear all respawn timers
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }
    this.respawnTimers.clear();

    this.gameOver = false;
    this.players.clear();
  }
}
