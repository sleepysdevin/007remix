
import type { PropDef, RoomDef, DoorDef } from "../types/level-schema";
import type { Hotspot } from "../types/level-generator-types";
import type { Random } from "../utils/level-generator-random";
import { BoxGenerator } from "./box-generator";
import { CrateGenerator } from "./crate-generator";
import { BarrelGenerator } from "./barrel-generator";
import { WeaponGenerator } from "./weapon-generator";
import { StackGenerator } from "./stack-generator";

type PropType = 
  | 'crate' 
  | 'barrel' 
  | 'crate_metal' 
  | 'crate_wood' 
  | 'crate_ammo' 
  | 'crate_medical' 
  | 'barrel_metal' 
  | 'barrel_toxic' 
  | 'barrel_explosive' 
  | 'crate_explosive'
  | 'weapon_pistol'
  | 'weapon_rifle'
  | 'weapon_shotgun';

interface PropConfig {
  type: PropType;
  scale: number;
  health: number;
  lootChance: number;
  lootTypes: Array<{ type: string; min: number; max: number; weight: number }>;
  clusterChance: number;
  minPerRoom: number;
  maxPerRoom: number;
  minRooms: number;
  maxStackHeight?: number;
  stackHeightWeights?: number[];
  wallBuffer?: number;
}

const getDefaultPropConfigs = (rand: Random): PropConfig[] => [
  // Crates (wood or metal)
  {
    type: rand.chance(0.5) ? 'crate_wood' : 'crate_metal',
    scale: 1.0,
    health: 100,
    lootChance: 0.8,
    lootTypes: [
      { type: 'ammo-pistol', min: 8, max: 20, weight: 3 },
      { type: 'ammo-rifle', min: 5, max: 15, weight: 3 },
      { type: 'health', min: 15, max: 40, weight: 2 },
      { type: 'armor', min: 10, max: 30, weight: 3 },  // Increased weight for armor
      { type: 'weapon', min: 1, max: 1, weight: 2 }
    ],
    clusterChance: 0.3,  // Increased cluster chance
    minPerRoom: 4,       // At least 4 crates per room
    maxPerRoom: 8,       // Up to 8 crates in large rooms
    minRooms: 1,         // Can appear in any room
    maxStackHeight: 2,   // Allow stacking
    stackHeightWeights: [0.5, 0.5], // 50% single, 50% double
    wallBuffer: 1.0,     // Allow props even closer to walls
  },
  // Barrels (metal or explosive)
  {
    type: rand.chance(0.2) ? 'barrel_explosive' : 'barrel_metal',
    scale: 1.0,
    health: 80,
    lootChance: 0.7,     // Increased loot chance
    lootTypes: [
      { type: 'ammo-pistol', min: 10, max: 20, weight: 2 },
      { type: 'ammo-rifle', min: 10, max: 20, weight: 2 },
      { type: 'health', min: 20, max: 40, weight: 3 },  // Increased health amount
      { type: 'armor', min: 15, max: 30, weight: 3 },   // Added armor to barrels
      { type: 'weapon', min: 1, max: 1, weight: 4 }
    ],
    clusterChance: 0.2,  // Slight chance for barrel clusters
    minPerRoom: 1,       // At least 1 barrel per room
    maxPerRoom: 3,       // Up to 3 barrels in large rooms
    minRooms: 1,         // Can appear in any room
    maxStackHeight: 1,   // Barrels don't stack
    wallBuffer: 1.2,     // Slightly more buffer than crates
  }
];

export class PropGenerator {
  private occupiedPositions: Array<{ x: number; z: number; r: number }> = [];
  private doorPositions: Array<{ x: number; z: number; r: number }> = []; // Track door positions
  private hotspots: Hotspot[] = [];
  private minDistance = 3.0; // Reduced from 5.0 to 3.0 to allow even more props
  private minDistanceFromDoor = 2.0; // Reduced from 3.0 to 2.0
  private playerSpawnRadius = 2.5; // Slightly reduced from 3.0
  private playerSpawnArea: { x: number; z: number; radius: number } | null = null;
  private propConfigs: PropConfig[];

