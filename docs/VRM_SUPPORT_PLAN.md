# VRM Support Plan

Plan for adding VRM model support alongside existing GLB/GLTF. VRM files go in the same `public/models/` folder.

---

## Status: All Phases Implemented

- **Phase 1**: VRM loader utility — done
- **Phase 2**: Unified `loadCharacterModel()` — done
- **Phase 3**: Enemy + remote player integration — done
- **Phase 4**: VRM sprite baking with bone mapping — done

---

## Overview

VRM is a humanoid avatar format (VRM 0.x / 1.0). Load via `@pixiv/three-vrm` which registers a plugin with GLTFLoader. Models live in `public/models/` (e.g. `public/models/characters/agent.vrm`).

---

## Dependencies

```bash
npm install @pixiv/three-vrm
```

Installed. Compatible with Three.js ^0.172.0. three-vrm v3 targets VRM 1.0 and supports both older and newer VRMs.

---

## Implementation Phases

### Phase 1: VRM Loader Utility ✅

[src/core/model-loader.ts](src/core/model-loader.ts):

- Add conditional VRMLoaderPlugin registration when loading `.vrm` files
- New function: `loadVRM(path: string): Promise<LoadedVRM>`
- `LoadedVRM` interface: `{ vrm: VRM; scene: THREE.Group }` (vrm.scene is the root)

```ts
// Pattern from @pixiv/three-vrm docs
loader.register((parser) => new VRMLoaderPlugin(parser));
// Load .vrm → gltf.userData.vrm contains VRM instance
```

Use a separate loader instance for VRM (or register the plugin once) to avoid affecting GLB-only loads.

### Phase 2: Model Loader Unification ✅

`loadCharacterModel(path)` detects format by extension:

```ts
loadCharacterModel(path: string): Promise<LoadedGLTF | LoadedVRM>
```

- `.glb` / `.gltf` → existing `loadModel()`, return `{ scene, animations, ... }`
- `.vrm` → `loadVRM()`, return `{ scene: vrm.scene, vrm, animations: vrm expression?, ... }`

Normalize so callers get a `scene: THREE.Group` in both cases.

### Phase 3: Integration Points ✅

**Enemies**  
- Config: `enemyModelSource: 'procedural' | 'glb' | 'vrm'` with path
- Swap `createGuardModel()` for loaded VRM/GLB when configured
- VRM humanoid rig may need retargeting for pose-library (idle, walk, shoot, etc.) — or use VRM’s built-in animations if present

**Players (remote)**  
- Replace `buildPlayerModel()` with loaded VRM/GLB for third-person view
- Weapon attachment point would need to be configured per model (e.g. hand bone)

**Sprite baking**  
- Offline baker: load VRM, drive skeleton from pose-library keyframes (if bone names map), render to sprite sheet
- Requires mapping our pose joints (leftShoulder, rightElbow, etc.) to VRM humanoid bone names (e.g. `mixamorigLeftArm`, `mixamorigRightForeArm`)

### Phase 4: VRM-Specific Features (Optional)

- **LookAt**: Use `vrm.lookAt` to aim head/eyes at camera or target
- **Expressions**: Use `vrm.expressionManager` for hit/death/alert
- **SpringBone**: Enable physics-based hair/cloth if needed

---

## File Structure

```
public/models/
├── enemies/          # GLB or VRM for enemies
│   └── guard.glb
├── players/          # GLB or VRM for player avatars
│   └── agent.vrm
└── characters/       # Shared character assets
    └── custom.vrm
```

---

## Bone Mapping (VRM → Pose Library)

VRM humanoid uses standard bone names. Our pose-library drives: `hips`, `torso`, `head`, `leftShoulder`, `rightShoulder`, `leftElbow`, `rightElbow`, `leftHip`, `rightHip`, `leftKnee`, `rightKnee`.

| Our joint   | VRM 1.0 bone        | VRM 0.x / Mixamo       |
|-------------|---------------------|-------------------------|
| hips        | pelvis              | mixamorigHips           |
| torso       | spine/chest          | mixamorigSpine          |
| head        | head                | mixamorigHead           |
| leftShoulder| leftUpperArm         | mixamorigLeftArm        |
| rightShoulder| rightUpperArm        | mixamorigRightArm       |
| leftElbow   | leftLowerArm         | mixamorigLeftForeArm    |
| rightElbow  | rightLowerArm        | mixamorigRightForeArm   |
| leftHip     | leftUpperLeg         | mixamorigLeftUpLeg      |
| rightHip    | rightUpperLeg        | mixamorigRightUpLeg     |
| leftKnee    | leftLowerLeg         | mixamorigLeftLeg        |
| rightKnee   | rightLowerLeg        | mixamorigRightLeg       |

A bone-mapping layer would map our pose angles to the VRM skeleton for sprite baking or in-game animation.

---

## Usage

**Enemies (GLB or VRM):**
```ts
// In enemy-render-config.ts or at init
ENEMY_RENDER_CONFIG.customModelPath = 'enemies/void_4003GasMask.glb';  // or 'characters/agent.vrm'
```

**Remote players (multiplayer):**
```ts
ENEMY_RENDER_CONFIG.customPlayerModelPath = 'players/agent.vrm';  // or 'characters/agent.glb'
```
Place VRM/GLB in `public/models/` and preload runs at init.

---

## References

- [@pixiv/three-vrm docs](https://pixiv.github.io/three-vrm/docs/)
- [VRM spec](https://vrm.dev/)
- [three-vrm examples](https://pixiv.github.io/three-vrm/packages/three-vrm/examples)
