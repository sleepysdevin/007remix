import type { PropDef, RoomDef, PropType } from "../types/level-schema";
import type { Random } from "../utils/level-generator-random";
import { PropGeneratorBase } from "./prop-generator-base";

export class BoxGenerator extends PropGeneratorBase {
  constructor(rand: Random, sharedOccupiedPositions?: Array<{ x: number; z: number; r: number }>) {
    super(rand, sharedOccupiedPositions);
  }

  generateForRoom(room: RoomDef, props: PropDef[]): void {
    // Generate 0-2 single boxes per room
    const singleBoxCount = this.rand.int(0, 2);
    
    for (let i = 0; i < singleBoxCount; i++) {
      const offsetX = this.rand.float(-0.3, 0.3);
      const offsetZ = this.rand.float(-0.3, 0.3);
      
      this.generateSingleProp(room, {
        type: 'crate_wood',
        scale: 1.0,
        health: 50,
        lootChance: 0.8,
        lootTypes: [
          { type: 'weapon', min: 1, max: 1, weight: 2 },
          { type: 'ammo-pistol', min: 10, max: 30, weight: 4 },
          { type: 'ammo-rifle', min: 8, max: 20, weight: 3 },
          { type: 'ammo-shotgun', min: 5, max: 12, weight: 2 },
          { type: 'health', min: 15, max: 35, weight: 3 }, // More health
          { type: 'armor', min: 5, max: 20, weight: 1 },
          { type: 'ammo-pistol', min: 5, max: 15, weight: 2 } // Extra ammo chance
        ]
      }, props, false, offsetX, offsetZ);
    }
  }
}
