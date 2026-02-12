import { Random } from "../utils/level-generator-random";
import type { DoorDef, RoomDef } from "../types/level-schema";
import type { DoorLink, RoomGraph, GenerationOptions, DoorAxis } from "../types/level-generator-types";

export class DoorGenerator {
  constructor(private rand: Random) {}

  generateDoors(
    rooms: RoomDef[],
    mainPathEdges: Array<[string, string]>,
    options: GenerationOptions
  ): { doors: DoorDef[]; graph: RoomGraph } {
    const doors: DoorDef[] = [];
    const links: DoorLink[] = [];

    // Create doors for main path
    for (const [aId, bId] of mainPathEdges) {
      const a = rooms.find((r) => r.id === aId);
      const b = rooms.find((r) => r.id === bId);
      if (!a || !b) continue;
      if (!this.areRoomsAdjacent(a, b)) continue;

      const door = this.createDoor(a, b);
      if (door) {
        doors.push(door);
        links.push({ doorId: door.id, a: a.id, b: b.id });
      }
    }

    // Add some extra loop doors
    const extraDoors = this.addLoopDoors(rooms, doors, links, options);
    doors.push(...extraDoors.doors);
    links.push(...extraDoors.links);

    const graph = this.buildGraph(links, doors, mainPathEdges);
    return { doors, graph };
  }

