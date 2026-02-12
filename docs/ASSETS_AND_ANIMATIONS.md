# GLB/VRM, Animations & 3D/2D Assets Guide

Reference doc for character and player assets — where things live, how they're loaded, and how to add new models or sprites.

---

## 1. Model Formats & Paths

| Format | Loader | Path | Use Case |
|--------|--------|------|----------|
| **GLB** | GLTFLoader | `public/models/` | Skinned meshes, generic rigs |
| **VRM** | GLTFLoader + VRMLoaderPlugin | `public/models/` | Humanoid avatars (VRM 0.x / 1.0) |

**Base path:** `/models/` (served from `public/models/`)

**Subfolders:**
- `enemies/` — Enemy models
- `players/` — Player/remote avatars
- `characters/` — Shared assets (either)

**Config:** `ENEMY_RENDER_CONFIG.customModelPath`, `customPlayerModelPath` in `src/enemies/enemy-render-config.ts`

---

## 2. Animations

### 2.1 Standalone animation GLBs (Mixamo)

**Location:** `public/models/animations/`

**Files tried (by name):**
- `idle.glb`, `walk.glb`, `run.glb`
- `death.glb`, `attack.glb`, `hit.glb`

**Config:** `ENEMY_RENDER_CONFIG.customAnimationsPath = 'animations'`

**Retargeting:** Mixamo bone names (`mixamorigHips`, `mixamorigSpine`, etc.) are mapped to VRM humanoid names (`hips`, `spine`, `chest`, etc.) via `MIXAMO_TO_HUMANOID` in `src/core/animation-loader.ts`.

**Requirements:** Same rig as character (e.g. Mixamo "With Skin" or "Without Skin"); animations are retargeted onto the loaded model.

---

### 2.2 Pose JSON (VRM-only)

**Location:** `public/animations/`

**Format:**
```json
{
  "duration": 1.5,
  "frames": [
    {
      "time": 0,
      "bones": {
        "Hips": { "x": 0, "y": 0, "z": 0, "w": 1 },
        "Spine": { "x": 0, "y": 0, "z": 0, "w": 1 }
      }
    }
  ]
}
```

**Bone names:** Mapped to VRM humanoid via `POSE_JSON_BONE_MAP` in `animation-loader.ts` (e.g. `LeftHandThumb1` → `leftThumbMetacarpal`).

---

### 2.3 Pose library (procedural / low-poly)

**File:** `src/enemies/model/pose-library.ts`

**Animations:** `idle`, `walk`, `alert`, `shoot`, `hit`, `death`

**Pose format:** Joint rotations (radians) keyframed over time:
- `hipsY`, `torsoX`, `torsoZ`, `headX/Y/Z`
- `leftShoulderX`, `leftShoulderZ`, `rightShoulderX`, `rightShoulderZ`
- `leftElbowX`, `rightElbowX`
- `leftHipX`, `rightHipX`, `leftKneeX`, `rightKneeX`

**Used by:** Procedural guard model (`guard-model-factory.ts`), sprite baker (procedural + VRM bake).

---

### 2.4 VRM pose mapper

**File:** `src/enemies/sprite/vrm-pose-mapper.ts`

Maps `Pose` (pose-library joint angles) → VRM `setNormalizedPose()` format for sprite baking from VRM models.

---

## 3. 3D Models

### 3.1 Procedural enemy model

**File:** `src/enemies/model/guard-model-factory.ts`

- Low-poly humanoid built from box/capsule geometry
- Variants: `guard`, `soldier`, `officer` (colors, headgear)
- Driven by `PoseAnimator` + `pose-library.ts`
- No external assets

### 3.2 Custom enemy model (GLB/VRM)

**File:** `src/enemies/model/enemy-custom-model.ts`

- Loaded via `loadCharacterModel()` / `preloadCustomEnemyModel()`
- VRM: `copyNormalizedToRaw()` each frame so animation applies
- Foot IK, ragdoll on death
- **Ragdoll bones:** VRM humanoid names (see §5)

### 3.3 Procedural player model

**File:** `src/player/player-model.ts` — `buildPlayerModel()`

- Low-poly humanoid with player colors
- Animated by `animatePlayerMovement()`, `playFireAnimation()`, `updateAimingPose()`
- Hierarchy: `hips` → torso, head, arms, legs

### 3.4 Custom player model (GLB/VRM)

