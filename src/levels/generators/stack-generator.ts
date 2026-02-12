import type { PropDef, RoomDef, PropType } from "../types/level-schema";
import type { Random } from "../utils/level-generator-random";
import { PropGeneratorBase } from "./prop-generator-base";

export class StackGenerator extends PropGeneratorBase {
  constructor(rand: Random, sharedOccupiedPositions?: Array<{ x: number; z: number; r: number }>) {
    super(rand, sharedOccupiedPositions);
  }

  generateForRoom(room: RoomDef, props: PropDef[]): void {
    // Requirements: at least 1 stack of boxes OR crates per room
    const stackCount = 1; // Always 1 stack
    
    for (let i = 0; i < stackCount; i++) {
      // Randomly choose between box stack or crate stack
      const isBoxStack = this.rand.chance(0.5);
      let propType: PropType;
      
      if (isBoxStack) {
        propType = 'crate'; // Box stacks are always 'crate'
      } else {
        // Crate stacks can be either 'crate' or 'crate_metal'
        propType = this.rand.chance(0.5) ? 'crate' : 'crate_metal';
      }
      
      // Create 2-on-bottom + 1-on-top stack
      const basePosition = this.findValidPosition(room, 1.0);
      if (!basePosition) continue;
      
      // Random offset for the top prop (off-center)
      const topOffsetX = this.rand.float(-0.4, 0.4); // Larger offset for top prop
      const topOffsetZ = this.rand.float(-0.4, 0.4);
      
      // Bottom props (2 side by side, not overlapping)
      const bottomOffset = 1.0; // Distance between bottom props to prevent overlap
      
      // Bottom prop 1 (left side)
      const prop1: PropDef = {
        type: propType,
        x: basePosition.x - bottomOffset/2, // Place to the left
        y: -2,
        z: basePosition.z,
        rotY: 0, // No rotation for bottom crates
        scale: 1.0,
        health: propType === 'crate_metal' ? 150 : 100,
        loot: this.maybeLoot(0.9, [ // Increased chance for loot
          { type: 'ammo-rifle', min: 15, max: 30, weight: 4 },
          { type: 'ammo-pistol', min: 20, max: 40, weight: 3 },
          { type: 'ammo-shotgun', min: 5, max: 15, weight: 2 },
          { type: 'health', min: 15, max: 30, weight: 2 },
          { type: 'armor', min: 10, max: 25, weight: 1 },
          { type: 'weapon', min: 1, max: 1, weight: 2 } // Increased weight for weapons
        ])
      };
      
      // Bottom prop 2 (right side)
      const prop2: PropDef = {
        type: propType,
        x: basePosition.x + bottomOffset/2, // Place to the right
        y: -2,
        z: basePosition.z,
        rotY: 0, // No rotation for bottom crates
        scale: 1.0,
        health: propType === 'crate_metal' ? 150 : 100,
        loot: this.maybeLoot(0.9, [ // Increased chance for loot
          { type: 'ammo-rifle', min: 15, max: 30, weight: 4 },
          { type: 'ammo-pistol', min: 20, max: 40, weight: 3 },
          { type: 'ammo-shotgun', min: 5, max: 15, weight: 2 },
          { type: 'health', min: 15, max: 30, weight: 2 },
          { type: 'armor', min: 10, max: 25, weight: 1 },
          { type: 'weapon', min: 1, max: 1, weight: 2 } // Increased weight for weapons
        ])
      };
      
      // Top prop (centered on top of bottom crates)
      const prop3: PropDef = {
        type: propType,
        x: basePosition.x, // Center on top of the two bottom crates
        y: -1, // On top of bottom props
        z: basePosition.z,
        rotY: Math.PI / 4, // 45 degree rotation for visual interest
        scale: 1.0,
        health: propType === 'crate_metal' ? 150 : 100,
        loot: this.maybeLoot(0.5, [ // Slight chance for top crate to have loot too
          { type: 'weapon', min: 1, max: 1, weight: 3 },
          { type: 'ammo-rifle', min: 20, max: 40, weight: 2 },
          { type: 'ammo-pistol', min: 25, max: 50, weight: 2 },
          { type: 'ammo-shotgun', min: 10, max: 20, weight: 1 },
          { type: 'health', min: 25, max: 50, weight: 1 },
          { type: 'armor', min: 15, max: 30, weight: 1 }
        ])
      };
      
      props.push(prop1, prop2, prop3);
      
      // Mark positions as occupied (use center of the stack)
      this.occupiedPositions.push({ x: basePosition.x, z: basePosition.z, r: 1.0 });
    }
  }
  
  protected maybeLoot(chance: number, lootTypes: Array<{type: string, min: number, max: number, weight: number}>): {type: string, amount: number} | undefined {
    if (!this.rand.chance(chance)) return undefined;
    
    const totalWeight = lootTypes.reduce((sum, type) => sum + type.weight, 0);
    let roll = this.rand.float(0, totalWeight);
    
    for (const type of lootTypes) {
      roll -= type.weight;
      if (roll <= 0) {
        return {
          type: type.type,
          amount: this.rand.int(type.min, type.max)
        };
      }
    }
    
    return undefined;
  }
}