  private addLoopDoors(
    rooms: RoomDef[],
    existingDoors: DoorDef[],
    existingLinks: DoorLink[],
    options: GenerationOptions
  ): { doors: DoorDef[]; links: DoorLink[] } {
    const newDoors: DoorDef[] = [];
    const newLinks: DoorLink[] = [];
    
    const possiblePairs: Array<[RoomDef, RoomDef]> = [];
    
    // Find all possible room pairs that could have a door between them
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        
        // Skip if rooms are not adjacent
        if (!this.areRoomsAdjacent(a, b)) continue;
        
        // Skip if there's already a door between these rooms
        if (this.hasDoorBetween(existingLinks, a.id, b.id)) continue;
        
        possiblePairs.push([a, b]);
      }
    }

    // Shuffle to randomize which doors get added
    this.rand.shuffle(possiblePairs);

    // Add some extra doors based on difficulty
    const maxExtra = Math.min(
      Math.floor(rooms.length * 0.5),
      possiblePairs.length
    );
    
    let added = 0;
    
    for (const [a, b] of possiblePairs) {
      if (added >= maxExtra) break;
      
      // Adjust probability based on difficulty
      const baseChance = options.difficulty === "easy" ? 0.2 : 
                        options.difficulty === "medium" ? 0.3 : 0.4;
                        
      if (!this.rand.chance(baseChance)) continue;

      const door = this.createDoor(a, b);
      if (door) {
        newDoors.push(door);
        newLinks.push({ doorId: door.id, a: a.id, b: b.id });
        added++;
      }
    }

    return { doors: newDoors, links: newLinks };
  }

  private createDoor(a: RoomDef, b: RoomDef): DoorDef | null {
    const doorGeom = this.computeDoorGeometry(a, b);
    if (!doorGeom) return null;

    return {
      id: `door_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      x: doorGeom.x,
      y: 0,
      z: doorGeom.z,
      width: doorGeom.width,
      height: 3,
      axis: doorGeom.axis,
      type: "proximity",
      proximityRadius: 2.5,
    };
  }

  private computeDoorGeometry(a: RoomDef, b: RoomDef) {
    const minOverlap = 4; // Increased from 3 to ensure enough space
    const doorWidth = 2;
    const minDistanceFromCorner = 1.5; // Minimum distance from room corner

    // Check if rooms are aligned on X axis
    if (Math.abs(a.x - b.x) < (a.width + b.width) / 2) {
      let xMin = Math.max(a.x - a.width / 2, b.x - b.width / 2);
      let xMax = Math.min(a.x + a.width / 2, b.x + b.width / 2);
      
      // Adjust to keep doors away from corners
      xMin = Math.max(xMin, Math.min(a.x - a.width / 2, b.x - b.width / 2) + minDistanceFromCorner);
      xMax = Math.min(xMax, Math.max(a.x + a.width / 2, b.x + b.width / 2) - minDistanceFromCorner);
      
      const overlap = xMax - xMin;

      if (overlap >= minOverlap) {
        // Ensure door is centered in the available space
        const centerX = (xMin + xMax) / 2;
        const doorX = centerX;
        const doorZ = a.z < b.z ? (a.z + a.depth / 2 + b.z - b.depth / 2) / 2 : 
                                 (a.z - a.depth / 2 + b.z + b.depth / 2) / 2;
        
        return {
          x: doorX,
          z: doorZ,
          axis: 'z' as DoorAxis,
          width: Math.min(overlap, doorWidth)
        };
      }
    }

    // Check if rooms are aligned on Z axis
    if (Math.abs(a.z - b.z) < (a.depth + b.depth) / 2) {
      let zMin = Math.max(a.z - a.depth / 2, b.z - b.depth / 2);
      let zMax = Math.min(a.z + a.depth / 2, b.z + b.depth / 2);
      
      // Adjust to keep doors away from corners
      zMin = Math.max(zMin, Math.min(a.z - a.depth / 2, b.z - b.depth / 2) + minDistanceFromCorner);
      zMax = Math.min(zMax, Math.max(a.z + a.depth / 2, b.z + b.depth / 2) - minDistanceFromCorner);
      
      const overlap = zMax - zMin;

      if (overlap >= minOverlap) {
        // Ensure door is centered in the available space
        const centerZ = (zMin + zMax) / 2;
        const doorZ = centerZ;
        const doorX = a.x < b.x ? (a.x + a.width / 2 + b.x - b.width / 2) / 2 : 
                                (a.x - a.width / 2 + b.x + b.width / 2) / 2;
        
        return {
          x: doorX,
          z: doorZ,
          axis: 'x' as DoorAxis,
          width: Math.min(overlap, doorWidth)
        };
      }
    }

    return null;
  }

  private areRoomsAdjacent(a: RoomDef, b: RoomDef): boolean {
    // Check if rooms overlap on X axis and are adjacent on Z
    if (Math.abs(a.x - b.x) < (a.width + b.width) / 2) {
      const zDist = Math.abs(a.z - b.z);
      const minZDist = (a.depth + b.depth) / 2 + 0.1;
      if (zDist <= minZDist + 0.5) return true;
    }

    // Check if rooms overlap on Z axis and are adjacent on X
    if (Math.abs(a.z - b.z) < (a.depth + b.depth) / 2) {
      const xDist = Math.abs(a.x - b.x);
      const minXDist = (a.width + b.width) / 2 + 0.1;
      if (xDist <= minXDist + 0.5) return true;
    }

    return false;
  }

  private hasDoorBetween(links: DoorLink[], aId: string, bId: string): boolean {
    return links.some(
      (l) =>
        (l.a === aId && l.b === bId) || (l.a === bId && l.b === aId)
    );
  }

  private buildGraph(
    links: DoorLink[],
    doors: DoorDef[],
    mainPathEdges: Array<[string, string]>
  ): RoomGraph {
    const doorById = new Map(doors.map((d) => [d.id, d]));
    const adjAll = new Map<string, Set<string>>();
    const adjUnlocked = new Map<string, Set<string>>();

    const add = (m: Map<string, Set<string>>, a: string, b: string) => {
      if (!m.has(a)) m.set(a, new Set());
      m.get(a)!.add(b);
    };

    for (const l of links) {
      const d = doorById.get(l.doorId);
      if (!d) continue;

      add(adjAll, l.a, l.b);
      add(adjAll, l.b, l.a);

      if (d.type === "proximity") {
        add(adjUnlocked, l.a, l.b);
        add(adjUnlocked, l.b, l.a);
      }
    }

    return { links, adjAll, adjUnlocked, mainPathEdges };
  }
}
