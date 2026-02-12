import type { LevelSchema, RoomDef, DoorDef, EnemySpawnDef, PickupSpawnDef, ObjectiveDef, TriggerDef, PropDef, SpawnDef } from "./level-schema";

export interface GenerationOptions {
  minRooms: number;
  maxRooms: number;
  minEnemies: number;
  maxEnemies: number;
  difficulty: "easy" | "medium" | "hard";
  seed?: number;
}

export type DoorAxis = "x" | "z";

export interface DoorLink {
  doorId: string;
  a: string;
  b: string;
}

export interface RoomGraph {
  links: DoorLink[];
  adjAll: Map<string, Set<string>>;
  adjUnlocked: Map<string, Set<string>>;
  mainPathEdges: Array<[string, string]>;
}

export interface Hotspot {
  x: number;
  z: number;
  roomId: string;
  weight: number;
}

export type Issue =
  | { kind: "MISSING_MAINPATH_UNLCK"; a: string; b: string }
  | { kind: "KEY_MISSING"; doorId: string; keyId: string }
  | { kind: "KEY_BAD_ROOM"; doorId: string; keyId: string; reason: "SPAWN" | "SAME_AS_DOOR" | "INACCESSIBLE" }
  | { kind: "TOO_FEW_VISIBLE_NONKEY" }
  | { kind: "NO_ACCESSIBLE_WEAPON" }
  | { kind: "ROOMS_OVERLAP"; a: string; b: string }
  | { kind: "DOORS_OVERLAP"; a: string; b: string };

export interface Counters {
  room: number;
  door: number;
  enemy: number;
  pickup: number;
  objective: number;
  trigger: number;
}

export interface BuildState {
  rooms: RoomDef[];
  doors: DoorDef[];
  graph: RoomGraph;
  playerSpawn: SpawnDef;
  enemies: EnemySpawnDef[];
  pickups: PickupSpawnDef[];
  objectives: ObjectiveDef[];
  triggers: TriggerDef[];
  props: PropDef[];
}

export interface Occupied {
  x: number;
  z: number;
  y: number;
  r: number;
}

export interface RoomGeometry {
  x: number;
  z: number;
  axis: DoorAxis;
  width: number;
}

export const DEFAULT_OPTIONS: Omit<GenerationOptions, "seed"> = {
  minRooms: 6,
  maxRooms: 12,
  minEnemies: 3,
  maxEnemies: 8,
  difficulty: "medium",
};

export const ROOM_TYPES = [
  { width: 12, depth: 16, height: 4 },
  { width: 16, depth: 20, height: 4 },
  { width: 20, depth: 24, height: 4 },
  { width: 14, depth: 14, height: 4 },
] as const;

export const FLOOR_COLORS = [4473941, 4210768, 4535600, 3352388, 3158304, 3487029, 3361587] as const;
export const WALL_COLORS = [5592422, 5259872, 5591616, 4473941, 4210768, 4541765, 4483652] as const;

export const KEY_COLORS = ["red", "blue", "green"] as const;
