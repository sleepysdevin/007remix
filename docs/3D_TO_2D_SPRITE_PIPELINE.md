# 3D → 2D Sprite Pipeline

How character 3D models are rendered to sprite sheets and used in-game.

---

## Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  3D Source      │     │  Sprite Baker    │     │  Runtime Use    │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ • Procedural     │     │ • WebGL render   │     │ • EnemySprite   │
│   guard model   │ ──► │ • Per-frame pose │ ──► │ • Billboard     │
│ • GLB/VRM       │     │ • 5×3 atlas      │     │ • UV animation  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

Three ways sprites are produced:

| Mode | When | Source | Output |
|------|------|--------|--------|
| **Procedural** | Canvas 2D draw | Guard variant (colors, headgear) | CanvasTexture (no 3D) |
| **Runtime bake** | At spawn | 3D model (procedural or GLB/VRM) | WebGL → CanvasTexture |
| **Offline bake** | `npm run bake-sprites` | Procedural guard | PNG → `public/sprites/` |

---

## Atlas Layout

All sprite sheets use the same 5×3 grid:

| Dimension | Value |
|-----------|-------|
| Frame size | 64×96 px |
| Atlas size | 320×288 px (5×3) |
| Format | RGBA, transparent background |

**Frame order (left-to-right, top-to-bottom):**

| Index | Animation | Notes |
|-------|-----------|-------|
| 0–1 | idle | Stand still |
| 2–3 | alert | On guard / aiming |
| 4–5 | shoot | Weapon fire |
| 6–7 | hit | Damage reaction |
| 8–10 | death | 3 frames, collapse |
| 11–12 | walk | Walk cycle |

---

## Runtime Baking

### Entry points

**File:** `src/enemies/sprite/sprite-baker.ts`

- **`bakeGuardSpriteSheet(variantName)`** — Procedural guard → texture
- **`bakeCustomModelSpriteSheet(char)`** — GLB/VRM → texture

### Flow

1. **Scene setup:** Transparent background, orthographic camera, lights
2. **Per frame (0–12):**
   - Set pose (procedural joints, VRM `setNormalizedPose`, or animation clip)
   - Render to `WebGLRenderTarget`
   - `readRenderTargetPixels` → flip Y → `ImageData` → draw to atlas canvas
3. **Output:** `CanvasTexture` with `NearestFilter`, cached by source key

### Pose sources by model type

| Model type | Pose source |
|------------|-------------|
| Procedural guard | `pose-library.ts` keyframes via `applyPose(joints, pose)` |
| VRM (humanoid) | `pose-library.ts` → `poseToVRMPose()` → `vrm.humanoid.setNormalizedPose()` |
| GLB / VRM with clips | `CUSTOM_FRAME_SAMPLES`: regex match clip name + time offset |

### VRM pose mapping

**File:** `src/enemies/sprite/vrm-pose-mapper.ts`

Maps pose-library joint names → VRM humanoid bone names and quaternions. Used when baking VRM models with the pose library (no animation clips).

### Custom model frame samples (GLB / animation clips)

**File:** `sprite-baker.ts` — `CUSTOM_FRAME_SAMPLES`

| Index | Clip pattern | Time (s) |
|-------|--------------|----------|
| 0, 1 | `idle` | 0, 0.5 |
| 2–5 | `attack` / `shoot` | 0, 0.2, 0, 0.1 |
| 6, 7 | `hit` | 0, 0.1 |
| 8, 9, 10 | `death` | 0, 0.3, 0.6 |
| 11, 12 | `walk` | 0, 0.2 |

Clip names are matched by regex. First matching clip is used. Alert slots (2–3) are filled by attack if no alert clip exists.

---

## Offline Baking (Puppeteer)

### Commands

```bash
npm run build:baker   # Builds dist-bake/ with bake-runner
npm run bake-sprites  # build:baker + Puppeteer → public/sprites/enemy-guard.png
```

### Pipeline

