import type { PropDef, RoomDef, PropType } from "../types/level-schema";
import type { Random } from "../utils/level-generator-random";
import { PropGeneratorBase } from "./prop-generator-base";

export class BarrelGenerator extends PropGeneratorBase {
  constructor(rand: Random, sharedOccupiedPositions?: Array<{ x: number; z: number; r: number }>) {
    super(rand, sharedOccupiedPositions);
  }

  generateForRoom(room: RoomDef, props: PropDef[]): void {
    // Requirements: exactly 2 barrels per room
    const barrelCount = 2;
    
    for (let i = 0; i < barrelCount; i++) {
      const isExplosive = this.rand.chance(0.3); // 30% chance for explosive barrel
      const barrelType = 'barrel'; // Only 'barrel' exists in the actual level
      
      // Add random offset for more dramatic off-center placement
      const offsetX = this.rand.float(-0.3, 0.3);
      const offsetZ = this.rand.float(-0.3, 0.3);
      
      this.generateSingleProp(room, {
        type: barrelType,
        scale: 1.0,
        health: isExplosive ? 50 : 100,
        lootChance: isExplosive ? 0.3 : 0.6, // Explosive barrels have less loot
        lootTypes: [
          { type: 'ammo-rifle', min: 10, max: 25, weight: 2 },
          { type: 'ammo-pistol', min: 15, max: 30, weight: 2 },
          { type: 'health', min: 20, max: 40, weight: 2 },
          { type: 'armor', min: 5, max: 15, weight: 1 },
          { type: 'weapon', min: 1, max: 1, weight: isExplosive ? 0 : 1 } // No weapons in explosive barrels
        ]
      }, props, false, offsetX, offsetZ);
    }
  }
}
