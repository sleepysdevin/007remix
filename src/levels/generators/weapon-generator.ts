import type { PropDef, RoomDef, PropType } from "../types/level-schema";
import type { Random } from "../utils/level-generator-random";
import { PropGeneratorBase } from "./prop-generator-base";

export class WeaponGenerator extends PropGeneratorBase {
  private weaponTypes = [
    { type: 'weapon_pistol' as PropType, weight: 5 },
    { type: 'weapon_rifle' as PropType, weight: 3 },
    { type: 'weapon_shotgun' as PropType, weight: 2 }
  ];

  constructor(rand: Random, sharedOccupiedPositions?: Array<{ x: number; z: number; r: number }>) {
    super(rand, sharedOccupiedPositions);
    // Reduce minimum distance for weapons to allow placement in tighter spaces
    this.minDistance = 1.0;
  }

  generateForRoom(room: RoomDef, props: PropDef[]): void {
    // Minimum requirements: 1 weapon per room
    const weaponCount = 1;
    
    for (let i = 0; i < weaponCount; i++) {
      const weaponType = this.chooseWeaponType();
      
      // Add random offset for more dramatic off-center placement
      const offsetX = this.rand.float(-0.3, 0.3);
      const offsetZ = this.rand.float(-0.3, 0.3);
      
      this.generateSingleProp(room, {
        type: weaponType,
        scale: 1.0,
        health: 0, // Weapons don't have health
        lootChance: 0, // No loot from weapons
        lootTypes: []
      }, props, false, offsetX, offsetZ);
    }
  }

  private chooseWeaponType(): PropType {
    const totalWeight = this.weaponTypes.reduce((sum, w) => sum + w.weight, 0);
    let roll = this.rand.float(0, totalWeight);
    
    for (const weapon of this.weaponTypes) {
      roll -= weapon.weight;
      if (roll <= 0) {
        return weapon.type;
      }
    }
    
    return this.weaponTypes[0].type; // Fallback to first weapon type
  }
}