1. **`build:baker`** — Vite builds `scripts/bake.html` → `dist-bake/`
2. **`bake-sprites.ts`** — Starts HTTP server on port 39482, launches headless Chrome
3. **`bake-runner.ts`** — Loaded in browser, exposes `window.__runBake`
4. **`bakeRunner.bakeSpriteSheet()`** — Procedural guard only (no GLB/VRM in offline path)
5. Returns base64 PNG data URL
6. Script decodes, writes to `public/sprites/enemy-guard.png`

### What offline bake supports

- **Only** procedural guard model (guard variant)
- Uses same `FRAME_POSES` as runtime `bakeGuardSpriteSheet`
- Output: single PNG for use with `spriteSource: 'image'`

---

## Using baked sprites

### Config

```ts
// src/enemies/enemy-render-config.ts
setEnemyRenderConfig({
  mode: 'sprite',
  spriteSource: 'baked',  // or 'image' or 'procedural'
  spriteImageUrl: '/sprites/enemy-guard.png',  // when spriteSource: 'image'
  customModelPath: 'enemies/my_model.vrm',    // for baked custom model
});
```

### Spawn logic (`enemy-base.ts`)

| Config | Sprite source |
|--------|----------------|
| `mode: 'sprite'`, `customModelPath` set | `bakeCustomModelSpriteSheet(cachedModel)` |
| `mode: 'sprite'`, `spriteSource: 'baked'` | `bakeGuardSpriteSheet(variant.name)` |
| `mode: 'sprite'`, `spriteSource: 'image'` | `getPreloadedSpriteTexture()` (call `preloadEnemySpriteSheet(url)` at init) |
| `mode: 'sprite'`, else | Procedural `GuardVariant` → `generateGuardSpriteSheet()` |

### EnemySprite consumption

- Texture shared; each sprite clones it for independent UV `offset`
- `repeat.set(1/5, 1/3)` for frame size
- `SpriteAnimator` drives `offsetX`, `offsetY` from frame index
- Billboard: Y-axis only (faces camera horizontally)

---

## Adding a new character to the pipeline

### 1. Custom GLB/VRM

1. Place model in `public/models/enemies/`
2. Set `customModelPath` and `mode: 'sprite'`
3. **VRM:** Pose library drives bake (no clip required)
4. **GLB with clips:** Add clips to `public/models/animations/`, set `customAnimationsPath`; `CUSTOM_FRAME_SAMPLES` picks clips by name

### 2. New procedural variant

1. Add variant to `GUARD_VARIANTS` in `guard-sprite-sheet.ts`
2. Procedural: `drawFrame` in `guard-sprite-sheet.ts` handles frame drawing
3. Runtime bake: `bakeGuardSpriteSheet(variantName)` uses `createGuardModel(variant)` + pose library

### 3. Custom atlas layout

If you need a different grid (e.g. 4×4):

1. Update `COLS`, `ROWS`, `FRAME_W`, `FRAME_H` in `guard-sprite-sheet.ts`
2. Update `FRAME_POSES` / `CUSTOM_FRAME_SAMPLES` length
3. Update `SpriteAnimator` constructor (`COLS`, `ROWS`)
4. Update `sprite-animator.ts` animation frame indices

---

## Technical notes

### Y flip

WebGL `readRenderTargetPixels` has origin bottom-left; Canvas 2D is top-left. The baker flips each row when copying to `ImageData`.

### Materials for bake

Custom GLB/VRM: `fixMaterialsForSprite()` converts PBR/Lambert to `MeshBasicMaterial` (no lights needed for sprite capture, keeps colors).

### Caching

- `bakeGuardSpriteSheet`: cache key = variant name
- `bakeCustomModelSpriteSheet`: cache key = `__custom__` + scene UUID

### Orthographic camera

```
Left: -0.5 to 0.5 (procedural) / -0.75 to 0.75 (custom)
Right: same
Top: 1.0 to -0.8 (procedural) / 1.15 to -0.95 (custom)
Camera at (0, 0.9, 3), lookAt (0, 0.9, 0)
```

Custom models use a slightly larger frustum to fit variable model bounds.
