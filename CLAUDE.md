# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Development server**: `npm run dev` (starts Vite dev server on http://localhost:5173)
- **Multiplayer server**: `npm run server` (starts Socket.IO game server on port 3001)
- **Build**: `npm run build` (TypeScript compilation + production build)
- **Preview build**: `npm run preview` (preview production build locally)

## Project Overview

007 Remix is a browser-based first-person shooter inspired by GoldenEye 007, built with Three.js for 3D rendering and Rapier3D for physics simulation. It features both a quick-play mode (single-room test arena) and mission mode (multi-room facilities with objectives). The game supports real-time multiplayer via Socket.IO with authoritative server validation.

## Multiplayer Architecture

### Network Layer

- **Client**: `src/network/network-manager.ts` handles Socket.IO connection, state updates, and event callbacks
- **Server**: `server/server.ts` manages Socket.IO connections and routes events to GameRoom
- **Events**: `src/network/network-events.ts` defines all network message types (connection, state sync, combat, equipment)
- **Game room**: `server/game-room.ts` authoritative game state, player management, hit validation, anti-cheat

### Network Protocol

- **State sync**: Client sends player state at 20Hz (`sendPlayerState`), server broadcasts full snapshot at 20Hz
- **Combat events**: Client sends weapon fire with hit claim → server validates range/LOS/fire-rate → broadcasts damage if confirmed
- **Equipment events**: Grenade throw/explosion, flashlight toggle, destructible destruction (server-authoritative damage)
- **Ping tracking**: Client measures roundtrip time from state update send to snapshot receive

### Server-Side Validation (Anti-Cheat)

- **Movement speed**: Server validates position changes against max speed (9.9 units/s) with 50% tolerance for lag
- **Fire rate**: Server validates time between shots against weapon fire rates (90% tolerance)
- **Hit validation**: Server checks victim alive, distance within weapon range, line-of-sight (basic)
- **Headshot detection**: Server checks hit point Y-coordinate above threshold (0.5m above capsule center), applies 2x multiplier or instakill (sniper/shotgun)

### Remote Players

- **Manager**: `src/player/remote-player-manager.ts` spawns/updates/removes remote players from server snapshots
- **Remote player**: `src/player/remote-player.ts` interpolates position/rotation, renders player model with weapon, displays username tag
- **Interpolation**: `src/network/interpolation-buffer.ts` smooths remote player movement over network jitter
- **Collider mapping**: Remote player manager maps Rapier collider handles to player IDs for hit detection

### Game Modes

- **Deathmatch**: First to 25 kills wins, 3-second respawn delay
- **Game over**: Server broadcasts `GameOverEvent` when win condition met
- **Level state reset**: When room becomes empty, server resets destroyed destructibles and game state for next session

## Core Architecture

### Entry Point & Initialization

- **Entry**: `src/main.ts` → patches Three.js Object3D properties (fixes browser extension conflicts) → initializes physics → creates Game instance
- **Game class**: `src/game.ts` orchestrates all systems (rendering, physics, input, enemies, weapons, UI)
- Game runs a fixed-step physics loop (60Hz) with variable-rate rendering

### Physics System (Rapier WASM)

- **Critical**: `src/core/physics-world.ts` wraps Rapier3D-compat
- **Collider comparison**: NEVER use `===` on Rapier colliders (WASM wrappers recreate objects). Use `collider.handle === other.handle` for identity checks
- Character controller: kinematic capsule for player with auto-step and snap-to-ground
- Enemies: kinematic bodies (AI-controlled movement)
- Static geometry: fixed rigid bodies (walls, floors, crates)

### Player System

- **Controller**: `src/player/player-controller.ts` — handles WASD movement, jumping, sprinting, crouching
- **Camera**: `src/player/fps-camera.ts` — mouse-look FPS camera with smooth crouch transitions
- Crouch: resizes capsule collider, lowers camera, reduces movement speed
- Health/armor system with damage absorption (armor absorbs 60%)

### Weapon System

- **Base**: `src/weapons/weapon-base.ts` — defines stats (damage, fire rate, spread, range, ammo)
- **Manager**: `src/weapons/weapon-manager.ts` — handles weapon switching, ammo, reloading, view model bobbing
- **Projectile**: `src/weapons/projectile-system.ts` — hitscan raycasting with bullet hole decals and impact particles
- **Grenade**: `src/weapons/grenade-system.ts` — throwable gas/frag grenades with arc physics
- Weapons: pistol, rifle, shotgun, sniper (each with unique stats and procedural textures)
- View models: 3D mesh rendered in second camera layer (viewModel.layers.set(1)) to avoid clipping
- Skins: customizable weapon skins with procedural textures (Canvas2D → CanvasTexture)

