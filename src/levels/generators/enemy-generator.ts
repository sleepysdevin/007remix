import { Random } from "../utils/level-generator-random";
import type { EnemySpawnDef, RoomDef } from "../types/level-schema";
import type { GenerationOptions } from "../types/level-generator-types";
import { GUARD_VARIANTS } from "../../enemies/sprite/guard-sprite-sheet";

type EnemyType = 'guard' | 'soldier' | 'officer';

interface EnemyConfig {
  health: number;
  speed: number;
  alertRadius: number;
  fov: number;
  waypointChance: number;
  minWaypoints: number;
  maxWaypoints: number;
}

const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
  guard: {
    health: 38,
    speed: 1.05,
    alertRadius: 9,
    fov: Math.PI * 0.7,
    waypointChance: 0.4,
    minWaypoints: 1,
    maxWaypoints: 2,
  },
  soldier: {
    health: 50,
    speed: 1.1,
    alertRadius: 10,
    fov: Math.PI * 0.75,
    waypointChance: 0.5,
    minWaypoints: 1,
    maxWaypoints: 3,
  },
  officer: {
    health: 65,
    speed: 0.95,
    alertRadius: 11,
    fov: Math.PI * 0.8,
    waypointChance: 0.6,
    minWaypoints: 2,
    maxWaypoints: 4,
  },
};

export class EnemyGenerator {
  constructor(private rand: Random) {}

  generateEnemies(
    rooms: RoomDef[],
    options: GenerationOptions
  ): EnemySpawnDef[] {
    const enemies: EnemySpawnDef[] = [];
    
    console.log(`[EnemyGenerator] Total rooms: ${rooms.length}`);
    
    // Skip the first room (player spawn)
    const candidateRooms = rooms.slice(1).filter(r => r.width >= 5 && r.depth >= 5);
    console.log(`[EnemyGenerator] Candidate rooms for enemies: ${candidateRooms.length}`);
    if (candidateRooms.length === 0) return enemies;

    const minPerRoom = 4;

    const roomEnemyCounts = new Map<string, number>();
    const roomCaps = new Map<string, number>();
    let totalCapacity = 0;
    for (const room of candidateRooms) {
      const cap = this.roomEnemyCap(room, options.difficulty);
      roomEnemyCounts.set(room.id, 0);
      roomCaps.set(room.id, cap);
      totalCapacity += cap;
    }

    // Enforce "at least 2 enemies per room" for all candidate rooms.
    const minRequired = candidateRooms.length * minPerRoom;
    const minEnemies = Math.max(minRequired, Math.max(0, Math.min(options.minEnemies, options.maxEnemies)));
    const maxEnemies = Math.max(minEnemies, options.maxEnemies);
    const requestedTotal = this.rand.int(minEnemies, maxEnemies);
    const targetTotal = Math.min(requestedTotal, totalCapacity);

    // Pass 1: guarantee minimum per-room population.
    for (const room of candidateRooms) {
      for (let i = 0; i < minPerRoom; i++) {
        let enemy = this.spawnEnemyInRoom(room, enemies, options.difficulty, 1.8);
        if (!enemy) enemy = this.spawnEnemyInRoom(room, enemies, options.difficulty, 1.2);
        if (!enemy) enemy = this.spawnEnemyInRoom(room, enemies, options.difficulty, 0.8);
        if (!enemy) {
          console.warn(`[EnemyGenerator] Failed to place minimum enemy ${i + 1}/${minPerRoom} in room ${room.id}, forcing relaxed spawn`);
          enemy = this.spawnEnemyInRoom(room, enemies, options.difficulty, 0.4);
          if (!enemy) continue;
        }
        enemies.push(enemy);
        roomEnemyCounts.set(room.id, (roomEnemyCounts.get(room.id) ?? 0) + 1);
      }
    }

    const maxAttempts = Math.max(20, targetTotal * 14);
    let attempts = 0;

    while (enemies.length < targetTotal && attempts < maxAttempts) {
      attempts++;
      const room = this.pickRoomForSpawn(candidateRooms, roomEnemyCounts, roomCaps);
      if (!room) break;

      const enemy = this.spawnEnemyInRoom(room, enemies, options.difficulty, 2.0);
      if (!enemy) continue;

      enemies.push(enemy);
      roomEnemyCounts.set(room.id, (roomEnemyCounts.get(room.id) ?? 0) + 1);
    }

    console.log(
      `[EnemyGenerator] Spawned ${enemies.length}/${targetTotal} enemies (requested range: ${minEnemies}-${maxEnemies})`
    );
    
    return enemies;
  }

  private roomEnemyCap(room: RoomDef, difficulty: 'easy' | 'medium' | 'hard'): number {
    const roomSize = room.width * room.depth;
    let cap = 4; // at least 4 in each room
    if (roomSize > 160) cap += 1;
    if (roomSize > 280) cap += 1;
    if (difficulty === 'hard') cap += 1;
    return Math.min(cap, 7); // hard cap per room (+2 from previous setting)
  }

  private pickRoomForSpawn(
    rooms: RoomDef[],
    roomEnemyCounts: Map<string, number>,
    roomCaps: Map<string, number>,
  ): RoomDef | null {
    const eligible: Array<{ room: RoomDef; weight: number }> = [];
    let totalWeight = 0;

    for (const room of rooms) {
      const count = roomEnemyCounts.get(room.id) ?? 0;
      const cap = roomCaps.get(room.id) ?? 0;
      const free = cap - count;
      if (free <= 0) continue;
      const weight = (room.width * room.depth) * free;
      totalWeight += weight;
      eligible.push({ room, weight });
    }

    if (eligible.length === 0 || totalWeight <= 0) return null;

    let roll = this.rand.float(0, totalWeight);
    for (const item of eligible) {
      roll -= item.weight;
      if (roll <= 0) return item.room;
    }
    return eligible[eligible.length - 1].room;
  }

