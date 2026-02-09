import * as THREE from 'three';

const FRAME_SIZE = 32;
const FRAME_COUNT = 4;
let cachedTexture: THREE.CanvasTexture | null = null;

/**
 * Generate a 128×32 muzzle flash sprite atlas (4 frames, each 32×32).
 * Frame 0: full blast, Frame 1: medium, Frame 2: fading, Frame 3: tiny glow.
 * Drawn with radial spikes and a bright center — no external images needed.
 */
export function generateMuzzleFlashTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture;

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE * FRAME_COUNT;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext('2d')!;

  for (let f = 0; f < FRAME_COUNT; f++) {
    const ox = f * FRAME_SIZE;
    const cx = ox + FRAME_SIZE / 2;
    const cy = FRAME_SIZE / 2;

    // Scale factor per frame (1.0 → 0.25)
    const scale = 1.0 - f * 0.25;

    // Outer glow
    const outerR = 14 * scale;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.2, 'rgba(255, 240, 100, 0.7)');
    grad.addColorStop(0.5, 'rgba(255, 160, 30, 0.4)');
    grad.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(ox, 0, FRAME_SIZE, FRAME_SIZE);

    // Radial spikes (6 spikes per frame)
    const spikeCount = 6;
    for (let s = 0; s < spikeCount; s++) {
      const angle = (s / spikeCount) * Math.PI * 2 + f * 0.4; // offset per frame
      const spikeLen = (8 + Math.random() * 6) * scale;
      const spikeW = 2 * scale;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Spike shape (triangle)
      const alpha = 0.6 * scale;
      ctx.fillStyle = `rgba(255, ${180 + Math.floor(Math.random() * 60)}, ${Math.floor(Math.random() * 50)}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(-spikeW, 0);
      ctx.lineTo(0, -spikeLen);
      ctx.lineTo(spikeW, 0);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // Bright white center core
    const coreR = 4 * scale;
    if (coreR > 0.5) {
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      coreGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      coreGrad.addColorStop(0.5, 'rgba(255, 255, 200, 0.8)');
      coreGrad.addColorStop(1, 'rgba(255, 200, 50, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  cachedTexture = tex;
  return tex;
}

/** Total number of animation frames in the atlas */
export const MUZZLE_FLASH_FRAMES = FRAME_COUNT;

/** Compute UV offset for a given frame index (0..3) */
export function getMuzzleFlashOffset(frame: number): { x: number; y: number } {
  const f = Math.min(frame, FRAME_COUNT - 1);
  return { x: f / FRAME_COUNT, y: 0 };
}