### Enemy System

- **Base**: `src/enemies/enemy-base.ts` — health, facing, damage, fire rate
- **Manager**: `src/enemies/enemy-manager.ts` — spawns enemies, handles updates, hit detection
- **AI**: `src/enemies/ai/state-machine.ts` + states (idle, patrol, alert, attack)
- **Perception**: `src/enemies/ai/perception.ts` — line-of-sight checks, noise detection (gunshots, movement)
- **Rendering**: Two modes available
  - **Sprite mode**: `src/enemies/sprite/enemy-sprite.ts` — billboard sprites with sprite sheet animation (idle, walk, attack, death)
  - **Model mode**: `src/enemies/model/enemy-model.ts` + `guard-model-factory.ts` — procedural 3D character models with pose animation
- Billboard rendering: sprite always faces camera (no Y-axis rotation on mesh group)
- AI facing: `facingAngle` field (radians) used for perception/AI logic, NOT visual rotation
- Model animation: `pose-animator.ts` interpolates between poses from `pose-library.ts` based on state/facing

### Level System

- **Schema**: `src/levels/level-schema.ts` — TypeScript types for JSON level format
- **Loader**: `src/levels/level-loader.ts` — fetches JSON from `/public/levels/`
- **Builder**: `src/levels/level-builder.ts` — constructs 3D geometry from schema (rooms, doors, props, enemies, pickups)
- **Systems**:
  - `door-system.ts`: proximity and locked doors (key-card based)
  - `trigger-system.ts`: zone-based event triggers (objective completion, door unlocks)
  - `objective-system.ts`: mission objectives tracking
  - `pickup-system.ts`: health, armor, ammo, weapons, keys (with hover animation)
  - `destructible-system.ts`: crates (wood/metal) and barrels that explode, networked destruction in multiplayer
- Levels stored in: `public/levels/facility.json`

### Procedural Textures

- **Pattern**: `src/levels/procedural-textures.ts` — Canvas 2D → THREE.CanvasTexture → cached in module-level Map
- Textures: concrete walls, floor tiles, ceiling panels, wood crates, metal crates, barrels, weapon skins
- Settings: NearestFilter (pixel-art look), RepeatWrapping (tiling), clone for independent UV offsets
- All textures generated at runtime (no image assets)

### UI System

- `src/ui/hud.ts`: health, armor, ammo, crosshair, grenade count, pickup notifications, ping display (multiplayer)
- `src/ui/scope-overlay.ts`: sniper scope overlay (black bars + center reticle)
- `src/ui/damage-indicator.ts`: red flash when player takes damage
- `src/ui/hit-marker.ts`: hitmarker X when landing shots (multiplayer)
- `src/ui/briefing-screen.ts`: mission briefing before level start
- `src/ui/objectives-display.ts`: live objective tracker (top-left)
- `src/ui/inventory-screen.ts`: Tab to open, shows weapons/keys, weapon skin customization with 3D preview
- **Multiplayer UI**:
  - `lobby-screen.ts`: multiplayer lobby with username entry
  - `kill-feed.ts`: kill notifications (top-right)
  - `death-overlay.ts`: death screen with respawn timer
  - `game-over-overlay.ts`: winner announcement screen
  - `scoreboard.ts`: player list with kills/deaths (Tab to view)
  - `name-tags.ts`: 3D username labels above remote players
  - `screen-glitch.ts`: screen distortion effect

### Audio

- `src/audio/sound-effects.ts`: procedural AudioContext-based sounds (gunshots, reloads, footsteps, explosions)
- No external audio files — all sounds generated at runtime

## Key Technical Patterns

### Performance Optimizations

- Reusable vectors: avoid per-frame `new THREE.Vector3()` allocations (use class fields)
- Object pooling: PointLights (muzzle flash), particles (impact effects)
- Batched updates: all particles updated in single `projectileSystem.update(dt)` (no per-particle rAF loops)
- Shadow maps: 512×512, PCFShadowMap
- MeshBasicMaterial for non-lit objects (pickups, sprites, UI elements)

### Three.js Browser Extension Fix

- `src/main.ts` patches `Object.defineProperties` to add `writable: true` to position/rotation/quaternion/scale
- Fixes conflict with React DevTools and similar extensions that use `Object.assign`

### Game Loop Architecture

- Fixed-step physics (60Hz): accumulator pattern ensures deterministic physics regardless of frame rate
- Variable-rate rendering: Three.js renders at browser's refresh rate
- Input handling: key press state tracked per-frame, mouse deltas reset after each frame

