import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function getOrCreate(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

function addNoise(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * strength;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(id, 0, 0);
}

/** Dark gunmetal — pistol/rifle receiver, barrel */
export function weaponMetalDarkTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-dark', 64, 64, (ctx) => {
    // Base gradient — slight vertical variation for depth
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#2e2e32');
    grad.addColorStop(0.3, '#252528');
    grad.addColorStop(0.7, '#222225');
    grad.addColorStop(1, '#1e1e22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    // Machining lines (horizontal, varying opacity)
    for (let y = 0; y < 64; y += 4) {
      ctx.strokeStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    // Brushed scratches (thin diagonal lines)
    ctx.strokeStyle = 'rgba(60,62,68,0.25)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 14; i++) {
      const sx = Math.random() * 64;
      const sy = Math.random() * 64;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 8 + Math.random() * 20, sy + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
    // Edge highlight (top and left — simulating light catch)
    ctx.fillStyle = 'rgba(90,92,100,0.45)';
    ctx.fillRect(0, 0, 64, 2);
    ctx.fillRect(0, 0, 2, 64);
    // Bottom shadow edge
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 62, 64, 2);
    addNoise(ctx, 64, 64, 14);
  });
}

/** Slightly lighter metal — rifle body */
export function weaponMetalMidTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-mid', 64, 64, (ctx) => {
    // Gradient base
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, '#353538');
    grad.addColorStop(0.4, '#3a3a40');
    grad.addColorStop(0.6, '#333338');
    grad.addColorStop(1, '#303035');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    // Fine machining lines
    for (let y = 0; y < 64; y += 3) {
      ctx.strokeStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    // Brushed scratches
    ctx.strokeStyle = 'rgba(75,77,85,0.2)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 10; i++) {
      const sx = Math.random() * 64;
      const sy = Math.random() * 64;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 10 + Math.random() * 15, sy + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    // Specular band (horizontal reflective strip)
    ctx.fillStyle = 'rgba(110,112,120,0.3)';
    ctx.fillRect(0, 28, 64, 3);
    // Edge highlights
    ctx.fillStyle = 'rgba(100,102,108,0.4)';
    ctx.fillRect(0, 0, 64, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 63, 64, 1);
    addNoise(ctx, 64, 64, 12);
  });
}

/** Very dark — scope tube, bolt */
export function weaponMetalScopeTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-scope', 32, 32, (ctx) => {
    ctx.fillStyle = '#141418';
    ctx.fillRect(0, 0, 32, 32);
    // Matte coating — very subtle circular polish marks
    ctx.strokeStyle = 'rgba(40,42,50,0.25)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      const cx = Math.random() * 32;
      const cy = Math.random() * 32;
      ctx.beginPath();
      ctx.arc(cx, cy, 3 + Math.random() * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Glint highlight
    ctx.fillStyle = 'rgba(60,62,70,0.35)';
    ctx.fillRect(0, 0, 32, 1);
    ctx.fillStyle = 'rgba(50,52,60,0.2)';
    ctx.fillRect(0, 14, 32, 2);
    addNoise(ctx, 32, 32, 10);
  });
}

/** Rubberized grip — dark with diamond knurl pattern */
export function weaponGripTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-grip', 32, 32, (ctx) => {
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(0, 0, 32, 32);
    // Diamond knurl pattern (diagonal crosshatch)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.8;
    for (let i = -32; i < 64; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 32, 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 32, 0);
      ctx.lineTo(i, 32);
      ctx.stroke();
    }
    // Raised diamond dots at intersections
    ctx.fillStyle = 'rgba(45,45,50,0.4)';
    for (let y = 2; y < 32; y += 4) {
      for (let x = 2; x < 32; x += 4) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Edge highlights
    ctx.fillStyle = 'rgba(50,50,55,0.3)';
    ctx.fillRect(0, 0, 32, 1);
    addNoise(ctx, 32, 32, 12);
  });
}

/** Wood — rifle stock (warm brown) */
export function weaponWoodLightTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-light', 64, 64, (ctx) => {
    // Base with warm gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#7a5530');
    grad.addColorStop(0.5, '#6b4a2a');
    grad.addColorStop(1, '#604025');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    // Wood grain — multiple layers of wavy lines
    for (let i = 0; i < 12; i++) {
      const y = 3 + i * 5 + (Math.random() * 3 - 1.5);
      const darkness = 0.25 + Math.random() * 0.2;
      ctx.strokeStyle = `rgba(50,30,12,${darkness})`;
      ctx.lineWidth = 0.8 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 8) {
        ctx.lineTo(x, y + (Math.random() * 3 - 1.5));
      }
      ctx.stroke();
    }
    // Wood knot (small dark oval)
    ctx.fillStyle = 'rgba(40,25,10,0.4)';
    ctx.beginPath();
    ctx.ellipse(42, 35, 5, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,30,15,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(42, 35, 7, 4, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    // Varnish sheen — faint bright band
    ctx.fillStyle = 'rgba(140,100,60,0.15)';
    ctx.fillRect(0, 20, 64, 6);
    addNoise(ctx, 64, 64, 18);
  });
}

/** Wood — shotgun (reddish brown) */
export function weaponWoodMidTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-mid', 64, 64, (ctx) => {
    // Rich reddish-brown base
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#653e24');
    grad.addColorStop(0.5, '#5a3820');
    grad.addColorStop(1, '#50301c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    // Dense grain pattern
    for (let i = 0; i < 14; i++) {
      const y = 2 + i * 4.5 + (Math.random() * 2 - 1);
      ctx.strokeStyle = `rgba(40,22,10,${0.3 + Math.random() * 0.2})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.0;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 8) {
        ctx.lineTo(x, y + (Math.random() * 2.5 - 1.25));
      }
      ctx.stroke();
    }
    // Subtle knot
    ctx.fillStyle = 'rgba(35,18,8,0.35)';
    ctx.beginPath();
    ctx.ellipse(18, 48, 4, 2.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Oil finish sheen
    ctx.fillStyle = 'rgba(120,80,45,0.12)';
    ctx.fillRect(0, 30, 64, 5);
    addNoise(ctx, 64, 64, 16);
  });
}

/** Wood — sniper (darker walnut) */
export function weaponWoodDarkTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-dark', 64, 64, (ctx) => {
    // Deep walnut base
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#42301c');
    grad.addColorStop(0.4, '#3a2818');
    grad.addColorStop(1, '#302014');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    // Tight grain — walnut has finer, darker grain lines
    for (let i = 0; i < 16; i++) {
      const y = 1 + i * 4 + (Math.random() * 2 - 1);
      ctx.strokeStyle = `rgba(20,12,5,${0.35 + Math.random() * 0.2})`;
      ctx.lineWidth = 0.5 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 6) {
        ctx.lineTo(x, y + (Math.random() * 1.5 - 0.75));
      }
      ctx.stroke();
    }
    // Walnut figure (wavy interlocking pattern)
    ctx.strokeStyle = 'rgba(25,15,8,0.3)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const baseY = 15 + i * 18;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= 64; x += 4) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.2 + i) * 3);
      }
      ctx.stroke();
    }
    // Polish sheen
    ctx.fillStyle = 'rgba(80,55,30,0.1)';
    ctx.fillRect(0, 25, 64, 8);
    addNoise(ctx, 64, 64, 14);
  });
}
