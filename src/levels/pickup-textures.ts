import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function create(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Red background with white cross */
export function healthTexture(): THREE.CanvasTexture {
  return create('health', (ctx) => {
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(0, 0, 32, 32);
    // White cross
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(12, 6, 8, 20);
    ctx.fillRect(6, 12, 20, 8);
    // Border
    ctx.strokeStyle = '#881111';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30);
  });
}

/** Blue with shield chevron */
export function armorTexture(): THREE.CanvasTexture {
  return create('armor', (ctx) => {
    ctx.fillStyle = '#2244aa';
    ctx.fillRect(0, 0, 32, 32);
    // Shield shape
    ctx.fillStyle = '#4488ff';
    ctx.beginPath();
    ctx.moveTo(16, 4);
    ctx.lineTo(26, 8);
    ctx.lineTo(26, 18);
    ctx.lineTo(16, 28);
    ctx.lineTo(6, 18);
    ctx.lineTo(6, 8);
    ctx.closePath();
    ctx.fill();
    // Inner chevron
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, 14);
    ctx.lineTo(16, 20);
    ctx.lineTo(21, 14);
    ctx.stroke();
    // Border
    ctx.strokeStyle = '#112266';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30);
  });
}

/** Tan with bullet icon */
export function ammoTexture(): THREE.CanvasTexture {
  return create('ammo', (ctx) => {
    ctx.fillStyle = '#bb9944';
    ctx.fillRect(0, 0, 32, 32);
    // Bullet shapes (3 rounds)
    ctx.fillStyle = '#ddaa33';
    for (let i = 0; i < 3; i++) {
      const x = 8 + i * 7;
      // Casing
      ctx.fillStyle = '#ddaa33';
      ctx.fillRect(x, 12, 5, 14);
      // Tip
      ctx.fillStyle = '#996633';
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x + 2.5, 6);
      ctx.lineTo(x + 5, 12);
      ctx.closePath();
      ctx.fill();
    }
    // Border
    ctx.strokeStyle = '#886622';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30);
  });
}

/** Green with weapon silhouette */
export function weaponTexture(): THREE.CanvasTexture {
  return create('weapon', (ctx) => {
    ctx.fillStyle = '#336633';
    ctx.fillRect(0, 0, 32, 32);
    // Gun silhouette
    ctx.fillStyle = '#222222';
    // Barrel
    ctx.fillRect(6, 13, 20, 4);
    // Grip
    ctx.fillRect(20, 17, 4, 8);
    // Trigger guard
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(18, 20, 3, 0, Math.PI);
    ctx.stroke();
    // Border
    ctx.strokeStyle = '#224422';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30);
  });
}

/** Yellow card with stripe */
export function keyTexture(): THREE.CanvasTexture {
  return create('key', (ctx) => {
    ctx.fillStyle = '#ddbb22';
    ctx.fillRect(0, 0, 32, 32);
    // Magnetic stripe
    ctx.fillStyle = '#222222';
    ctx.fillRect(2, 20, 28, 4);
    // Security chip
    ctx.fillStyle = '#ccaa00';
    ctx.fillRect(5, 6, 10, 8);
    ctx.strokeStyle = '#aa8800';
    ctx.lineWidth = 1;
    ctx.strokeRect(5, 6, 10, 8);
    // Border
    ctx.strokeStyle = '#aa8811';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30);
  });
}
