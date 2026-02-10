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
}

export interface EnemySpawnDef {
  x: number;
  y: number;
  z: number;
  facingAngle: number;
  /** Optional patrol waypoints (x, z). Enemy walks between these when idle. */
  waypoints?: { x: number; z: number }[];
  /** Optional variant: 'guard', 'soldier', 'officer'. Default: 'guard'. */
  variant?: string;
}

export interface PickupSpawnDef {
  type: string;
  x: number;
  y: number;
  z: number;
  amount?: number;
  /** For key pickups: key id (e.g. 'red', 'blue') */
  keyId?: string;
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
}

export interface PropLoot {
  type: string;
  amount?: number;
}

export interface PropDef {
  type: 'crate' | 'barrel' | 'crate_metal';
  x: number;
  y: number;
  z: number;
  /** Optional scale */
  scale?: number;
  /** Loot dropped when destroyed */
  loot?: PropLoot;
}
