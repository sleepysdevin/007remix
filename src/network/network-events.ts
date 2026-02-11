/**
 * Network message type definitions for multiplayer communication.
 * These types define the structure of messages exchanged between client and server.
 */

/**
 * Message sent when a player connects to the server.
 */
export interface PlayerConnectedEvent {
  playerId: string;
  username: string;
}

/**
 * Message sent when a player disconnects from the server.
 */
export interface PlayerDisconnectedEvent {
  playerId: string;
}

/**
 * Player state update sent from client to server (20Hz).
 */
export interface PlayerStateUpdate {
  playerId: string;
  username?: string; // Set by server when broadcasting
  position: { x: number; y: number; z: number };
  rotation: number; // yaw angle in radians
  health: number;
  armor: number;
  currentWeapon: 'pistol' | 'rifle' | 'shotgun' | 'sniper';
  crouching: boolean;
  isMoving: boolean;
  timestamp: number; // performance.now()
  kills?: number;
  deaths?: number;
}

/**
 * Weapon type for kill feed and death events.
 */
export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

/**
 * Full game state snapshot broadcast from server to all clients (20Hz).
 */
export interface GameStateSnapshot {
  timestamp: number;
  players: Record<string, PlayerStateUpdate>;
}

/**
 * Weapon fire event sent from client to server.
 * Server validates hit and broadcasts damage if confirmed.
 */
export interface WeaponFireEvent {
  playerId: string;
  timestamp: number; // Client timestamp for lag compensation
  weaponType: 'pistol' | 'rifle' | 'shotgun' | 'sniper';
  origin: { x: number; y: number; z: number }; // Camera position
  direction: { x: number; y: number; z: number }; // Look direction
  hitPlayerId?: string; // Client's prediction of hit (optional)
  hitPoint?: { x: number; y: number; z: number };
}

/**
 * Damage event broadcast by server when a player is hit.
 */
export interface DamageEvent {
  shooterId: string;
  victimId: string;
  damage: number;
  wasHeadshot: boolean;
  timestamp: number;
}

/**
 * Player death event broadcast by server.
 */
export interface PlayerDeathEvent {
  victimId: string;
  killerId: string;
  weaponType?: WeaponType; // Weapon used for kill (for kill feed)
  timestamp: number;
}

/**
 * Player respawn event broadcast by server.
 */
export interface PlayerRespawnEvent {
  playerId: string;
  position: { x: number; y: number; z: number };
  health: number;
  armor: number;
  timestamp: number;
}

/**
 * Grenade throw event sent from client to server.
 */
export interface GrenadeThrowEvent {
  playerId: string;
  timestamp: number;
  grenadeType: 'gas' | 'frag';
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

/**
 * Grenade explosion event broadcast by server.
 */
export interface GrenadeExplosionEvent {
  playerId: string; // Who threw it
  timestamp: number;
  grenadeType: 'gas' | 'frag';
  position: { x: number; y: number; z: number };
}

/**
 * Flashlight toggle event.
 */
export interface FlashlightToggleEvent {
  playerId: string;
  isOn: boolean;
  timestamp: number;
}

/**
 * Destructible prop destroyed event.
 */
export interface DestructibleDestroyedEvent {
  propId: string; // Unique ID for the prop
  position: { x: number; y: number; z: number };
  type: 'crate' | 'crate_metal' | 'barrel';
  timestamp: number;
}

/**
 * Game over event - winner reached kill limit or time ran out.
 */
export interface GameOverEvent {
  winnerId: string;
  winnerUsername: string;
  reason: 'kills' | 'time'; // kills = first to X, time = match timer ended
  timestamp: number;
}

/**
 * Event types for Socket.IO communication.
 */
export enum NetworkEventType {
  // Connection events
  PLAYER_CONNECTED = 'player:connected',
  PLAYER_DISCONNECTED = 'player:disconnected',

  // State sync events
  PLAYER_STATE_UPDATE = 'player:state:update',
  GAME_STATE_SNAPSHOT = 'game:state:snapshot',

  // Combat events (Phase 3)
  WEAPON_FIRE = 'weapon:fire',
  PLAYER_DAMAGED = 'player:damaged',
  PLAYER_DIED = 'player:died',
  PLAYER_RESPAWNED = 'player:respawned',

  // Equipment events (Phase 5)
  GRENADE_THROW = 'grenade:throw',
  GRENADE_EXPLOSION = 'grenade:explosion',
  FLASHLIGHT_TOGGLE = 'flashlight:toggle',
  DESTRUCTIBLE_DESTROYED = 'destructible:destroyed',

  // Game mode (Phase 4)
  GAME_OVER = 'game:over',
}