  constructor(private rand: Random, private doors: DoorDef[] = []) {
    this.propConfigs = getDefaultPropConfigs(rand);
    // Initialize door positions
    this.doorPositions = doors.map(door => ({
      x: door.x,
      z: door.z,
      r: 1.5 // Radius around door to avoid
    }));
  }

  setPlayerSpawn(spawn: { x: number; z: number }) {
    // Reserve space around player spawn (5 units radius)
    this.playerSpawnArea = {
      x: spawn.x,
      z: spawn.z,
      radius: this.playerSpawnRadius
    };
    this.occupiedPositions.push({
      x: this.playerSpawnArea.x,
      z: this.playerSpawnArea.z,
      r: this.playerSpawnArea.radius
    });
  }

  generateProps(rooms: RoomDef[]): { props: PropDef[]; hotspots: Hotspot[] } {
    console.log('[PropGenerator] Starting prop generation for', rooms.length, 'rooms');
    const props: PropDef[] = [];
    this.hotspots = [];

    // Initialize prop generators
    // Create shared occupied positions array to prevent overlap between prop types
    const sharedOccupiedPositions: Array<{ x: number; z: number; r: number }> = [];
    
    const boxGenerator = new BoxGenerator(this.rand, sharedOccupiedPositions);
    const crateGenerator = new CrateGenerator(this.rand, sharedOccupiedPositions);
    const barrelGenerator = new BarrelGenerator(this.rand, sharedOccupiedPositions);
    const weaponGenerator = new WeaponGenerator(this.rand, sharedOccupiedPositions);
    const stackGenerator = new StackGenerator(this.rand, sharedOccupiedPositions);

    // Set door positions for all generators (door exclusion)
    const doorPositions = this.doors.map(door => ({
      x: door.x,
      z: door.z,
      r: 1.5 // Door radius
    }));
    
    boxGenerator.setDoorPositions(doorPositions);
    crateGenerator.setDoorPositions(doorPositions);
    barrelGenerator.setDoorPositions(doorPositions);
    weaponGenerator.setDoorPositions(doorPositions);
    stackGenerator.setDoorPositions(doorPositions);

    // Process all rooms that meet the minimum size requirements
    const candidateRooms = rooms.filter(room => room.width >= 5 && room.depth >= 5);
    console.log(`[PropGenerator] Generating props in ${candidateRooms.length} rooms (out of ${rooms.length} total)`);
    
    if (candidateRooms.length === 0) {
      console.warn('[PropGenerator] No valid rooms found for props');
      return { props: [], hotspots: [] };
    }
    
    // Generate props for each room
    for (const room of candidateRooms) {
      try {
        // Generate each prop type
        boxGenerator.generateForRoom(room, props);
        crateGenerator.generateForRoom(room, props);
        barrelGenerator.generateForRoom(room, props);
        weaponGenerator.generateForRoom(room, props);
        stackGenerator.generateForRoom(room, props);
      } catch (error) {
        console.error(`[PropGenerator] Error generating props for room ${room.id}:`, error);
      }
    }

    return { props, hotspots: this.hotspots };
  }

  // This method is no longer needed as we're using specialized generators
  private generatePropsInRoom() {
    // This is now a no-op as we've moved the logic to specialized generators
  }

