import * as THREE from 'three';

// ─── Atlas layout ───
export const FRAME_W = 64;
export const FRAME_H = 96;
export const COLS = 5;
export const ROWS = 3;

export interface GuardVariant {
  uniformColor: string;
  skinTone: string;
  headgear: 'none' | 'beret' | 'cap';
  name: string;
}

export const GUARD_VARIANTS: Record<string, GuardVariant> = {
  guard: { uniformColor: '#334455', skinTone: '#DDBB99', headgear: 'none', name: 'guard' },
  soldier: { uniformColor: '#556633', skinTone: '#AA8866', headgear: 'beret', name: 'soldier' },
  officer: { uniformColor: '#222233', skinTone: '#DDBB99', headgear: 'cap', name: 'officer' },
};

// Shared texture cache (one GPU upload per variant)
const textureCache = new Map<string, THREE.CanvasTexture>();

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
const BOOT_H = 5;
const BELT_H = 3;
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

  // Eyes
  ctx.fillStyle = '#000000';
  ctx.fillRect(cx + tiltX - 3, HEAD_Y - 2, 2, 2);
  ctx.fillRect(cx + tiltX + 2, HEAD_Y - 2, 2, 2);

  // Mouth
  ctx.fillRect(cx + tiltX - 2, HEAD_Y + 3, 4, 1);

  // Headgear
  if (v.headgear === 'beret') {
    ctx.fillStyle = '#662222';
    ctx.beginPath();
    ctx.ellipse(cx + tiltX + 2, HEAD_Y - HEAD_R + 1, HEAD_R + 2, 4, 0, Math.PI, 0);
    ctx.fill();
  } else if (v.headgear === 'cap') {
    ctx.fillStyle = '#222233';
    ctx.fillRect(cx + tiltX - HEAD_R - 2, HEAD_Y - HEAD_R - 1, HEAD_R * 2 + 4, 4);
    // Brim
    ctx.fillRect(cx + tiltX - HEAD_R - 4, HEAD_Y - HEAD_R + 2, HEAD_R * 2 + 8, 2);
  }
}

function drawTorso(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, tiltX = 0): void {
  ctx.fillStyle = v.uniformColor;
  // Trapezoid: wider shoulders, narrower waist
  ctx.beginPath();
  ctx.moveTo(cx + tiltX - TORSO_W / 2, TORSO_Y);
  ctx.lineTo(cx + tiltX + TORSO_W / 2, TORSO_Y);
  ctx.lineTo(cx + tiltX + TORSO_W / 2 - 2, TORSO_Y + TORSO_H);
  ctx.lineTo(cx + tiltX - TORSO_W / 2 + 2, TORSO_Y + TORSO_H);
  ctx.closePath();
  ctx.fill();

  // Belt
  ctx.fillStyle = '#444433';
  ctx.fillRect(cx + tiltX - TORSO_W / 2 + 1, BELT_Y, TORSO_W - 2, BELT_H);

  // Belt buckle
  ctx.fillStyle = '#888866';
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
  // Left leg
  ctx.fillStyle = v.uniformColor;
  ctx.fillRect(cx - legGap - LEG_W + leftOffset, LEG_Y, LEG_W, LEG_H - BOOT_H);
  // Left boot
  ctx.fillStyle = '#222222';
  ctx.fillRect(cx - legGap - LEG_W + leftOffset, LEG_Y + LEG_H - BOOT_H, LEG_W + 1, BOOT_H);

  // Right leg
  ctx.fillStyle = v.uniformColor;
  ctx.fillRect(cx + legGap + rightOffset, LEG_Y, LEG_W, LEG_H - BOOT_H);
  // Right boot
  ctx.fillStyle = '#222222';
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
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-GUN_W / 2, 0, GUN_W, GUN_H);
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
  // Arms at sides
  drawArm(ctx, cx - TORSO_W / 2 - 1, TORSO_Y + 2, 0.1, v);
  drawArm(ctx, cx + TORSO_W / 2 + 1, TORSO_Y + 2, -0.1, v);
  drawHead(ctx, cx, v);
}

function drawAlert(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, alt: number): void {
  drawLegs(ctx, cx, v, 1, -1);
  drawTorso(ctx, cx, v);
  // Arms raised ~45 degrees
  const armAngle = alt === 0 ? -0.7 : -0.5;
  drawArm(ctx, cx - TORSO_W / 2 - 1, TORSO_Y + 2, armAngle - 0.2, v);
  drawArm(ctx, cx + TORSO_W / 2 + 1, TORSO_Y + 2, -armAngle + 0.2, v);
  // Gun in right hand
  drawGun(ctx, cx + TORSO_W / 2 + 5, TORSO_Y + 4, -armAngle);
  drawHead(ctx, cx, v, alt === 1 ? 2 : 0);
}

function drawShoot(ctx: CanvasRenderingContext2D, cx: number, v: GuardVariant, alt: number): void {
  drawLegs(ctx, cx, v, 2, -1);
  drawTorso(ctx, cx, v);
  // Left arm across chest (supporting)
  drawArm(ctx, cx - TORSO_W / 2, TORSO_Y + 4, 0.3, v);
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
  // Arms swing opposite to legs
  const armSwing = alt === 0 ? 0.3 : -0.3;
  drawArm(ctx, cx - TORSO_W / 2 - 1, TORSO_Y + 2, -armSwing, v);
  drawArm(ctx, cx + TORSO_W / 2 + 1, TORSO_Y + 2, armSwing, v);
  // Gun in right hand
  drawGun(ctx, cx + TORSO_W / 2 + 4, TORSO_Y + ARM_H - 2, 0);
  drawHead(ctx, cx, v);
}
