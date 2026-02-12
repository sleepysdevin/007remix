import { Random } from "../utils/level-generator-random";
import type { PickupSpawnDef, RoomDef } from "../types/level-schema";
import type { GenerationOptions, RoomGraph } from "../types/level-generator-types";

type PickupType = 
  | 'weapon-pistol' 
  | 'weapon-rifle' 
  | 'weapon-shotgun'
  | 'ammo-pistol' 
  | 'ammo-rifle' 
  | 'ammo-shotgun'
  | 'health' 
  | 'armor'
  | 'key';

interface PickupConfig {
  minAmount: number;
  maxAmount: number;
  spawnChance: number;
  minRooms: number;
}

const PICKUP_CONFIGS: Record<PickupType, PickupConfig> = {
  'weapon-pistol': { minAmount: 1, maxAmount: 2, spawnChance: 0.95, minRooms: 1 },  // More pistols
  'weapon-rifle': { minAmount: 1, maxAmount: 2, spawnChance: 0.8, minRooms: 1 },   // More rifles
  'weapon-shotgun': { minAmount: 1, maxAmount: 1, spawnChance: 0.7, minRooms: 2 }, // New shotgun weapon
  'ammo-pistol': { minAmount: 20, maxAmount: 40, spawnChance: 1.0, minRooms: 2 },  // Ammo for pistols
  'ammo-rifle': { minAmount: 15, maxAmount: 35, spawnChance: 1.0, minRooms: 2 },   // Ammo for rifles
  'ammo-shotgun': { minAmount: 8, maxAmount: 16, spawnChance: 0.9, minRooms: 2 },  // Ammo for shotguns
  'health': { minAmount: 25, maxAmount: 60, spawnChance: 0.9, minRooms: 2 },      // Health pickups
  'armor': { minAmount: 20, maxAmount: 50, spawnChance: 0.6, minRooms: 2 },       // Slightly reduced armor
  'key': { minAmount: 1, maxAmount: 1, spawnChance: 1.0, minRooms: 1 },           // Keys for locked doors
};

export class PickupGenerator {
  private placedPickups: PickupSpawnDef[] = [];
  private minDistance = 1.5;

  constructor(private rand: Random) {}

  generatePickups(
    rooms: RoomDef[],
    doors: { id: string; type: string; keyId?: string }[],
    graph: RoomGraph,
    options: GenerationOptions
  ): PickupSpawnDef[] {
    this.placedPickups = [];
    
    const spawnRoom = rooms[0];
    // Skip the first room (player spawn) for general spread pickups.
    const candidateRooms = rooms.slice(1);
    if (candidateRooms.length === 0) return [];

    // Seed spawn area with reliable supplies so early combat starts smoother.
    if (spawnRoom) {
      this.placeSpawnRoomSupplies(spawnRoom);
    }

    // Place keys for locked doors first
    this.placeKeys(doors, candidateRooms, graph);

    // Place weapons - more weapons in the open
    this.placePickupType('weapon-pistol', candidateRooms, 2, 3);  // 2-3 pistols
    this.placePickupType('weapon-rifle', candidateRooms, 1, 2);   // 1-2 rifles
    
    // Add shotguns in later rooms
    if (rooms.length >= 3) {
      this.placePickupType('weapon-shotgun', candidateRooms, 0, 1);
    }

    // Place ammo and health - ensure multiple ammo pickups per room and more health
    this.placePickupType('ammo-pistol', candidateRooms, 2, 3); // 2-3 ammo-pistol per room
    this.placePickupType('ammo-rifle', candidateRooms, 1, 2);  // 1-2 ammo-rifle per room
    this.placePickupType('health', candidateRooms, 2, 4);     // More health pickups
    this.placePickupType('armor', candidateRooms, 1, 2);      // Keep armor as is

    return this.placedPickups;
  }

  private placeSpawnRoomSupplies(room: RoomDef): void {
    this.placePickupInRoom('ammo-pistol', room, 3, 5);
    this.placePickupInRoom('ammo-rifle', room, 2, 4);
    this.placePickupInRoom('ammo-shotgun', room, 1, 2);
    this.placePickupInRoom('health', room, 2, 4);
    this.placePickupInRoom('armor', room, 2, 3);
  }

