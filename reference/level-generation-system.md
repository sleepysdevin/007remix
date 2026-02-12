# Level Generation System Reference

## Overview
The level generation system creates procedurally generated levels with a modular, component-based architecture. It produces complete level definitions including rooms, doors, enemies, pickups, objectives, and environmental props.

## Architecture

### Core Components

1. **LevelGenerator** (Main Class)
   - Orchestrates the generation process
   - Manages the random number generator
   - Coordinates between different generators
   - Handles final level assembly

2. **Generators**
   - `RoomGenerator`: Creates and places rooms
   - `DoorGenerator`: Handles door placement and room connectivity
   - `EnemyGenerator`: Places enemies with patrol paths
   - `PickupGenerator`: Distributes items and weapons
   - `PropGenerator`: Adds environmental props and decoration
   - `ObjectiveGenerator`: Creates mission objectives and triggers

3. **Validation**
   - `LevelValidator`: Ensures level playability
   - Automatically fixes common issues
   - Validates room connectivity and object placement

## Data Flow

1. **Initialization**
   - LevelGenerator is instantiated with an optional seed
   - All sub-generators are initialized with the same RNG

2. **Generation Pipeline**
   ```
   Rooms → Doors → Enemies → Props → Pickups → Objectives → Validation
   ```

3. **Final Output**
   - A complete `LevelSchema` object
   - Validated and ready for use by the game engine

## Configuration Options

```typescript
interface GenerationOptions {
  minRooms: number;      // Minimum number of rooms (default: 6)
  maxRooms: number;      // Maximum number of rooms (default: 12)
  minEnemies: number;    // Minimum number of enemies (default: 5)
  maxEnemies: number;    // Maximum number of enemies (default: 15)
  difficulty: 'easy' | 'medium' | 'hard';  // Difficulty level
}
```

## Key Features

### Room Generation
- Creates varied room layouts
- Ensures proper spacing and connectivity
- Supports different room types and sizes

### Door System
- Smart door placement between rooms
- Handles locked doors and keys
- Maintains level connectivity

### Enemy Placement
- Distributes enemies based on difficulty
- Creates patrol paths and waypoints
- Avoids overcrowding

### Item Distribution
- Places weapons, ammo, and health packs
- Ensures balanced item placement
- Prevents item clustering

### Objectives
- Creates primary and secondary objectives
- Sets up triggers for objective completion
- Ensures objectives are reachable

### Validation
- Checks for orphaned objects
- Verifies level connectivity
- Fixes common generation issues

## Usage Example

```typescript
import { LevelGenerator } from '../src/levels/level-generator';

// Create a new generator with a fixed seed for reproducibility
const generator = new LevelGenerator(12345);

// Generate a level with custom options
const level = generator.generate({
  minRooms: 8,
  maxRooms: 15,
  minEnemies: 8,
  maxEnemies: 20,
  difficulty: 'hard'
});

// Use the generated level
console.log(`Generated level: ${level.name}`);
console.log(`Contains ${level.rooms.length} rooms and ${level.enemies.length} enemies`);
```

## Extending the System

### Adding New Features

1. **New Room Types**
   - Add new room templates to `RoomGenerator`
   - Update room selection logic

2. **New Enemy Types**
   - Extend `EnemyGenerator` with new enemy configurations
   - Update spawn probabilities based on difficulty

3. **New Objectives**
   - Add new objective types to `ObjectiveGenerator`
   - Create corresponding trigger types

### Customization Hooks

Override generator methods to customize behavior:

```typescript
class CustomEnemyGenerator extends EnemyGenerator {
  protected chooseEnemyType() {
    // Custom enemy selection logic
  }
}
```

## Best Practices

1. **Seeding**
   - Always provide a seed for reproducible generation
   - Use different seeds for different level variations

2. **Performance**
   - Cache expensive calculations
   - Limit the number of generation attempts
   - Use spatial partitioning for collision detection

3. **Testing**
   - Test with various seeds and configurations
   - Verify level connectivity and playability
   - Check for edge cases in room placement

## Troubleshooting

### Common Issues

1. **Overlapping Rooms**
   - Increase minimum room spacing
   - Adjust room size constraints

2. **Unreachable Areas**
   - Check door placement
   - Verify connectivity in the room graph

3. **Performance Problems**
   - Reduce maximum generation attempts
   - Optimize collision detection

## Version History

- **1.0.0**: Initial refactored version
  - Modular architecture
  - Basic room and door generation
  - Enemy and item placement
  - Objective system
  - Validation and repair

## Future Improvements

- [ ] Support for multi-level facilities
- [ ] More varied room shapes and themes
- [ ] Dynamic difficulty adjustment
- [ ] Better visualization tools
- [ ] Performance optimizations
