import * as THREE from 'three';

// ─── Atlas layout ───
export const FRAME_W = 64;
export const FRAME_H = 96;
export const COLS = 5;
export const ROWS = 3;

export interface GuardVariant {
  uniformColor: string;
  vestColor: string;   // Tactical vest / chest rig
  skinTone: string;
  headgear: 'none' | 'beret' | 'cap' | 'helmet' | 'helmet_net';
  name: string;
}

export const GUARD_VARIANTS: Record<string, GuardVariant> = {
  guard:  { uniformColor: '#3d4a36', vestColor: '#2a3324', skinTone: '#C4A574', headgear: 'helmet_net', name: 'guard' },
  soldier: { uniformColor: '#4a5c3d', vestColor: '#3d4a36', skinTone: '#AA8866', headgear: 'helmet', name: 'soldier' },
  officer: { uniformColor: '#2c2c34', vestColor: '#1e1e26', skinTone: '#DDBB99', headgear: 'cap', name: 'officer' },
};

// Shared texture cache (one GPU upload per variant)
const textureCache = new Map<string, THREE.CanvasTexture>();
const imageTextureCache = new Map<string, THREE.Texture>();

/** Sprite source config: 'procedural' uses Canvas drawing, 'image' loads from URL */
export type SpriteSourceType = 'procedural' | 'image';

/** Config for choosing sprite source. When type is 'image', url must be set. */
export interface SpriteSourceConfig {
  type: SpriteSourceType;
  url?: string;
}

/** Default: procedural sprites. Set to use image-based sprites from baked PNG. */
export let spriteSourceConfig: SpriteSourceConfig = { type: 'procedural' };

export function setSpriteSourceConfig(config: SpriteSourceConfig): void {
  spriteSourceConfig = config;
}

/** Preloaded texture for image-based sprites (set by preloadEnemySpriteSheet) */
let preloadedImageTexture: THREE.Texture | null = null;

/**
 * Preload an image sprite sheet for sync use in EnemyBase.
 * Call at game init before spawning enemies with image sprites.
 */
export function preloadEnemySpriteSheet(url: string): Promise<THREE.Texture> {
  return loadSpriteSheetFromImage(url).then((tex) => {
    preloadedImageTexture = tex;
    return tex;
  });
}

/** Get preloaded image texture, or null if not loaded. */
export function getPreloadedSpriteTexture(): THREE.Texture | null {
  return preloadedImageTexture;
}

/**
 * Load a sprite sheet from an image URL (e.g. baked from 3D model).
 * Cached by URL. Expects 5×3 atlas layout (320×288 px at 64×96 per frame).
 */