  private generateSingleProp(room: RoomDef, config: PropConfig, props: PropDef[], forceStack: boolean = false): void {
    const propType = config.type;
    console.log(`[generateSingleProp] Attempting to place ${forceStack ? 'stacked ' : ''}${propType} in room ${room.id}`);
    
    // If forceStack is true, this will be a stack; otherwise, it's a single prop
    const shouldStack = forceStack || this.rand.chance(0.2); // Reduced stack chance from 30% to 20%
    
    if (shouldStack && config.maxStackHeight && config.maxStackHeight > 1) {
      // Strictly enforce 2-high maximum
      const MAX_STACK_HEIGHT = 2;
      console.log(`[generateSingleProp] Generating a stack of ${propType} (max height: ${MAX_STACK_HEIGHT})`);
      let stackHeight = 1;
      
      if (config.maxStackHeight && config.maxStackHeight > 1) {
        // Only allow stacks of 1 or 2
        const possibleHeights = [1];
        if (config.maxStackHeight >= 2 && (config.stackHeightWeights?.[1] || 0) > 0) {
          possibleHeights.push(2);
        }
        
        // Choose height based on weights, but never more than 2
        stackHeight = this.rand.pick(
          possibleHeights.flatMap(height => 
            Array(Math.ceil((config.stackHeightWeights?.[height - 1] || 0) * 10)).fill(height)
          )
        ) || 1;
      }
      
      // Find a valid position with enough space for the entire stack
      const baseRadius = 1.2; // Slightly larger radius for stacks
      const position = this.findValidPosition(room, baseRadius);
      if (!position) return;
      
      // Create stack with proper vertical alignment
      const groundOffset = this.getGroundOffsetForType(propType);
      const stackBaseY = groundOffset; // Base Y position (accounts for prop offset)
      const verticalSpacing = 0.9; // Slightly less than 1.0 to make them look stacked
      
      // Check if we have enough vertical clearance
      const stackTopY = stackBaseY + (stackHeight - 1) * verticalSpacing + 1.0;
      if (stackTopY > 4.5) {
        // Would go above ceiling level, make it a single prop
        return this.generateSingleProp(room, config, props, false);
      }
      
      console.log(`[generateSingleProp] Placing stack of ${stackHeight} ${propType} at (${position.x.toFixed(1)},${position.z.toFixed(1)})`);
      
      let stackPlaced = false;
      for (let i = 0; i < stackHeight; i++) {
        const groundOffset = this.getGroundOffsetForType(propType);
        const y = groundOffset + i * 0.8;
        const prop = this.createProp(config, position.x, position.z, room.id, y);
        if (prop) {
          props.push(prop);
          stackPlaced = true;
          
          // Only add the base position to occupied positions
          if (i === 0) {
            this.occupiedPositions.push({ x: position.x, z: position.z, r: 1.5 });
            console.log(`[generateSingleProp] Added stack base to occupied positions at (${position.x.toFixed(1)},${position.z.toFixed(1)})`);
          }
        } else {
          console.warn(`[generateSingleProp] Failed to create prop at position (${position.x.toFixed(1)},${position.z.toFixed(1)}) in stack`);
        }
      }
      
      if (!stackPlaced) {
        console.error(`[generateSingleProp] Failed to place any props in stack at (${position.x.toFixed(1)},${position.z.toFixed(1)})`);
      }
    } else {
      // Single prop
      const position = this.findValidPosition(room, 1.0);
      if (!position) {
        console.warn(`[generateSingleProp] Could not find valid position for single ${propType} in room ${room.id}`);
        return;
      }
      
      console.log(`[generateSingleProp] Placing single ${propType} at (${position.x.toFixed(1)},${position.z.toFixed(1)})`);
      const groundOffset = this.getGroundOffsetForType(propType);
      const prop = this.createProp(config, position.x, position.z, room.id, groundOffset);
      if (prop) {
        props.push(prop);
        this.occupiedPositions.push({ x: position.x, z: position.z, r: 1.0 });
        console.log(`[generateSingleProp] Successfully placed ${propType} at (${position.x.toFixed(1)},${position.z.toFixed(1)})`);
      } else {
        console.error(`[generateSingleProp] Failed to create prop at position (${position.x.toFixed(1)},${position.z.toFixed(1)})`);
      }
    }
  }