  private placePickupInRoom(
    type: PickupType,
    room: RoomDef,
    minCount: number,
    maxCount: number,
  ): void {
    const config = PICKUP_CONFIGS[type];
    if (!config) return;
    const count = this.rand.int(minCount, maxCount);
    for (let i = 0; i < count; i++) {
      const position = this.findValidPosition(room, 16);
      if (!position) continue;
      const amount = this.rand.int(config.minAmount, config.maxAmount);
      this.placedPickups.push({
        id: `pickup_${Date.now()}_${type}_spawn_${i}`,
        type,
        x: position.x,
        y: -2,
        z: position.z,
        amount,
        roomId: room.id,
      });
    }
  }

  private placeKeys(
    doors: { id: string; type: string; keyId?: string }[],
    rooms: RoomDef[],
    graph: RoomGraph
  ) {
    const lockedDoors = doors.filter(d => d.type === 'locked' && d.keyId);
    
    for (const door of lockedDoors) {
      const keyId = door.keyId!;
      
      // Strategy: 50% chance key is in same room as door, 50% chance in different room
      const keyInSameRoom = this.rand.chance(0.5);
      
      let validRooms: RoomDef[];
      
      if (keyInSameRoom) {
        // Place key in the same room as the door (could be in container or just open)
        const doorRoom = rooms.find(room => {
          const doorLinks = graph.links.filter(l => l.doorId === door.id);
          return doorLinks.some(link => link.a === room.id || link.b === room.id);
        });
        
        if (doorRoom) {
          validRooms = [doorRoom];
        } else {
          // Fallback to different room if door room not found
          validRooms = rooms;
        }
      } else {
        // Place key in different room (traditional approach)
        validRooms = rooms.filter(room => {
          // Don't place key in the same room as the door
          const doorLinks = graph.links.filter(l => l.doorId === door.id);
          if (doorLinks.some(link => link.a === room.id || link.b === room.id)) {
            return false;
          }
          return true;
        });
      }
      
      if (validRooms.length === 0) continue;

      const room = this.rand.pick(validRooms);
      const position = this.findValidPosition(room);
      
      if (position) {
        this.placedPickups.push({
          id: `pickup_${Date.now()}_key_${keyId}`,
          type: 'key',
          keyId,
          x: position.x,
          y: -2,
          z: position.z,
          amount: 1,
          roomId: room.id,
        });
      }
    }
  }

  private placePickupType(
    type: PickupType,
    rooms: RoomDef[],
    minCount: number,
    maxCount: number
  ) {
    const config = PICKUP_CONFIGS[type];
    if (!config) return;

    const count = this.rand.int(minCount, maxCount);
    
    for (let i = 0; i < count; i++) {
      if (this.rand.float(0, 1) > config.spawnChance) continue;
      
      const room = this.rand.pick(rooms);
      const position = this.findValidPosition(room);
      
      if (position) {
        const amount = this.rand.int(config.minAmount, config.maxAmount);
        
        this.placedPickups.push({
          id: `pickup_${Date.now()}_${type}_${i}`,
          type,
          x: position.x,
          y: -2,
          z: position.z,
          amount,
          roomId: room.id,
        });
      }
    }
  }

  private findValidPosition(room: RoomDef, maxAttempts = 10) {
    const margin = 1.5;
    
    for (let i = 0; i < maxAttempts; i++) {
      const x = this.rand.float(
        room.x - room.width / 2 + margin,
        room.x + room.width / 2 - margin
      );
      
      const z = this.rand.float(
        room.z - room.depth / 2 + margin,
        room.z + room.depth / 2 - margin
      );
      
      if (!this.isTooCloseToOtherPickups(x, z)) {
        return { x, z };
      }
    }
    
    return null;
  }

  private isTooCloseToOtherPickups(x: number, z: number): boolean {
    return this.placedPickups.some(pickup => {
      const dx = pickup.x - x;
      const dz = pickup.z - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      return distance < this.minDistance;
    });
  }
}