export function loadSpriteSheetFromImage(url: string): Promise<THREE.Texture> {
  const cached = imageTextureCache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        imageTextureCache.set(url, texture);
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

/**
 * Generate a sprite-sheet canvas + Three.js CanvasTexture for a guard variant.
 * The texture is cached — calling again with the same variant returns the cached one.
 */
export function generateGuardSpriteSheet(variant: GuardVariant = GUARD_VARIANTS.guard): THREE.CanvasTexture {
  const cached = textureCache.get(variant.name);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * COLS;
  canvas.height = FRAME_H * ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // Draw each frame
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const frameIndex = row * COLS + col;
      const x = col * FRAME_W;
      const y = row * FRAME_H;
      ctx.save();
      ctx.translate(x, y);
      drawFrame(ctx, frameIndex, variant);
      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  textureCache.set(variant.name, texture);
  return texture;
}

// ─── Drawing helpers ───

function drawFrame(ctx: CanvasRenderingContext2D, frame: number, v: GuardVariant): void {
  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  // Center x of the frame
  const cx = FRAME_W / 2;

  switch (frame) {
    case 0: drawIdle(ctx, cx, v, 0); break;
    case 1: drawIdle(ctx, cx, v, 1); break;
    case 2: drawAlert(ctx, cx, v, 0); break;
    case 3: drawAlert(ctx, cx, v, 1); break;
    case 4: drawShoot(ctx, cx, v, 0); break;
    case 5: drawShoot(ctx, cx, v, 1); break;
    case 6: drawHit(ctx, cx, v, -1); break;
    case 7: drawHit(ctx, cx, v, 1); break;
    case 8: drawDeath(ctx, cx, v, 0); break;
    case 9: drawDeath(ctx, cx, v, 1); break;
    case 10: drawDeath(ctx, cx, v, 2); break;
    case 11: drawWalk(ctx, cx, v, 0); break;
    case 12: drawWalk(ctx, cx, v, 1); break;
    default: break; // reserved
  }
}

// ─── Body part primitives ───

const HEAD_R = 7;
const TORSO_W = 18;
const TORSO_H = 22;
const ARM_W = 5;
const ARM_H = 20;
const LEG_W = 6;
const LEG_H = 24;
const BOOT_H = 6;   // Slightly taller combat boot
const BELT_H = 3;
const VEST_INSET = 2;  // Vest sits inside torso outline
const GUN_W = 4;
const GUN_H = 14;

/** Y offsets from top of frame */
const HEAD_Y = 14;       // center of head
const TORSO_Y = 28;      // top of torso
const BELT_Y = TORSO_Y + TORSO_H - BELT_H;
const LEG_Y = TORSO_Y + TORSO_H;

function drawHead(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, tiltX = 0): void {
  // Head circle
  ctx.fillStyle = v.skinTone;
  ctx.beginPath();
  ctx.arc(cx + tiltX, HEAD_Y, HEAD_R, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (narrower, more alert)
  ctx.fillStyle = '#000000';
  ctx.fillRect(cx + tiltX - 3, HEAD_Y - 2, 2, 2);
  ctx.fillRect(cx + tiltX + 2, HEAD_Y - 2, 2, 2);

  // Mouth
  ctx.fillRect(cx + tiltX - 2, HEAD_Y + 3, 4, 1);

  // Headgear — soldier aesthetic
  if (v.headgear === 'beret') {
    ctx.fillStyle = '#4a2a2a';
    ctx.beginPath();
    ctx.ellipse(cx + tiltX + 2, HEAD_Y - HEAD_R + 1, HEAD_R + 2, 4, 0, Math.PI, 0);
    ctx.fill();
  } else if (v.headgear === 'cap') {
    // Military patrol cap
    ctx.fillStyle = '#1e1e26';
    ctx.fillRect(cx + tiltX - HEAD_R - 2, HEAD_Y - HEAD_R - 1, HEAD_R * 2 + 4, 5);
    ctx.fillStyle = '#2c2c34';
    ctx.fillRect(cx + tiltX - HEAD_R - 3, HEAD_Y - HEAD_R + 3, HEAD_R * 2 + 6, 2);
  } else if (v.headgear === 'helmet' || v.headgear === 'helmet_net') {
    // Combat helmet (dome)
    ctx.fillStyle = '#3d4242';
    ctx.beginPath();
    ctx.ellipse(cx + tiltX, HEAD_Y - HEAD_R - 2, HEAD_R + 3, HEAD_R + 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Chin strap hint
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx + tiltX - 4, HEAD_Y + 2, 3, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + tiltX + 4, HEAD_Y + 2, 3, 0, Math.PI);
    ctx.stroke();
    if (v.headgear === 'helmet_net') {
      // Net/scrim overlay (crosshatch)
      ctx.strokeStyle = 'rgba(60,55,45,0.6)';
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + tiltX - 8 + i * 4, HEAD_Y - 10);
        ctx.lineTo(cx + tiltX + 8 + i * 4, HEAD_Y + 2);
        ctx.stroke();
      }
    }
  }
}

