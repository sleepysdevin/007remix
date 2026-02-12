import { createRNG, Random } from "./utils/level-generator-random";
import { RoomGenerator } from "./generators/room-generator";
import { DoorGenerator } from "./generators/door-generator";
import { EnemyGenerator } from "./generators/enemy-generator";
import { PickupGenerator } from "./generators/pickup-generator";
import { PropGenerator } from "./generators/prop-generator";
import { ObjectiveGenerator } from "./generators/objective-generator";
import type { LevelSchema, SpawnDef } from "./types/level-schema";
import type { GenerationOptions, BuildState } from "./types/level-generator-types";

export class LevelGenerator {
  private random: Random;
  private roomGenerator: RoomGenerator;
  private doorGenerator: DoorGenerator;
  private enemyGenerator: EnemyGenerator;
  private pickupGenerator: PickupGenerator;
  private propGenerator: PropGenerator;
  private objectiveGenerator: ObjectiveGenerator;
  private counters = {
    room: 0,
    door: 0,
    enemy: 0,
    pickup: 0,
    objective: 0,
    trigger: 0,
  };

  constructor(seed?: number) {
    const rng = createRNG(seed);
    this.random = new Random(rng);
    this.roomGenerator = new RoomGenerator(this.random);
    this.doorGenerator = new DoorGenerator(this.random);
    this.enemyGenerator = new EnemyGenerator(this.random);
    this.pickupGenerator = new PickupGenerator(this.random);
    // Initialize with empty doors array, will be updated before use
    this.propGenerator = new PropGenerator(this.random, []);
    this.objectiveGenerator = new ObjectiveGenerator(this.random);
  }

  generate(options: Partial<GenerationOptions> = {}): LevelSchema {
    this.resetCounters();
    
    const defaultOptions: GenerationOptions = {
      minRooms: 6,
      maxRooms: 12,
      minEnemies: 3,
      maxEnemies: 8,
      difficulty: "medium",
      ...options
    };

    // Phase 1: Generate rooms
    const roomCount = this.random.int(
      defaultOptions.minRooms,
      defaultOptions.maxRooms
    );
    
    const { rooms, mainPathEdges } = this.roomGenerator.generateRooms(roomCount);

    // Phase 2: Generate doors and build room graph
    const { doors, graph } = this.doorGenerator.generateDoors(
      rooms,
      mainPathEdges,
      defaultOptions
    );

    // Phase 3: Generate enemies
    const enemies = this.enemyGenerator.generateEnemies(rooms, defaultOptions);

    // Set player spawn in the first room, more centered and away from walls
    let playerSpawn: SpawnDef = { x: 0, y: 0, z: 0 }; // ✅ Explicit SpawnDef type
    if (rooms.length > 0) {
      const firstRoom = rooms[0];
      // Position player more towards the center of the room
      // but leave some margin from the walls (1/4 of room dimensions)
      const marginX = firstRoom.width / 4;
      const marginZ = firstRoom.depth / 4;
      
      // Use floor-level Y (same logic as enemy generator) so the builder's
      // ground raycast starts inside the room, not above the ceiling.
      const floorY = firstRoom.y - firstRoom.height / 2;
      playerSpawn = {
        x: firstRoom.x,
        y: floorY + 0.1,
        z: firstRoom.z - marginZ, // Position towards front of room
        facingAngle: 0,
      };
      
      console.log(`[LevelGenerator] Player spawn set to (${playerSpawn.x}, ${playerSpawn.y}, ${playerSpawn.z}) in room ${firstRoom.id}`);
    }

    // Phase 4: Generate props and get hotspots
    // Update prop generator with current doors and player spawn
    this.propGenerator = new PropGenerator(this.random, doors);
    this.propGenerator.setPlayerSpawn({ x: playerSpawn.x, z: playerSpawn.z });
    const { props, hotspots } = this.propGenerator.generateProps(rooms);

    // Phase 5: Generate pickups (using hotspots for better distribution)
    const pickups = this.pickupGenerator.generatePickups(
      rooms,
      doors,
      graph,
      defaultOptions
    );

    // Phase 6: Generate objectives and triggers
    const { objectives, triggers } = this.objectiveGenerator.generateObjectives(rooms, graph);

    // Create the complete level
    const level: LevelSchema = {
      name: this.generateLevelName(),
      briefing: this.generateBriefing(),
      rooms,
      doors,
      playerSpawn, // Use the spawn we calculated
      enemies,
      pickups,
      objectives,
      triggers,
      props,
    };

    // Phase 7: Validate the level
    const issues = this.validateLevel(level);
    if (issues.length > 0) {
      console.warn("Level generation issues:", issues);
    }

    return level;
  }