**File:** `src/player/player-model.ts` — `buildPlayerModelFromCharacter()`

- Clones `char.scene`, scales to `TARGET_PLAYER_HEIGHT` (1.7m)
- Uses `attachToRoot: true` for weapon (no hand bone)
- Custom models skip procedural walk/animation for now
- **Weapon attach:** `userData.weaponAttachPoint` with `{ x, y, z, rotationX/Y/Z, attachToRoot }`

---

## 4. 2D Sprites

### 4.1 Sprite sources

| Source | Description | Config |
|--------|-------------|--------|
| `procedural` | Canvas-drawn guard variant | `spriteSource: 'procedural'` |
| `baked` | Runtime 3D → sprite sheet (WebGL render) | `spriteSource: 'baked'` |
| `image` | Preloaded PNG sprite sheet | `spriteSource: 'image'`, `spriteImageUrl` |

### 4.2 Sprite sheet layout (5×3 atlas)

**Layout:** `src/enemies/sprite/guard-sprite-sheet.ts`

- **Dimensions:** 320×288 px (5 cols × 3 rows, 64×96 per frame)
- **Frame order:**

| Frames | Animation |
|--------|-----------|
| 0–1 | idle |
| 2–3 | alert |
| 4–5 | shoot |
| 6–7 | hit |
| 8–10 | death |
| 11–12 | walk |

### 4.3 Sprite animator

**File:** `src/enemies/sprite/sprite-animator.ts`

- `AnimationName`: `idle`, `alert`, `shoot`, `hit`, `death`, `walk`
- Frame indices, FPS, loop per animation
- Outputs UV offsets (`offsetX`, `offsetY`)

### 4.4 Sprite baker

**File:** `src/enemies/sprite/sprite-baker.ts`

- `bakeGuardSpriteSheet(variant)` — procedural guard model → texture
- `bakeCustomModelSpriteSheet(char)` — VRM/GLB → texture using pose-library poses
- **Frame poses:** `FRAME_POSES` maps frame index → `[animationName, keyframeIndex]`

### 4.5 Preload

```ts
preloadEnemySpriteSheet('/sprites/enemy-guard.png');
// then setEnemyRenderConfig({ mode: 'sprite', spriteSource: 'image', spriteImageUrl: '/sprites/enemy-guard.png' });
```

---

## 5. Bone Mappings

### 5.1 VRM humanoid (standard)

Used by VRM models, animation retargeting, ragdoll:

| Humanoid | Common alias |
|----------|--------------|
| `hips`, `spine`, `chest` | torso chain |
| `head` | head |
| `leftUpperArm`, `leftLowerArm` | left arm |
| `rightUpperArm`, `rightLowerArm` | right arm |
| `leftUpperLeg`, `leftLowerLeg` | left leg |
| `rightUpperLeg`, `rightLowerLeg` | right leg |

### 5.2 Ragdoll bones

**File:** `src/enemies/ragdoll.ts`

Ragdoll segments map to VRM humanoid:

- `hips`, `spine`, `chest`, `head`
- `leftUpperArm`, `leftLowerArm`, `rightUpperArm`, `rightLowerArm`
- `leftUpperLeg`, `leftLowerLeg`, `rightUpperLeg`, `rightLowerLeg`

**Mapping:** `buildRagdollBoneMapping(vrm)` uses `humanoid.getRawBoneNode()` to map VRM bone names → ragdoll body IDs.

---

## 6. Checklist: Adding a New Character

### Enemies
1. Place GLB/VRM in `public/models/enemies/`
2. Set `customModelPath` in `ENEMY_RENDER_CONFIG`
3. (Optional) Add animations to `public/models/animations/`, set `customAnimationsPath`
4. For 2D sprites: use `spriteSource: 'baked'` (runtime bake) or pre-bake to PNG

### Players (remote)
1. Place GLB/VRM in `public/models/players/`
2. Set `customPlayerModelPath` in `ENEMY_RENDER_CONFIG`
3. Weapon attach: `userData.weaponAttachPoint` on model root
4. Procedural animation: not yet supported for custom player models

### New sprite sheet
1. Match 5×3 layout, 64×96 per frame
2. Frame order: idle(0–1), alert(2–3), shoot(4–5), hit(6–7), death(8–10), walk(11–12)
3. Preload with `preloadEnemySpriteSheet(url)`, set `spriteSource: 'image'`, `spriteImageUrl`