function drawTorso(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, tiltX = 0): void {
  // Base uniform — trapezoid: wider shoulders, narrower waist
  ctx.fillStyle = v.uniformColor;
  ctx.beginPath();
  ctx.moveTo(cx + tiltX - TORSO_W / 2, TORSO_Y);
  ctx.lineTo(cx + tiltX + TORSO_W / 2, TORSO_Y);
  ctx.lineTo(cx + tiltX + TORSO_W / 2 - 2, TORSO_Y + TORSO_H);
  ctx.lineTo(cx + tiltX - TORSO_W / 2 + 2, TORSO_Y + TORSO_H);
  ctx.closePath();
  ctx.fill();

  // Tactical vest / chest rig overlay
  ctx.fillStyle = v.vestColor;
  ctx.beginPath();
  ctx.moveTo(cx + tiltX - TORSO_W / 2 + VEST_INSET, TORSO_Y + 2);
  ctx.lineTo(cx + tiltX + TORSO_W / 2 - VEST_INSET, TORSO_Y + 2);
  ctx.lineTo(cx + tiltX + TORSO_W / 2 - VEST_INSET - 1, BELT_Y - 2);
  ctx.lineTo(cx + tiltX - TORSO_W / 2 + VEST_INSET + 1, BELT_Y - 2);
  ctx.closePath();
  ctx.fill();
  // Pouches (small rectangles on vest)
  ctx.fillStyle = '#252a20';
  ctx.fillRect(cx + tiltX - 5, TORSO_Y + 8, 4, 6);
  ctx.fillRect(cx + tiltX + 2, TORSO_Y + 8, 4, 6);
  ctx.fillRect(cx + tiltX - 2, TORSO_Y + 16, 4, 5);

  // Belt (tactical webbing)
  ctx.fillStyle = '#35382e';
  ctx.fillRect(cx + tiltX - TORSO_W / 2 + 1, BELT_Y, TORSO_W - 2, BELT_H);
  ctx.fillStyle = '#4a4d42';
  ctx.fillRect(cx + tiltX - 2, BELT_Y, 4, BELT_H);
}

