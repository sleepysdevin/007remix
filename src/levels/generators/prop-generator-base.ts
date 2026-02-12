import type { PropDef, RoomDef, PropType } from "../types/level-schema";
import type { Random } from "../utils/level-generator-random";

export abstract class PropGeneratorBase {
  protected occupiedPositions: Array<{ x: number; z: number; r: number }> = [];
  protected minDistance = 1.5;
  protected doorPositions: Array<{ x: number; z: number; r: number }> = [];
  
  /**
   * Calculate Y offset needed for a prop type to sit on ground
   */
  private getGroundOffset(propType: string, scale: number = 1.0): number {
    // Match working stack generator positioning
    return -2; // Same as stack generator bottom props
  }

  constructor(protected rand: Random, sharedOccupiedPositions?: Array<{ x: number; z: number; r: number }>) {
    // Use shared positions if provided, otherwise use own
    if (sharedOccupiedPositions) {
      this.occupiedPositions = sharedOccupiedPositions;
    }
  }
  
  setDoorPositions(doorPositions: Array<{ x: number; z: number; r: number }>) {
    this.doorPositions = doorPositions;
  }
  
  abstract generateForRoom(room: RoomDef, props: PropDef[]): void;
  
  protected generateSingleProp(
    room: RoomDef, 
    config: {
      type: PropType;
      scale: number;
      health: number;
      lootChance: number;
      lootTypes: Array<{ type: string; min: number; max: number; weight: number }>;
      maxStackHeight?: number;
      stackHeightWeights?: number[];
    },
    props: PropDef[],
    forceStack: boolean = false,
    offsetX: number = 0,
    offsetZ: number = 0
  ): void {
    // Implementation of single prop generation
    // This will be shared across all prop generators
    const position = this.findValidPosition(room, 1.0);
    if (!position) return;
    
    // Determine stack height
    let stackHeight = 1;
    if (forceStack && config.maxStackHeight && config.stackHeightWeights) {
      // Force stacking: choose height based on weights
      const possibleHeights = [];
      for (let i = 0; i < config.stackHeightWeights.length; i++) {
        if (config.stackHeightWeights[i] > 0) {
          possibleHeights.push(i + 1);
        }
      }
      if (possibleHeights.length > 0) {
        stackHeight = possibleHeights[possibleHeights.length - 1]; // Take the highest (should be 2)
      }
    }
    
    // Create stacked props
    for (let i = 0; i < stackHeight; i++) {
      const groundOffset = this.getGroundOffset(config.type, config.scale);
      const prop: PropDef = {
        type: config.type,
        x: position.x + offsetX, // Apply random X offset
        y: groundOffset + (i * config.scale), // Stack vertically with first prop on ground
        z: position.z + offsetZ, // Apply random Z offset
        rotY: this.rand.float(0, Math.PI * 2),
        scale: config.scale,
        health: config.health,
        loot: i === 0 ? this.maybeLoot(config.lootChance, config.lootTypes) : undefined // Only bottom prop has loot
      };
      
      props.push(prop);
      this.occupiedPositions.push({ x: position.x + offsetX, z: position.z + offsetZ, r: 1.0 });
    }
  }
  
  protected findValidPosition(room: RoomDef, radius: number): { x: number; z: number } | null {
    // Simplified position finding logic
    const maxAttempts = 50;
    
    for (let i = 0; i < maxAttempts; i++) {
      const x = this.rand.float(
        room.x - room.width / 2 + radius,
        room.x + room.width / 2 - radius
      );
      const z = this.rand.float(
        room.z - room.depth / 2 + radius,
        room.z + room.depth / 2 - radius
      );
      
      // Check if position is valid
      let valid = true;
      
      // Check against occupied positions
      for (const pos of this.occupiedPositions) {
        const dx = x - pos.x;
        const dz = z - pos.z;
        if (dx * dx + dz * dz < (pos.r + radius) ** 2) {
          valid = false;
          break;
        }
      }
      
      // Check against door positions (exclusion zone)
      if (valid) {
        for (const door of this.doorPositions) {
          const dx = x - door.x;
          const dz = z - door.z;
          // Keep props away from doors (larger exclusion radius)
          if (dx * dx + dz * dz < (door.r + 2.0) ** 2) {
            valid = false;
            break;
          }
        }
      }
      
      if (valid) {
        return { x, z };
      }
    }
    
    return null;
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
