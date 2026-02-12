import type { PropDef, RoomDef, PropType } from "../types/level-schema";
import type { Random } from "../utils/level-generator-random";
import { PropGeneratorBase } from "./prop-generator-base";

export class CrateGenerator extends PropGeneratorBase {
  constructor(rand: Random, sharedOccupiedPositions?: Array<{ x: number; z: number; r: number }>) {
    super(rand, sharedOccupiedPositions);
  }

  generateForRoom(room: RoomDef, props: PropDef[]): void {
    // Generate 0-2 single crates per room
    const singleCrateCount = this.rand.int(0, 2);
    
    for (let i = 0; i < singleCrateCount; i++) {
      const offsetX = this.rand.float(-0.3, 0.3);
      const offsetZ = this.rand.float(-0.3, 0.3);
      
      this.generateSingleProp(room, {
        type: 'crate',
        scale: 1.0,
        health: 75, // Crates are a bit stronger than boxes
        lootChance: 0.9, // Higher chance for loot in crates
        lootTypes: [
          { type: 'weapon', min: 1, max: 1, weight: 3 },
          { type: 'ammo-pistol', min: 15, max: 35, weight: 4 },
          { type: 'ammo-rifle', min: 10, max: 25, weight: 3 },
          { type: 'ammo-shotgun', min: 5, max: 15, weight: 2 },
          { type: 'health', min: 20, max: 40, weight: 2 },
          { type: 'armor', min: 10, max: 25, weight: 2 },
          { type: 'ammo-pistol', min: 10, max: 20, weight: 2 } // Extra ammo chance
        ]
      }, props, false, offsetX, offsetZ);
    }
  }
}
