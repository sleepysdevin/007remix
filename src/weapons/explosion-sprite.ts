import * as THREE from 'three';

const FRAME_SIZE = 64;
const FRAME_COUNT = 8;
let cachedTexture: THREE.CanvasTexture | null = null;

/**
 * Generate an explosion sprite atlas (8 frames): fireball expanding with
 * bright center, orange/red glow, and dark smoke edge — no external images.
 */
export function generateExplosionTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture;

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE * FRAME_COUNT;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext('2d')!;

  for (let f = 0; f < FRAME_COUNT; f++) {
    const ox = f * FRAME_SIZE;
    const cx = ox + FRAME_SIZE / 2;
    const cy = FRAME_SIZE / 2;

    // Frame 0–2: grow, 3–5: peak/bright, 6–7: fade + smoke
    const t = f / (FRAME_COUNT - 1);
    const radius = 4 + 24 * Math.min(1, t * 2); // expand quickly then hold
    const coreRadius = Math.max(2, 8 - f * 0.8);
    const alpha = f < 3 ? 0.4 + f * 0.2 : f < 6 ? 0.95 : 0.95 - (f - 6) * 0.25;

    // Outer smoke/dark ring (later frames)
    if (f >= 2) {
      const smokeR = radius + 8 + f * 2;
      const smokeGrad = ctx.createRadialGradient(cx, cy, radius, cx, cy, smokeR);
      smokeGrad.addColorStop(0, 'rgba(40, 25, 10, 0)');
      smokeGrad.addColorStop(0.4, 'rgba(60, 35, 15, 0.3)');
      smokeGrad.addColorStop(0.7, 'rgba(30, 20, 10, 0.15)');
      smokeGrad.addColorStop(1, 'rgba(20, 15, 10, 0)');
      ctx.fillStyle = smokeGrad;
      ctx.fillRect(ox, 0, FRAME_SIZE, FRAME_SIZE);
    }

    // Main fireball gradient
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(255, 255, 200, ${alpha})`);
    grad.addColorStop(0.15, `rgba(255, 220, 100, ${alpha * 0.95})`);
    grad.addColorStop(0.35, `rgba(255, 140, 30, ${alpha * 0.85})`);
    grad.addColorStop(0.55, `rgba(255, 60, 0, ${alpha * 0.6})`);
    grad.addColorStop(0.75, `rgba(200, 40, 0, ${alpha * 0.35})`);
    grad.addColorStop(1, 'rgba(80, 20, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Irregular spikes for explosion shape (frames 0–5)
    if (f < 6) {
      const spikeCount = 12;
      for (let s = 0; s < spikeCount; s++) {
        const angle = (s / spikeCount) * Math.PI * 2 + f * 0.2;
        const spikeLen = radius * (0.8 + Math.sin(s * 1.3) * 0.3);
        const spikeW = 3 + (1 - t) * 4;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        const spikeAlpha = alpha * (0.5 + 0.4 * (1 - s / spikeCount));
        ctx.fillStyle = `rgba(255, ${120 + f * 15}, ${Math.floor(30 + f * 5)}, ${spikeAlpha})`;
        ctx.beginPath();
        ctx.moveTo(-spikeW, 0);
        ctx.lineTo(0, -spikeLen);
        ctx.lineTo(spikeW, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // White-hot core
    if (coreRadius > 0.5) {
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
      coreGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      coreGrad.addColorStop(0.5, `rgba(255, 255, 200, ${alpha * 0.9})`);
      coreGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  cachedTexture = tex;
  return tex;
}

export const EXPLOSION_FRAMES = FRAME_COUNT;

export function getExplosionOffset(frame: number): { x: number; y: number } {
  const f = Math.min(Math.max(0, frame), FRAME_COUNT - 1);
  return { x: f / FRAME_COUNT, y: 0 };
}