  private resetCounters(): void {
    this.counters = {
      room: 0,
      door: 0,
      enemy: 0,
      pickup: 0,
      objective: 0,
      trigger: 0,
    };
  }

  private generateLevelName(): string {
    const prefixes = ["Covert", "Shadow", "Midnight", "Silent", "Stealth", "Black", "Phantom", "Ghost"];
    const suffixes = ["Facility", "Outpost", "Bunker", "Complex", "Station", "Base", "Compound", "Site"];
    const prefixes2 = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Gamma"];
    
    if (this.random.chance(0.3)) {
      return `${this.random.pick(prefixes)} ${this.random.pick(prefixes2)}`;
    }
    return `${this.random.pick(prefixes)} ${this.random.pick(suffixes)}`;
  }

  private generateBriefing(): string {
    const locations = [
      "an underground facility",
      "a remote outpost",
      "a classified research complex",
      "a high-security compound",
      "a black site",
      "an enemy stronghold"
    ];
    
    const objectives = [
      "Eliminate all hostiles in the area.",
      "Retrieve the classified intelligence documents.",
      "Neutralize the enemy commander.",
      "Destroy the prototype weapon system.",
      "Extract the captured operative.",
      "Disable the security systems.",
      "Recover the stolen data.",
      "Plant surveillance devices."
    ];
    
    const complications = [
      "Enemy reinforcements may be in the area.",
      "The facility is on high alert.",
      "Hostiles are equipped with advanced weaponry.",
      "Security systems are active and monitoring.",
      "The area may contain hazardous materials.",
      "Enemy snipers have been spotted in the area.",
      "The facility is rigged with explosives."
    ];
    
    const location = this.random.pick(locations);
    const primaryObjective = this.random.pick(objectives);
    const secondaryObjective = this.random.pick([...objectives.filter(o => o !== primaryObjective), ""]);
    const complication = this.random.chance(0.7) ? `\n\nComplication: ${this.random.pick(complications)}` : '';
    
    return `MISSION BRIEFING\n\nLocation: ${location[0].toUpperCase() + location.slice(1)}\n\nPRIMARY OBJECTIVE:\n- ${primaryObjective}${secondaryObjective ? '\n\nSECONDARY OBJECTIVE:\n- ' + secondaryObjective : ''}${complication}\n\nGood luck, agent.`;
  }
  
  private validateLevel(level: LevelSchema): string[] {
    const issues: string[] = [];
    
    // Check if player spawn is set
    if (!level.playerSpawn) {
      issues.push("No player spawn point set");
    }
    
    // Check if there are any enemies
    if (level.enemies.length === 0) {
      issues.push("No enemies generated in the level");
    }
    
    // Check if there are any pickups
    if (level.pickups.length === 0) {
      issues.push("No pickups generated in the level");
    }
    
    // Check if there are any objectives
    if (level.objectives.length === 0) {
      issues.push("No objectives generated for the level");
    }
    
    // Check if there are any rooms
    if (level.rooms.length === 0) {
      issues.push("No rooms generated in the level");
    }
    
    return issues;
  }
}

export default LevelGenerator;
