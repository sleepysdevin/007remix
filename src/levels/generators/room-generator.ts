import { Random } from "../utils/level-generator-random";
import type { RoomDef } from "../types/level-schema";
import type { RoomGeometry } from "../types/level-generator-types";

export class RoomGenerator {
  constructor(private rand: Random) {}

  generateRooms(count: number): { rooms: RoomDef[]; mainPathEdges: Array<[string, string]> } {
    const overlapMargin = 0.05;
    const dirs = [
      { dx: 0, dz: 1 },
      { dx: 1, dz: 0 },
      { dx: 0, dz: -1 },
      { dx: -1, dz: 0 },
    ] as const;

    for (let attempt = 0; attempt < 5; attempt++) {
      const rooms: RoomDef[] = [];
      const mainPathEdges: Array<[string, string]> = [];

      // First room at origin
      const first = this.createRoom({
        x: 0,
        y: 0,
        z: 0,
        width: 12,
        depth: 16,
        height: 4,
      });
      rooms.push(first);

      let success = true;

      for (let i = 1; i < count; i++) {
        const roomType = this.pickRoomType();
        let placed: { x: number; z: number; anchorId: string } | null = null;

        for (let tries = 0; tries < 40 && !placed; tries++) {
          const anchor = this.rand.pick(rooms);
          const dir = this.rand.pick(dirs);
          const spacing = 0.1;

          let x = anchor.x;
          let z = anchor.z;

          if (dir.dx !== 0) {
            x += dir.dx * (anchor.width / 2 + roomType.width / 2 + spacing);
          } else {
            z += dir.dz * (anchor.depth / 2 + roomType.depth / 2 + spacing);
          }

          if (!this.doesRoomOverlap(rooms, x, z, roomType.width, roomType.depth, overlapMargin)) {
            placed = { x, z, anchorId: anchor.id };
          }
        }

        if (!placed) {
          success = false;
          break;
        }

        const newRoom = this.createRoom({
          x: placed.x,
          y: 0, // Default y position
          z: placed.z,
          ...roomType,
        });

        rooms.push(newRoom);
        mainPathEdges.push([placed.anchorId, newRoom.id]);
      }

      if (success) {
        return { rooms, mainPathEdges };
      }
    }

    throw new Error("Failed to layout non-overlapping rooms");
  }

  private pickRoomType() {
    const roomTypes = [
      { width: 12, depth: 16, height: 4 },
      { width: 16, depth: 20, height: 4 },
      { width: 20, depth: 24, height: 4 },
      { width: 14, depth: 14, height: 4 },
    ] as const;
    return this.rand.pick(roomTypes);
  }

  private createRoom(params: {
    x: number;
    y: number;
    z: number;
    width: number;
    depth: number;
    height: number;
  }): RoomDef {
    const floorColors = [4473941, 4210768, 4535600, 3352388, 3158304, 3487029, 3361587] as const;
    const wallColors = [5592422, 5259872, 5591616, 4473941, 4210768, 4541765, 4483652] as const;

    return {
      id: `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      x: params.x,
      y: params.y,
      z: params.z,
      width: params.width,
      depth: params.depth,
      height: params.height,
      floorColor: this.rand.pick(floorColors),
      wallColor: this.rand.pick(wallColors),
    };
  }

  private doesRoomOverlap(
    existingRooms: RoomDef[],
    x: number,
    z: number,
    width: number,
    depth: number,
    margin: number
  ): boolean {
    return existingRooms.some((r) => {
      const overlapX = Math.abs(x - r.x) < width / 2 + r.width / 2 + margin;
      const overlapZ = Math.abs(z - r.z) < depth / 2 + r.depth / 2 + margin;
      return overlapX && overlapZ;
    });
  }

  computeDoorGeometry(a: RoomDef, b: RoomDef): RoomGeometry | null {
    const minOverlap = 3;
    const doorWidth = 2;

    // Check if rooms are aligned on X axis
    if (Math.abs(a.x - b.x) < (a.width + b.width) / 2) {
      const xMin = Math.max(a.x - a.width / 2, b.x - b.width / 2);
      const xMax = Math.min(a.x + a.width / 2, b.x + b.width / 2);
      const overlap = xMax - xMin;

      if (overlap >= minOverlap) {
        const centerX = (xMin + xMax) / 2;
        const doorX = centerX;
        const doorZ = a.z < b.z ? (a.z + a.depth / 2 + b.z - b.depth / 2) / 2 : (a.z - a.depth / 2 + b.z + b.depth / 2) / 2;
        
        return {
          x: doorX,
          z: doorZ,
          axis: 'x' as const,
          width: Math.min(overlap, doorWidth)
        };
      }
    }

    // Check if rooms are aligned on Z axis
    if (Math.abs(a.z - b.z) < (a.depth + b.depth) / 2) {
      const zMin = Math.max(a.z - a.depth / 2, b.z - b.depth / 2);
      const zMax = Math.min(a.z + a.depth / 2, b.z + b.depth / 2);
      const overlap = zMax - zMin;

      if (overlap >= minOverlap) {
        const centerZ = (zMin + zMax) / 2;
        const doorZ = centerZ;
        const doorX = a.x < b.x ? (a.x + a.width / 2 + b.x - b.width / 2) / 2 : (a.x - a.width / 2 + b.x + b.width / 2) / 2;
        
        return {
          x: doorX,
          z: doorZ,
          axis: 'z' as const,
          width: Math.min(overlap, doorWidth)
        };
      }
    }

    return null;
  }

  areRoomsAdjacent(a: RoomDef, b: RoomDef): boolean {
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
}