## File Organization

```
src/
├── main.ts              # Entry point, Three.js patch, game initialization
├── game.ts              # Main Game class, orchestrates all systems
├── types.ts             # Shared TypeScript types
├── core/                # Core engine systems
│   ├── physics-world.ts # Rapier3D wrapper
│   ├── renderer.ts      # Three.js WebGL renderer setup
│   ├── game-loop.ts     # Fixed-step game loop
│   ├── input-manager.ts # Keyboard/mouse input
│   └── event-bus.ts     # Pub/sub event system
├── player/              # Player controller + FPS camera
│   ├── player-controller.ts       # Local player movement/actions
│   ├── fps-camera.ts              # First-person camera
│   ├── player-model.ts            # 3D player mesh (for remote players)
│   ├── remote-player.ts           # Remote player instance
│   └── remote-player-manager.ts   # Manages all remote players
├── network/             # Multiplayer networking (Socket.IO)
│   ├── network-manager.ts         # Client-side network API
│   ├── network-events.ts          # Network message types
│   ├── network-config.ts          # Server URL and settings
│   └── interpolation-buffer.ts    # Smooth remote player movement
├── weapons/             # Weapon system, projectiles, grenades
├── enemies/             # Enemy AI, sprite rendering, state machine
├── levels/              # Level loading, building, systems (doors, triggers, objectives, destructibles)
├── ui/                  # HUD, overlays, menus (includes multiplayer UI)
└── audio/               # Procedural sound effects

server/
├── server.ts            # Socket.IO server + connection handling
├── game-room.ts         # Authoritative game state, validation, anti-cheat
└── player-state.ts      # Server-side player state type

public/
└── levels/              # JSON level definitions (facility.json)
```

## Common Tasks

### Adding a New Weapon

1. Create weapon class in `src/weapons/weapons/` extending `WeaponBase`
2. Define stats: damage, fireRate, maxAmmo, spread, range, automatic, raysPerShot
3. Add texture generator in `src/weapons/weapon-textures.ts`
4. Register in `WeaponManager` constructor
5. **Multiplayer**: Update weapon damage/range/fire-rate in `server/game-room.ts` to match

### Adding a New Enemy Type

1. Create variant in `src/enemies/sprite/guard-sprite-sheet.ts`
2. Update sprite sheet generator with new animation frames
3. Spawn with `enemyManager.spawnEnemy({ x, y, z, facingAngle })`

### Creating a New Level

1. Create JSON file in `public/levels/` following `LevelSchema` format
2. Define rooms (axis-aligned boxes), doors (proximity or locked), enemies, pickups, objectives, triggers
3. Load via `loadLevel('/levels/your-level.json')` in `main.ts`

### Adding Multiplayer Events

1. Define event interface in `src/network/network-events.ts`
2. Add event type to `NetworkEventType` enum
3. Add send method to `NetworkManager` (client)
4. Add socket handler in `server/server.ts` → route to `GameRoom` method
5. Add receive callback in `NetworkManager` constructor
6. Wire callback in `game.ts` to trigger game logic

### Testing Multiplayer

1. Start server: `npm run server` (runs on port 3001)
2. Start client: `npm run dev` (runs on port 5173)
3. Open multiple browser tabs to localhost:5173
4. Enter username and click "Multiplayer" in each tab
5. Check server console for connection logs and validation messages

### Debugging Physics

- Rapier debug render: uncomment lines in `physics-world.ts` to visualize colliders
- Collider comparison: always use `collider.handle === other.handle`, never `===`
- Check `castRay` exclude filter when raycasting (excludeCollider parameter)

## Important Constraints

- **Rapier collider comparison**: Use handle comparison only
- **Procedural textures**: Cache in module-level Map to avoid recreating on every call
- **Billboard sprites**: Never set Y-rotation on enemy group mesh (billboard handles facing)
- **Weapon fire timing**: Use `performance.now()` for precise fire rate timing (not `dt` accumulation)
- **Fixed-step physics**: Always update physics in while-loop with PHYSICS_STEP constant (1/60)
- **Multiplayer sync rate**: Client sends state updates at 20Hz (every 50ms), server broadcasts at 20Hz
- **Server authority**: All damage/death/respawn events must be validated and broadcast by server
- **Weapon stat consistency**: Damage, range, and fire rate must match between client weapons and server validation
- **Network events**: Always include `timestamp` field (use `performance.now()` client-side, `Date.now()` server-side)
- **Remote player hit detection**: Use `remotePlayerManager.getPlayerByCollider()` to map Rapier colliders to player IDs