  private spawnEnemyInRoom(
    room: RoomDef,
    enemies: EnemySpawnDef[],
    difficulty: 'easy' | 'medium' | 'hard',
    minEnemySpacing: number,
  ): EnemySpawnDef | null {
    const type = this.chooseEnemyType(difficulty);
    const config = ENEMY_CONFIGS[type];
    
    // Calculate position within room bounds with margin
    const margin = Math.min(2.2, Math.max(1.0, Math.min(room.width, room.depth) * 0.18));
    const maxAttempts = 28;
    let validPosition = false;
    let x = 0;
    let z = 0;
    
    // Try to find a valid position that doesn't overlap with room boundaries
    for (let attempt = 0; attempt < maxAttempts && !validPosition; attempt++) {
      x = this.rand.float(
        room.x - room.width / 2 + margin,
        room.x + room.width / 2 - margin
      );
      
      z = this.rand.float(
        room.z - room.depth / 2 + margin,
        room.z + room.depth / 2 - margin
      );
      
      // Validate position is within room bounds
      const halfWidth = room.width / 2;
      const halfDepth = room.depth / 2;
      const inBounds = Math.abs(x - room.x) <= halfWidth - margin && 
                       Math.abs(z - room.z) <= halfDepth - margin;
      
      const noOverlap = this.isPositionClearOfEnemies(x, z, room.id, enemies, minEnemySpacing);

      if (inBounds && noOverlap) {
        validPosition = true;
      }
    }
    
    if (!validPosition) {
      console.warn(`[EnemyGenerator] Could not find valid position for enemy in room ${room.id}, skipping spawn`);
      return null;
    }

    // Add some random variation to stats
    const health = Math.round(config.health * (0.9 + this.rand.float(0, 0.2)));
    const speed = config.speed * (0.9 + this.rand.float(0, 0.2));
    const alertRadius = config.alertRadius * (0.9 + this.rand.float(0, 0.2));
    const fov = config.fov * (0.9 + this.rand.float(0, 0.2));

    const variant = GUARD_VARIANTS[type];
    
    // Calculate Y position based on room floor (room.y is center, so floor is at y - height/2)
    // Add a small offset to ensure we're above the floor for the raycast
    const floorY = room.y - (room.height / 2);
    const enemyY = floorY + 0.1; // Start slightly above the floor
    
    const enemy: EnemySpawnDef = {
      id: `enemy_${Date.now()}_${enemies.length}`,
      type,
      x,
      y: enemyY, // Position just above the floor
      z,
      roomId: room.id,
      facingAngle: this.rand.float(0, Math.PI * 2),
      health,
      speed,
      alertRadius,
      fov,
      variant: type,
      variantData: {
        uniformColor: variant.uniformColor,
        vestColor: variant.vestColor,
        skinTone: variant.skinTone,
        headgear: variant.headgear,
        name: variant.name
      }
    };
    
    console.log(`[EnemyGenerator] Spawned ${type} enemy at (${x}, ${enemy.y}, ${z}) in room ${room.id} (bounds: ${room.width}x${room.depth})`);

    // Add waypoints for patrolling
    if (this.rand.chance(config.waypointChance)) {
      const waypointCount = this.rand.int(config.minWaypoints, config.maxWaypoints);
      enemy.waypoints = this.generateWaypoints(room, waypointCount, margin);
    }

    return enemy;
  }

  private isPositionClearOfEnemies(
    x: number,
    z: number,
    roomId: string,
    enemies: EnemySpawnDef[],
    minSpacing: number,
  ): boolean {
    const minSpacingSq = minSpacing * minSpacing;
    for (const e of enemies) {
      if (e.roomId !== roomId) continue;
      const dx = x - e.x;
      const dz = z - e.z;
      if ((dx * dx + dz * dz) < minSpacingSq) return false;
    }
    return true;
  }

  private chooseEnemyType(difficulty: 'easy' | 'medium' | 'hard'): EnemyType {
    const weights = {
      easy: { guard: 0.6, soldier: 0.3, officer: 0.1 },
      medium: { guard: 0.4, soldier: 0.5, officer: 0.1 },
      hard: { guard: 0.2, soldier: 0.5, officer: 0.3 },
    }[difficulty];

    const roll = this.rand.float(0, 1);
    if (roll < weights.guard) return 'guard';
    if (roll < weights.guard + weights.soldier) return 'soldier';
    return 'officer';
  }

  private generateWaypoints(room: RoomDef, count: number, margin: number) {
    const waypoints = [];
    
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      let validPosition = false;
      const maxAttempts = 5;
      
      // Try to find valid waypoint position
      for (let attempt = 0; attempt < maxAttempts && !validPosition; attempt++) {
        x = this.rand.float(
          room.x - room.width / 2 + margin,
          room.x + room.width / 2 - margin
        );
        z = this.rand.float(
          room.z - room.depth / 2 + margin,
          room.z + room.depth / 2 - margin
        );
        
        // Validate waypoint is within room bounds
        const halfWidth = room.width / 2;
        const halfDepth = room.depth / 2;
        const inBounds = Math.abs(x - room.x) <= halfWidth - margin && 
                         Math.abs(z - room.z) <= halfDepth - margin;
        
        if (inBounds) {
          validPosition = true;
        }
      }
      
      // Fallback to room center if no valid position found
      if (!validPosition) {
        x = room.x;
        z = room.z;
      }
      
      waypoints.push({ x, z });
    }
    
    return waypoints;
  }
}
