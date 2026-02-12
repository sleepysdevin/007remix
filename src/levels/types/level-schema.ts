/**
 * TypeScript types for level JSON format.
 * Used by level-loader and level-builder for multi-room facility levels.
 */

export interface LevelSchema {
  /** Level display name */
  name: string;
  /** Brief description for briefing screen */
  briefing: string;
  /** Axis-aligned rooms (floor + walls built from these) */
  rooms: RoomDef[];
  /** Doors between or within rooms */
  doors: DoorDef[];
  /** Player spawn position */
  playerSpawn: SpawnDef;
  /** Enemies with optional patrol waypoints */
  enemies: EnemySpawnDef[];
  /** Pickups (ammo, health, keys, etc.) */
  pickups: PickupSpawnDef[];
  /** Mission objectives (completed via triggers or scripting) */
  objectives: ObjectiveDef[];
  /** Trigger zones (complete objectives, unlock doors) */
  triggers: TriggerDef[];
  /** Static props (crates, barrels) */
  props?: PropDef[];
}

export interface RoomDef {
  id: string;
  /** Center position */
  x: number;
  y: number;
  z: number;
  /** Full width (X), depth (Z), height (Y) */
  width: number;
  depth: number;
  height: number;
  /** Optional material tint (hex) */
  floorColor?: number;
  wallColor?: number;
}

export type DoorType = 'proximity' | 'locked';

export interface DoorDef {
  id: string;
  /** Position (center of door opening) */
  x: number;
  y: number;
  z: number;
  /** Opening size: width (horizontal), height (vertical). Depth is small. */
  width: number;
  height: number;
  /** Slide direction: 'x' or 'z' */
  axis: 'x' | 'z';
  type: DoorType;
  /** Required key id for locked doors */
  keyId?: string;
  /** Proximity radius for auto-open (proximity doors) */
  proximityRadius?: number;
  /** List of objective IDs that must be complete before this door opens */
  requireObjectives?: string[];
}

export interface SpawnDef {
  x: number;
  y: number;
  z: number;
  /** Facing angle in radians (0 = looking along positive Z) */
  facingAngle?: number;
}

export interface EnemySpawnDef {
  id: string;
  type: 'guard' | 'soldier' | 'officer';
  x: number;
  y: number;
  z: number;
  /** ID of the room this enemy is in */
  roomId: string;
  facingAngle: number;
  health: number;
  speed: number;
  alertRadius: number;
  fov: number;
  /** Optional patrol waypoints (x, z). Enemy walks between these when idle. */
  waypoints?: { x: number; z: number }[];
  /** Enemy variant type (same as type, kept for backward compatibility) */
  variant?: 'guard' | 'soldier' | 'officer';
  /** Full variant data for enemy appearance */
  variantData?: {
    uniformColor: string;
    vestColor: string;
    skinTone: string;
    headgear: string;
    name: string;
  };
}

export interface PickupSpawnDef {
  /** Unique identifier for the pickup */
  id: string;
  /** Type of pickup ('key', 'weapon-pistol', 'weapon-rifle', 'ammo-pistol', 'ammo-rifle', 'health', 'armor') */
  type: string;
  /** X position in world space */
  x: number;
  /** Y position in world space */
  y: number;
  /** Z position in world space */
  z: number;
  /** Number of items (for ammo, health, etc.) */
  amount?: number;
  /** For key pickups: key id (e.g. 'red', 'blue') */
  keyId?: string;
  /** Optional room ID where this pickup is located */
  roomId?: string;
}

export interface ObjectiveDef {
  id: string;
  title: string;
  /** Trigger id that completes this objective when entered */
  triggerId?: string;
}

export interface TriggerDef {
  id: string;
  /** Box center */
  x: number;
  y: number;
  z: number;
  /** Half-extents */
  halfWidth: number;
  halfDepth: number;
  halfHeight: number;
  /** Event when player enters: 'objective:complete:<id>' or 'door:unlock:<id>' */
  onEnter: string;
  /** One-shot (fire once) or repeat */
  once?: boolean;
  /** List of objective IDs that must be completed before this trigger becomes active */
  requireObjectives?: string[];
  /** Whether this trigger is the level exit */
  isExit?: boolean;
}

export interface PropLoot {
  type: string;
  amount?: number;
}

export type PropType = 
  | 'crate' 
  | 'barrel' 
  | 'crate_metal' 
  | 'crate_wood' 
  | 'crate_ammo' 
  | 'crate_medical' 
  | 'barrel_metal' 
  | 'barrel_toxic' 
  | 'barrel_explosive'
  | 'crate_explosive'
  | 'weapon_pistol'
  | 'weapon_rifle'
  | 'weapon_shotgun';

export interface PropDef {
  type: PropType;
  x: number;
  y: number;
  z: number;
  scale?: number;
  rotY?: number;
  health?: number;
  loot?: {
    type: string;
    amount: number;
  };
}