  private generatePropCluster(room: RoomDef, config: PropConfig, props: PropDef[]) {
    // Generate smaller clusters (1-2 props)
    const clusterSize = this.rand.chance(0.7) ? 2 : 1;
    if (this.rand.chance(0.8)) {
      // 80% chance to skip cluster generation
      this.generateSingleProp(room, config, props);
      return;
    }
    
    const maxStackHeight = config.maxStackHeight || 1;
    const stackHeightWeights = config.stackHeightWeights || [1];
    
    // Determine cluster size (smaller for stacks)
    const baseClusterSize = maxStackHeight > 1 ? this.rand.int(1, 2) : this.rand.int(1, 3);
    
    // For 3-high stacks, find position near wall
    const isThreeHigh = maxStackHeight >= 3 && this.rand.chance(0.1);
    let basePosition: {x: number, z: number} | null = null;
    
    if (isThreeHigh) {
      basePosition = this.findPositionNearWall(room, 1.5);
      if (!basePosition) return; // Skip if no valid wall position found
    } else {
      // For other stacks, find any valid position with even more space
      basePosition = this.findValidPosition(room, 3.0); // Increased from 2.0
      if (!basePosition) return;
    }

    // Add a hotspot at the base of the stack
    this.addHotspot(basePosition.x, basePosition.z, room.id, 2.0);

    // Generate props in a cluster or stack
    const placed: { x: number; z: number }[] = [];
    
    if (maxStackHeight > 1) {
      // Create a stack
      const stackHeight = isThreeHigh 
        ? 3 
        : this.rand.pick(
            Array.from({length: maxStackHeight}, (_, i) => i + 1)
              .filter((_, i) => stackHeightWeights[i] > 0)
              .flatMap((height, i) => 
                Array(Math.ceil(stackHeightWeights[i] * 10)).fill(height)
              )
          );
      
      for (let i = 0; i < stackHeight; i++) {
        const groundOffset = this.getGroundOffsetForType(config.type);
        const prop = this.createProp(
          config,
          basePosition.x,
          basePosition.z,
          room.id,
          groundOffset + i * 0.8 // Stack vertically with proper ground offset
        );
        if (prop) {
          props.push(prop);
          // Only mark the base position as occupied to allow stacking
          if (i === 0) {
            this.occupiedPositions.push({
              x: basePosition.x,
              z: basePosition.z,
              r: 1.0
            });
            placed.push({ x: basePosition.x, z: basePosition.z });
          }
        }
      }
    } else {
      // Create a traditional cluster
      for (let i = 0; i < baseClusterSize; i++) {
        let attempts = 0;
        let placedProp = false;
        
        while (attempts < 10 && !placedProp) {
          const angle = this.rand.float(0, Math.PI * 2);
          const distance = this.rand.float(0.5, 2.0);
          const x = basePosition.x + Math.cos(angle) * distance;
          const z = basePosition.z + Math.sin(angle) * distance;
          
          if (this.isPositionValid(x, z, 1.0) && this.isInRoomBounds(x, z, room, 1.0)) {
            const groundOffset = this.getGroundOffsetForType(config.type);
            const prop = this.createProp(config, x, z, room.id, groundOffset);
            if (prop) {
              props.push(prop);
              this.occupiedPositions.push({ x, z, r: 1.0 });
              placed.push({ x, z });
              placedProp = true;
            }
          }
          
          attempts++;
        }
      }
    }

    // Add a larger hotspot if we placed multiple props
    if (placed.length >= 2) {
      // Calculate center of mass for the cluster
      const centerX = placed.reduce((sum, p) => sum + p.x, 0) / placed.length;
      const centerZ = placed.reduce((sum, p) => sum + p.z, 0) / placed.length;
      this.addHotspot(centerX, centerZ, room.id, 3.0);
    }
  }

  /**
   * Calculate Y offset needed for a prop type to sit on ground
   */
  private getGroundOffsetForType(propType: string): number {
    // Match working stack generator positioning
    return -2; // Same as stack generator bottom props
  }

