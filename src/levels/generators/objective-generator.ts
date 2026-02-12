import { Random } from "../utils/level-generator-random";
import type { ObjectiveDef, TriggerDef } from "../types/level-schema";
import type { RoomDef } from "../types/level-schema";
import type { RoomGraph } from "../types/level-generator-types";
 
export class ObjectiveGenerator {
  constructor(private rand: Random) {}
 
  generateObjectives(rooms: RoomDef[], graph: RoomGraph): { 
    objectives: ObjectiveDef[]; 
    triggers: TriggerDef[] 
  } {
    const objectives: ObjectiveDef[] = [];
    const triggers: TriggerDef[] = [];
    let objectiveCount = 1;
 
    // 1. Main objective: Eliminate all enemies
    const eliminateObjective = this.createObjective(`Eliminate all hostiles`);
    objectives.push(eliminateObjective);
 
    // 2. Secondary objective: Find intel (placed in a room far from start)
    if (rooms.length > 3) {
      const intelObjective = this.createObjective(`Retrieve classified intelligence`);
      const intelRoom = this.findDistantRoom(rooms[0], rooms, 3);
      
      if (intelRoom) {
        const intelTrigger = this.createIntelTrigger(
          `trigger_intel_${objectiveCount++}`, 
          intelRoom,
          intelObjective.id
        );
        triggers.push(intelTrigger);
        objectives.push(intelObjective);
      }
    }

    // 3. Create exit door (initially locked)
    const exitRoom = this.findDistantRoom(rooms[0], rooms, 2, true);
    if (exitRoom) {
      // Add exit door trigger (will be unlocked when all other objectives are complete)
      const exitObjective = this.createObjective(`Escape through the exit`);
      const exitTrigger = this.createExitTrigger(
        `trigger_exit_${objectiveCount++}`,
        exitRoom,
        exitObjective.id,
        objectives.map(obj => obj.id).filter(id => id !== exitObjective.id) // All other objectives must be complete
      );
      triggers.push(exitTrigger);
      objectives.push(exitObjective);
    }
 
    return { objectives, triggers };
  }
 
  private createObjective(title: string): ObjectiveDef {
    return {
      id: `obj_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title,
    };
  }
 
  private createIntelTrigger(id: string, room: RoomDef, objectiveId: string): TriggerDef {
    return {
      id,
      x: room.x,
      y: 0,
      z: room.z,
      halfWidth: room.width / 2 - 1,
      halfDepth: room.depth / 2 - 1,
      halfHeight: 2,
      onEnter: `objective:complete:${objectiveId}`,
      once: true
    };
  }

  private createExitTrigger(id: string, room: RoomDef, objectiveId: string, requiredObjectives: string[]): TriggerDef {
    return {
      id,
      x: room.x,
      y: 0,
      z: room.z,
      halfWidth: room.width / 2 - 1,
      halfDepth: room.depth / 2 - 1,
      halfHeight: 2.5,
      onEnter: `objective:complete:${objectiveId},mission:complete`,
      once: true,
      requireObjectives: requiredObjectives,
      isExit: true
    };
  }
 
  private createExtractionTrigger(
    id: string,
    room: RoomDef,
    objectiveId: string
  ): TriggerDef {
    return {
      id,
      x: room.x,
      y: 0,
      z: room.z - room.depth / 3, // Place near the edge of the room
      halfWidth: 3,
      halfHeight: 3,
      halfDepth: 2,
      onEnter: `objective:complete:${objectiveId}`,
      once: true,
    };
  }
 
  private findDistantRoom(
    startRoom: RoomDef,
    allRooms: RoomDef[],
    minDistance: number,
    preferEdge = false
  ): RoomDef | null {
    // Simple implementation: find a room that's at least minDistance rooms away
    const visited = new Set<string>([startRoom.id]);
    const queue: { room: RoomDef; distance: number }[] = [{ room: startRoom, distance: 0 }];
    const candidates: RoomDef[] = [];
 
    while (queue.length > 0) {
      const { room, distance } = queue.shift()!;
      
      if (distance >= minDistance) {
        // If we prefer edge rooms, check if this room has fewer connections
        if (!preferEdge || this.isEdgeRoom(room, allRooms)) {
          candidates.push(room);
        }
      }
 
      // Add connected rooms to the queue
      const connectedRooms = this.getConnectedRooms(room, allRooms);
      for (const connected of connectedRooms) {
        if (!visited.has(connected.id)) {
          visited.add(connected.id);
          queue.push({ room: connected, distance: distance + 1 });
        }
      }
    }
 
    return candidates.length > 0 
      ? this.rand.pick(candidates) 
      : allRooms.length > 1 
        ? this.rand.pick(allRooms.filter(r => r.id !== startRoom.id))
        : null;
  }
 
  private isEdgeRoom(room: RoomDef, allRooms: RoomDef[]): boolean {
    const connectedCount = this.getConnectedRooms(room, allRooms).length;
    return connectedCount <= 2; // Edge rooms typically have 1-2 connections
  }
 
  private getConnectedRooms(room: RoomDef, allRooms: RoomDef[]): RoomDef[] {
    // This is a simplified version - in a real implementation, you'd use the room graph
    // to find actually connected rooms
    const nearbyRooms = allRooms.filter(r => 
      r.id !== room.id && 
      this.getRoomDistance(room, r) < Math.max(room.width, room.depth) * 1.5
    );
    return nearbyRooms;
  }
 
  private getRoomDistance(a: RoomDef, b: RoomDef): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