function drawLegs(
  ctx: CanvasRenderingContext2D,
  cx: number,
  v: GuardVariant,
  leftOffset = 0,
  rightOffset = 0,
): void {
  const legGap = 3;
  // Left leg (BDU / cargo style)
  ctx.fillStyle = v.uniformColor;
  ctx.fillRect(cx - legGap - LEG_W + leftOffset, LEG_Y, LEG_W, LEG_H - BOOT_H);
  ctx.fillStyle = '#252a20';
  ctx.fillRect(cx - legGap - LEG_W + leftOffset + 1, LEG_Y + LEG_H - BOOT_H - 8, LEG_W - 2, 4);
  // Left combat boot
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(cx - legGap - LEG_W + leftOffset, LEG_Y + LEG_H - BOOT_H, LEG_W + 1, BOOT_H);

  // Right leg
  ctx.fillStyle = v.uniformColor;
  ctx.fillRect(cx + legGap + rightOffset, LEG_Y, LEG_W, LEG_H - BOOT_H);
  ctx.fillStyle = '#252a20';
  ctx.fillRect(cx + legGap + rightOffset + 1, LEG_Y + LEG_H - BOOT_H - 8, LEG_W - 2, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(cx + legGap + rightOffset, LEG_Y + LEG_H - BOOT_H, LEG_W + 1, BOOT_H);
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  v: GuardVariant,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Arm
  ctx.fillStyle = v.uniformColor;
  ctx.fillRect(-ARM_W / 2, 0, ARM_W, ARM_H);
  // Hand
  ctx.fillStyle = v.skinTone;
  ctx.beginPath();
  ctx.arc(0, ARM_H, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGun(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Rifle body
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-GUN_W / 2, 0, GUN_W, GUN_H);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-GUN_W / 2 + 1, 2, GUN_W - 2, 4);
  ctx.restore();
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#FFEE44';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Pose drawings ───

function drawIdle(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, alt: number): void {
  const shift = alt === 1 ? 1 : 0;
  drawLegs(ctx, cx, v, shift, -shift);
  drawTorso(ctx, cx, v);
  // Arms at sides — negative = outward left, positive = outward right
  drawArm(ctx, cx - TORSO_W / 2 - 1, TORSO_Y + 2, -0.15, v);
  drawArm(ctx, cx + TORSO_W / 2 + 1, TORSO_Y + 2, 0.15, v);
  drawHead(ctx, cx, v);
}

function drawAlert(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, alt: number): void {
  drawLegs(ctx, cx, v, 1, -1);
  drawTorso(ctx, cx, v);
  // Arms raised outward — left arm outward-left, right arm holds gun outward-right
  const armAngle = alt === 0 ? 0.7 : 0.5;
  drawArm(ctx, cx - TORSO_W / 2 - 1, TORSO_Y + 2, -armAngle, v);
  drawArm(ctx, cx + TORSO_W / 2 + 1, TORSO_Y + 2, armAngle, v);
  // Gun in right hand
  drawGun(ctx, cx + TORSO_W / 2 + 5, TORSO_Y + 4, armAngle);
  drawHead(ctx, cx, v, alt === 1 ? 2 : 0);
}

function drawShoot(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, alt: number): void {
  drawLegs(ctx, cx, v, 2, -1);
  drawTorso(ctx, cx, v);
  // Left arm forward (supporting gun) — slight outward angle
  drawArm(ctx, cx - TORSO_W / 2, TORSO_Y + 4, -0.3, v);
  // Right arm extended forward (holding gun)
  const recoil = alt === 1 ? 2 : 0;
  ctx.save();
  ctx.translate(cx + TORSO_W / 2 + 1, TORSO_Y + 6);
  ctx.rotate(-Math.PI / 2 + 0.15);
  // Arm extended
  ctx.fillStyle = v.uniformColor;
  ctx.fillRect(0, -ARM_W / 2, ARM_H - 2, ARM_W);
  // Hand
  ctx.fillStyle = v.skinTone;
  ctx.beginPath();
  ctx.arc(ARM_H - 2, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  // Gun
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(ARM_H - 2, -GUN_W / 2, GUN_H, GUN_W);
  ctx.restore();

  // Muzzle flash on frame 0
  if (alt === 0) {
    drawMuzzleFlash(ctx, cx + TORSO_W / 2 + ARM_H + GUN_H - 6, TORSO_Y + 4 + recoil);
  }

  drawHead(ctx, cx, v, recoil);
}

function drawHit(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, dir: number): void {
  const tilt = dir * 4;
  drawLegs(ctx, cx, v, dir * 2, -dir * 2);
  drawTorso(ctx, cx + tilt, v);
  // Arms flung outward
  drawArm(ctx, cx + tilt - TORSO_W / 2 - 2, TORSO_Y + 2, -0.5 + dir * 0.3, v);
  drawArm(ctx, cx + tilt + TORSO_W / 2 + 2, TORSO_Y + 2, 0.5 + dir * 0.3, v);
  drawHead(ctx, cx + tilt, v);
}

function drawDeath(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, stage: number): void {
  if (stage === 0) {
    // Clutching chest, starting to lean back
    drawLegs(ctx, cx, v, 0, 0);
    drawTorso(ctx, cx + 2, v);
    // Arms crossed over chest
    drawArm(ctx, cx - 2, TORSO_Y + 6, 0.6, v);
    drawArm(ctx, cx + 6, TORSO_Y + 6, -0.6, v);
    drawHead(ctx, cx + 2, v);
  } else if (stage === 1) {
    // Falling backward — lean more
    drawLegs(ctx, cx, v, -2, 2);
    ctx.save();
    ctx.translate(cx, TORSO_Y + TORSO_H);
    ctx.rotate(0.3);
    ctx.fillStyle = v.uniformColor;
    ctx.fillRect(-TORSO_W / 2, -TORSO_H, TORSO_W, TORSO_H);
    ctx.restore();
    // Arms dangling
    drawArm(ctx, cx + 6, TORSO_Y, 0.4, v);
    drawArm(ctx, cx - 6, TORSO_Y, -0.2, v);
    drawHead(ctx, cx + 5, v);
  } else {
    // On the ground — draw horizontal figure near bottom of frame
    const groundY = FRAME_H - 14;
    // Body horizontal
    ctx.fillStyle = v.uniformColor;
    ctx.fillRect(cx - 20, groundY - 6, 40, 10);
    // Head
    ctx.fillStyle = v.skinTone;
    ctx.beginPath();
    ctx.arc(cx - 22, groundY - 1, 5, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.fillStyle = v.uniformColor;
    ctx.fillRect(cx + 10, groundY - 4, 18, 6);
    // Boots
    ctx.fillStyle = '#222222';
    ctx.fillRect(cx + 24, groundY - 5, 6, 8);
  }
}

function drawWalk(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, alt: number): void {
  const legSwing = alt === 0 ? 3 : -3;
  drawLegs(ctx, cx, v, legSwing, -legSwing);
  drawTorso(ctx, cx, v);
  // Arms swing opposite to legs — outward bias
  const armSwing = alt === 0 ? 0.25 : -0.25;
  drawArm(ctx, cx - TORSO_W / 2 - 1, TORSO_Y + 2, -0.15 + armSwing, v);
  drawArm(ctx, cx + TORSO_W / 2 + 1, TORSO_Y + 2, 0.15 - armSwing, v);
  // Gun in right hand
  drawGun(ctx, cx + TORSO_W / 2 + 4, TORSO_Y + ARM_H - 2, 0);
  drawHead(ctx, cx, v);
}