  private createProp(config: PropConfig, x: number, z: number, roomId: string, y: number): PropDef | null {
    try {
      if (!config || !config.type) {
        console.error('[createProp] Invalid config or missing type:', config);
        return null;
      }
      
      const rotationY = this.rand.float(0, Math.PI * 2);
      const loot = this.maybeLoot(config.lootChance, config.lootTypes);
      
      const prop: PropDef = {
        type: config.type,
        x,
        y, // Use the provided Y position for stacking
        z,
        rotY: rotationY,
        scale: config.scale || 1.0,
        health: config.health || 100,
        loot: loot || undefined,
      };
      
      console.log(`[createProp] Created ${config.type} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
      if (loot) {
        console.log(`[createProp]   - Loot: ${loot.type} x${loot.amount}`);
      }
      
      return prop;
    } catch (error) {
      console.error('[createProp] Error creating prop:', error);
      return null;
    }
  }

  private chooseLootType(
    lootTypes: Array<{ type: string; min: number; max: number; weight: number }>
  ) {
    const totalWeight = lootTypes.reduce((sum, type) => sum + type.weight, 0);
    let roll = this.rand.float(0, totalWeight);
    
    for (const type of lootTypes) {
      roll -= type.weight;
      if (roll <= 0) return type;
    }
    
    return lootTypes[0];
  }

  private isTooCloseToDoor(x: number, z: number, propRadius: number): boolean {
    // Significantly increased clearance around doors
    const frontClearance = this.minDistanceFromDoor * 2.5 + propRadius * 2; // Even more front clearance
    const sideClearance = this.minDistanceFromDoor * 1.5 + propRadius * 1.5; // More side clearance
    
    for (const door of this.doors) {
      // Calculate distance from door center
      const dx = x - door.x;
      const dz = z - door.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Skip if too far to matter
      if (distance > this.minDistanceFromDoor * 3) continue;
      
      const isFacingX = door.axis === 'x';
      const doorHalfWidth = (door.width / 2) + sideClearance;
      const doorHalfDepth = 0.5 + frontClearance;
      
      // Transform coordinates to door space
      const alongDoor = isFacingX ? dx : dz;
      const acrossDoor = isFacingX ? dz : dx;
      
      // Check if we're within the door's extended width and depth
      const withinDoorWidth = Math.abs(alongDoor) < doorHalfWidth;
      const inFrontOfDoor = Math.abs(acrossDoor) < doorHalfDepth;
      
      // If we're in front of the door and within its width, we're too close
      if (withinDoorWidth && inFrontOfDoor) {
        return true;
      }
      
      // Check door corners with extra buffer
      const cornerBuffer = 1.5; // Extra space around corners
      const cornerDistance = Math.sqrt(
        Math.pow(Math.max(0, Math.abs(alongDoor) - (doorHalfWidth - cornerBuffer)), 2) +
        Math.pow(Math.max(0, Math.abs(acrossDoor) - (doorHalfDepth - cornerBuffer)), 2)
      );
      
      if (cornerDistance < propRadius + cornerBuffer) {
        return true;
      }
      
      // Additional check for sides of the door (but not directly in front)
      if (withinDoorWidth && Math.abs(acrossDoor) < doorHalfDepth + 1.0) {
        return true;
      }
    }
    return false;
  }

  private findValidPosition(room: RoomDef, radius: number, requireWallSpace: boolean = false): { x: number; z: number } | null {
    const maxAttempts = 100;
    console.log(`[findValidPosition] Looking for position in room ${room.id} (${room.width}x${room.depth}) with radius ${radius}`);
    
    for (let i = 0; i < maxAttempts; i++) {
      const x = this.rand.float(
        room.x - room.width / 2 + radius,
        room.x + room.width / 2 - radius
      );
      const z = this.rand.float(
        room.z - room.depth / 2 + radius,
        room.z + room.depth / 2 - radius
      );

      // Check if position is too close to doors or walls
      const tooCloseToDoor = this.isTooCloseToDoor(x, z, radius);
      const tooCloseToWall = this.isTooCloseToWall(room, x, z, radius);
      const inCorner = this.isInCorner(room, x, z, 1.5);
      
      if (tooCloseToDoor || tooCloseToWall || inCorner) {
        if (i === 0) {
          console.log(`[findValidPosition] Skipping position (${x.toFixed(1)},${z.toFixed(1)}) - ` +
            `tooCloseToDoor: ${tooCloseToDoor}, tooCloseToWall: ${tooCloseToWall}, inCorner: ${inCorner}`);
        }
        continue;
      }

      // Check for collisions with existing props
      let collision = false;
      for (const pos of this.occupiedPositions) {
        const dx = x - pos.x;
        const dz = z - pos.z;
        if (dx * dx + dz * dz < (pos.r + radius) ** 2) {
          if (i === 0) {
            console.log(`[findValidPosition] Collision at (${x.toFixed(1)},${z.toFixed(1)}) with prop at (${pos.x.toFixed(1)},${pos.z.toFixed(1)})`);
          }
          collision = true;
          break;
        }
      }
      
      if (!collision) {
        console.log(`[findValidPosition] Found valid position at (${x.toFixed(1)},${z.toFixed(1)}) after ${i+1} attempts`);
        return { x, z };
      }
    }
    
    console.warn(`[findValidPosition] Failed to find valid position after ${maxAttempts} attempts in room ${room.id}`);
    console.warn(`[findValidPosition] Room bounds: x=${room.x}±${room.width/2}, z=${room.z}±${room.depth/2}`);
    console.warn(`[findValidPosition] Occupied positions:`, this.occupiedPositions);
    return null;
  }

  private isPositionValid(x: number, z: number, radius: number): boolean {
    // Check door clearance with extra buffer
    if (this.isTooCloseToDoor(x, z, radius)) {
      console.log(`[isPositionValid] Position (${x.toFixed(1)},${z.toFixed(1)}) is too close to a door`);
      return false;
    }
    
    // Check distance from other props with increased spacing
    for (let i = 0; i < this.occupiedPositions.length; i++) {
      const pos = this.occupiedPositions[i];
      const dx = x - pos.x;
      const dz = z - pos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const isPlayerSpawn = (i === 0 && this.playerSpawnArea);
      const minDistance = isPlayerSpawn 
        ? (pos.r + radius) * 4.0  // More space around player spawn
        : (pos.r + radius) * 2.5;  // More space between props
      
      if (distance < minDistance) {
        if (isPlayerSpawn) {
          console.log(`[isPositionValid] Position (${x.toFixed(1)},${z.toFixed(1)}) is too close to player spawn at (${pos.x.toFixed(1)},${pos.z.toFixed(1)}) - distance: ${distance.toFixed(1)}, min: ${minDistance.toFixed(1)}`);
        } else {
          console.log(`[isPositionValid] Position (${x.toFixed(1)},${z.toFixed(1)}) is too close to prop at (${pos.x.toFixed(1)},${pos.z.toFixed(1)}) - distance: ${distance.toFixed(1)}, min: ${minDistance.toFixed(1)}`);
        }
        return false;
      }
    }
    
    console.log(`[isPositionValid] Position (${x.toFixed(1)},${z.toFixed(1)}) is valid`);
    return true;
  }

  private findPositionNearWall(room: RoomDef, minDistance: number): {x: number, z: number} | null {
    const wallBuffer = 4.0; // Increased significantly to keep props well away from walls
    const positions = [
      // Near left wall
      { 
        x: room.x - room.width/2 + wallBuffer, 
        z: room.z + this.rand.float(-room.depth/2 + wallBuffer, room.depth/2 - wallBuffer)
      },
      // Near right wall
      { 
        x: room.x + room.width/2 - wallBuffer, 
        z: room.z + this.rand.float(-room.depth/2 + wallBuffer, room.depth/2 - wallBuffer)
      },
      // Near top wall
      { 
        x: room.x + this.rand.float(-room.width/2 + wallBuffer, room.width/2 - wallBuffer),
        z: room.z - room.depth/2 + wallBuffer
      },
      // Near bottom wall
      { 
        x: room.x + this.rand.float(-room.width/2 + wallBuffer, room.width/2 - wallBuffer),
        z: room.z + room.depth/2 - wallBuffer
      }
    ];

    // Create a copy of the positions array and shuffle it
    const shuffledPositions = [...positions];
    this.rand.shuffle(shuffledPositions);
    
    // Try each wall position
    for (const pos of shuffledPositions) {
      if (this.isPositionValid(pos.x, pos.z, minDistance) && 
          this.isInRoomBounds(pos.x, pos.z, room, minDistance)) {
        return pos;
      }
    }
    return null;
  }

  private isInRoomBounds(x: number, z: number, room: RoomDef, margin: number): boolean {
    // Add extra margin to ensure 4-unit clearance from walls
    const effectiveMargin = Math.max(margin, 4.0);
    return x >= (room.x - room.width / 2 + effectiveMargin) &&
           x <= (room.x + room.width / 2 - effectiveMargin) &&
           z >= (room.z - room.depth / 2 + effectiveMargin) &&
           z <= (room.z + room.depth / 2 - effectiveMargin);
  }

  private isInCorner(room: RoomDef, x: number, z: number, margin: number): boolean {
    const halfWidth = room.width / 2 - margin;
    const halfDepth = room.depth / 2 - margin;
    
    return (
      (Math.abs(x - (room.x - halfWidth)) < margin && 
       Math.abs(z - (room.z - halfDepth)) < margin) || // Top-left corner
      (Math.abs(x - (room.x + halfWidth)) < margin && 
       Math.abs(z - (room.z - halfDepth)) < margin) || // Top-right corner
      (Math.abs(x - (room.x - halfWidth)) < margin && 
       Math.abs(z - (room.z + halfDepth)) < margin) || // Bottom-left corner
      (Math.abs(x - (room.x + halfWidth)) < margin && 
       Math.abs(z - (room.z + halfDepth)) < margin)    // Bottom-right corner
    );
  }
 
  private isTooCloseToWall(room: RoomDef, x: number, z: number, radius: number): boolean {
    const wallBuffer = 4.0; // 4-unit clearance from walls
    const halfWidth = room.width / 2 - wallBuffer;
    const halfDepth = room.depth / 2 - wallBuffer;
    
    // Check distance from each wall
    const distFromLeft = Math.abs(x - (room.x - halfWidth));
    const distFromRight = Math.abs(x - (room.x + halfWidth));
    const distFromTop = Math.abs(z - (room.z - halfDepth));
    const distFromBottom = Math.abs(z - (room.z + halfDepth));
    
    return (
      distFromLeft < radius + wallBuffer ||
      distFromRight < radius + wallBuffer ||
      distFromTop < radius + wallBuffer ||
      distFromBottom < radius + wallBuffer
    );
  }

  private maybeLoot(chance: number, lootTypes: Array<{type: string, min: number, max: number, weight: number}>): {type: string, amount: number} | undefined {
    if (!this.rand.chance(chance)) {
      return undefined;
    }
    const lootType = this.chooseLootType(lootTypes);
    return {
      type: lootType.type,
      amount: this.rand.int(lootType.min, lootType.max)
    };
  }

  private addHotspot(x: number, z: number, roomId: string, weight: number) {
    this.hotspots.push({ x, z, roomId, weight });
  }

  private addGroundItem(room: RoomDef, props: PropDef[]) {
    const position = this.findValidPosition(room, 1.0, false);
    if (!position) return;

    // Create a small ground item (like ammo or health)
    const itemType = this.rand.pick([
      { type: 'ammo-pistol', amount: 5 },
      { type: 'ammo-rifle', amount: 3 },
      { type: 'health', amount: 10 },
      { type: 'armor', amount: 5 }
    ]);

    const prop: PropDef = {
      type: 'crate_ammo', // Small ammo box visual
      x: position.x,
      y: -2,
      z: position.z,
      scale: 0.5, // Smaller visual
      loot: itemType
    };
    
    props.push(prop);
  }
}
