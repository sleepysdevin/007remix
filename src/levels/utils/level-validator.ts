import type { LevelSchema, RoomDef, DoorDef, EnemySpawnDef, PickupSpawnDef, ObjectiveDef } from "../types/level-schema";
import type { RoomGraph } from "../types/level-generator-types";
import { Random } from "./level-generator-random";

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  fixedIssues: string[];
}

export class LevelValidator {
  constructor(private rand: Random) {}

  validateAndRepair(level: LevelSchema, graph: RoomGraph): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      issues: [],
      fixedIssues: []
    };

    // 1. Validate rooms
    this.validateRooms(level, result);
    
    // 2. Validate doors
    this.validateDoors(level, graph, result);
    
    // 3. Validate enemies
    this.validateEnemies(level, result);
    
    // 4. Validate pickups
    this.validatePickups(level, result);
    
    // 5. Validate objectives
    this.validateObjectives(level, result);
    
    // 6. Validate player spawn
    this.validatePlayerSpawn(level, result);
    
    // 7. Validate graph connectivity
    this.validateConnectivity(level, graph, result);

    result.isValid = result.issues.length === 0;
    return result;
  }

  private validateRooms(level: LevelSchema, result: ValidationResult) {
    // Check for overlapping rooms
    for (let i = 0; i < level.rooms.length; i++) {
      for (let j = i + 1; j < level.rooms.length; j++) {
        if (this.areRoomsOverlapping(level.rooms[i], level.rooms[j])) {
          result.issues.push(`Rooms ${level.rooms[i].id} and ${level.rooms[j].id} are overlapping`);
          // Try to fix by moving the second room
          this.moveRoomAway(level.rooms[j], level.rooms[i]);
          result.fixedIssues.push(`Moved room ${level.rooms[j].id} to resolve overlap with ${level.rooms[i].id}`);
        }
      }
    }
  }

  private validateDoors(level: LevelSchema, graph: RoomGraph, result: ValidationResult) {
    const orphanedDoors: DoorDef[] = [];
    
    // Doors in the schema don't directly reference rooms, so we'll need to check if any room contains the door position
    level.doors.forEach(door => {
      const doorInRoom = level.rooms.some(room => 
        this.isPointInRoom(door.x, door.z, room, 0.1)
      );
      
      if (!doorInRoom) {
        orphanedDoors.push(door);
        result.issues.push(`Door ${door.id} is not inside any room`);
      }
    });
    
    // Remove orphaned doors
    if (orphanedDoors.length > 0) {
      level.doors = level.doors.filter(door => !orphanedDoors.includes(door));
      result.fixedIssues.push(`Removed ${orphanedDoors.length} orphaned doors`);
    }
  }

  private validateEnemies(level: LevelSchema, result: ValidationResult) {
    // Check if enemies are placed within room bounds
    const invalidEnemies: EnemySpawnDef[] = [];
    
    level.enemies.forEach(enemy => {
      const room = level.rooms.find(r => r.id === enemy.roomId);
      if (!room || !this.isPointInRoom(enemy.x, enemy.z, room, 1.5)) {
        invalidEnemies.push(enemy);
        result.issues.push(`Enemy ${enemy.id} is outside room bounds`);
      }
    });
    
    // Try to fix invalid enemy positions
    invalidEnemies.forEach(enemy => {
      const room = level.rooms.find(r => r.id === enemy.roomId);
      if (room) {
        const pos = this.findValidPositionInRoom(room, 1.5);
        if (pos) {
          enemy.x = pos.x;
          enemy.z = pos.z;
          result.fixedIssues.push(`Repositioned enemy ${enemy.id} inside room ${room.id}`);
        } else {
          // If we can't find a valid position, remove the enemy
          level.enemies = level.enemies.filter(e => e !== enemy);
          result.fixedIssues.push(`Removed enemy ${enemy.id} from invalid position`);
        }
      }
    });
  }

  private validatePickups(level: LevelSchema, result: ValidationResult) {
    // Check if pickups are placed within room bounds
    const invalidPickups: PickupSpawnDef[] = [];
    
    level.pickups.forEach(pickup => {
      const room = level.rooms.find(r => r.id === pickup.roomId);
      if (!room || !this.isPointInRoom(pickup.x, pickup.z, room, 0.5)) {
        invalidPickups.push(pickup);
        result.issues.push(`Pickup ${pickup.type} is outside room bounds`);
      }
    });
    
    // Try to fix invalid pickup positions
    invalidPickups.forEach(pickup => {
      const room = level.rooms.find(r => r.id === pickup.roomId);
      if (room) {
        const pos = this.findValidPositionInRoom(room, 0.5);
        if (pos) {
          pickup.x = pos.x;
          pickup.z = pos.z;
          result.fixedIssues.push(`Repositioned pickup ${pickup.type} inside room ${room.id}`);
        } else {
          // If we can't find a valid position, remove the pickup
          level.pickups = level.pickups.filter(p => p !== pickup);
          result.fixedIssues.push(`Removed pickup ${pickup.type} from invalid position`);
        }
      }
    });
  }

  private validateObjectives(level: LevelSchema, result: ValidationResult) {
    // Check if all objectives have associated triggers
    level.objectives.forEach(obj => {
      const hasTrigger = level.triggers.some(t => 
        t.onEnter?.includes(`objective:complete:${obj.id}`)
      );
      
      if (!hasTrigger) {
        result.issues.push(`Objective ${obj.id} has no associated trigger`);
        // Try to add a trigger in a random room
        if (level.rooms.length > 0) {
          const room = this.rand.pick(level.rooms);
          level.triggers.push({
            id: `trigger_${obj.id}`,
            x: room.x,
            y: 0,
            z: room.z,
            halfWidth: 2,
            halfHeight: 2,
            halfDepth: 2,
            onEnter: `objective:complete:${obj.id}`,
            once: true
          });
          result.fixedIssues.push(`Added trigger for objective ${obj.id}`);
        }
      }
    });
  }

  private validatePlayerSpawn(level: LevelSchema, result: ValidationResult) {
    if (!level.playerSpawn) {
      result.issues.push("No player spawn point set");
      
      // Try to set spawn in the first room
      if (level.rooms.length > 0) {
        const room = level.rooms[0];
        level.playerSpawn = {
          x: room.x,
          y: 0,
          z: room.z - room.depth / 4
        };
        result.fixedIssues.push("Set player spawn in the first room");
      }
    }
  }

  private validateConnectivity(level: LevelSchema, graph: RoomGraph, result: ValidationResult) {
    // Check if all rooms are reachable from the start room
    if (level.rooms.length === 0) return;
    
    // Since doors don't directly reference rooms, we'll use spatial proximity
    // to determine connectivity based on door positions
    const visited = new Set<string>();
    const queue = [level.rooms[0].id];
    
    while (queue.length > 0) {
      const roomId = queue.shift()!;
      if (visited.has(roomId)) continue;
      
      visited.add(roomId);
      const currentRoom = level.rooms.find(r => r.id === roomId);
      if (!currentRoom) continue;
      
      // Find all doors in or near this room
      const nearbyDoors = level.doors.filter(door => 
        this.isPointInRoom(door.x, door.z, currentRoom, 2.0) // Slightly outside room bounds
      );
      
      // Find other rooms that share these doors
      level.rooms.forEach(otherRoom => {
        if (otherRoom.id === roomId) return;
        
        // If any door is between these rooms, they're connected
        const hasConnectingDoor = nearbyDoors.some(door => 
          this.isPointInRoom(door.x, door.z, otherRoom, 2.0)
        );
        
        if (hasConnectingDoor && !visited.has(otherRoom.id)) {
          queue.push(otherRoom.id);
        }
      });
    }
    
    if (visited.size < level.rooms.length) {
      const unreachableRooms = level.rooms.filter(r => !visited.has(r.id));
      result.issues.push(`Found ${unreachableRooms.length} unreachable rooms`);
      
      // Try to fix by adding doors to connect unreachable rooms
      unreachableRooms.forEach(room => {
        // Find the closest reachable room
        let closestRoom = level.rooms[0];
        let minDist = Infinity;
        
        level.rooms.forEach(r => {
          if (visited.has(r.id)) {
            const dist = this.getRoomDistance(room, r);
            if (dist < minDist) {
              minDist = dist;
              closestRoom = r;
            }
          }
        });
        
        // Add a door between the rooms
        if (closestRoom) {
          level.doors.push({
            id: `door_repair_${room.id}_${closestRoom.id}`,
            type: 'proximity',
            x: (room.x + closestRoom.x) / 2,
            y: 0,
            z: (room.z + closestRoom.z) / 2,
            rotationY: Math.atan2(closestRoom.z - room.z, closestRoom.x - room.x),
            axis: Math.abs(closestRoom.x - room.x) > Math.abs(closestRoom.z - room.z) ? 'x' : 'z',
            width: 1.5,
            height: 2.5,
            proximityRadius: 2.0
          });
          
          result.fixedIssues.push(`Added door to connect unreachable room ${room.id} to ${closestRoom.id}`);
          // Add to visited to prevent duplicate fixes
          visited.add(room.id);
        }
      });
    }
  }

  private areRoomsOverlapping(a: RoomDef, b: RoomDef): boolean {
    return (
      Math.abs(a.x - b.x) * 2 < (a.width + b.width) &&
      Math.abs(a.z - b.z) * 2 < (a.depth + b.depth)
    );
  }

  private moveRoomAway(room: RoomDef, other: RoomDef) {
    const dx = room.x - other.x;
    const dz = room.z - other.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const minDist = (room.width + other.width + room.depth + other.depth) / 4;
    const moveX = (dx / dist) * minDist * 1.1;
    const moveZ = (dz / dist) * minDist * 1.1;
    
    room.x = other.x + moveX;
    room.z = other.z + moveZ;
  }

  private isPointInRoom(x: number, z: number, room: RoomDef, margin: number): boolean {
    return (
      x >= room.x - room.width / 2 + margin &&
      x <= room.x + room.width / 2 - margin &&
      z >= room.z - room.depth / 2 + margin &&
      z <= room.z + room.depth / 2 - margin
    );
  }

  private findValidPositionInRoom(room: RoomDef, radius: number): { x: number; z: number } | null {
    const maxAttempts = 20;
    
    for (let i = 0; i < maxAttempts; i++) {
      const x = this.rand.float(
        room.x - room.width / 2 + radius,
        room.x + room.width / 2 - radius
      );
      
      const z = this.rand.float(
        room.z - room.depth / 2 + radius,
        room.z + room.depth / 2 - radius
      );
      
      if (this.isPointInRoom(x, z, room, radius)) {
        return { x, z };
      }
    }
    
    return null;
  }

  private getRoomDistance(a: RoomDef, b: RoomDef): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
