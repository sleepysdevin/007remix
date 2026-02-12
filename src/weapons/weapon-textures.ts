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

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM WEAPON SKINS (High Detail)
// ═══════════════════════════════════════════════════════════════════════════

/** Carbon Fiber — high-tech woven pattern */
export function weaponCarbonFiberTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-carbon-fiber', 128, 128, (ctx) => {
    // Dark base
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, 128, 128);

    // Carbon fiber weave pattern (twill)
    const tileSize = 8;
    for (let y = 0; y < 128; y += tileSize) {
      for (let x = 0; x < 128; x += tileSize) {
        const offsetX = Math.floor(y / tileSize) % 2 === 0 ? 0 : tileSize / 2;

        // Horizontal fibers
        const gradH = ctx.createLinearGradient(x, y, x, y + tileSize);
        gradH.addColorStop(0, '#1a1a1e');
        gradH.addColorStop(0.5, '#141418');
        gradH.addColorStop(1, '#0e0e12');
        ctx.fillStyle = gradH;
        ctx.fillRect(x + offsetX, y, tileSize / 2, tileSize);

        // Vertical fibers
        const gradV = ctx.createLinearGradient(x, y, x + tileSize, y);
        gradV.addColorStop(0, '#222228');
        gradV.addColorStop(0.5, '#1c1c22');
        gradV.addColorStop(1, '#18181e');
        ctx.fillStyle = gradV;
        ctx.fillRect(x + offsetX + tileSize / 2, y, tileSize / 2, tileSize);
      }
    }

    // Subtle grid lines (weave structure)
    ctx.strokeStyle = 'rgba(40,40,50,0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 128; i += tileSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }

    // Glossy resin coat (highlights)
    ctx.fillStyle = 'rgba(60,65,80,0.15)';
    ctx.fillRect(0, 0, 128, 2);
    ctx.fillRect(0, 32, 128, 1);
    ctx.fillRect(0, 64, 128, 2);

    addNoise(ctx, 128, 128, 8);
  });
}

/** Digital Camo — pixelated tactical pattern */
export function weaponDigitalCamoTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-digital-camo', 128, 128, (ctx) => {
    // Base color (medium gray)
    ctx.fillStyle = '#4a4d52';
    ctx.fillRect(0, 0, 128, 128);

    const colors = ['#2a2d32', '#3a3d42', '#5a5d62', '#6a6d72'];
    const pixelSize = 4;

    // Generate digital camo pattern
    for (let y = 0; y < 128; y += pixelSize) {
      for (let x = 0; x < 128; x += pixelSize) {
        // Clustered noise pattern for realistic camo
        const noiseVal = Math.sin(x * 0.1) * Math.cos(y * 0.1) + Math.random();
        if (noiseVal > 0.3) {
          const colorIdx = Math.floor(Math.random() * colors.length);
          ctx.fillStyle = colors[colorIdx];
          ctx.fillRect(x, y, pixelSize, pixelSize);
        }
      }
    }

    // Add some larger pixel clusters for variation
    for (let i = 0; i < 40; i++) {
      const cx = Math.floor(Math.random() * 128 / pixelSize) * pixelSize;
      const cy = Math.floor(Math.random() * 128 / pixelSize) * pixelSize;
      const size = (2 + Math.floor(Math.random() * 3)) * pixelSize;
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.fillRect(cx, cy, size, size);
    }

    addNoise(ctx, 128, 128, 12);
  });
}

/** Gold Chrome — luxury metallic finish */
export function weaponGoldChromeTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-gold-chrome', 128, 128, (ctx) => {
    // Rich gold gradient base
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#d4af37');
    grad.addColorStop(0.25, '#f4d03f');
    grad.addColorStop(0.5, '#e5b532');
    grad.addColorStop(0.75, '#c9a02e');
    grad.addColorStop(1, '#b8912a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Polished reflections (angled bright bands)
    const reflections = 8;
    for (let i = 0; i < reflections; i++) {
      const y = (i * 128) / reflections;
      const brightness = 0.15 + Math.sin(i * 0.8) * 0.1;
      ctx.fillStyle = `rgba(255,245,200,${brightness})`;
      ctx.fillRect(0, y, 128, 2);
    }

    // Diagonal shine streaks
    ctx.strokeStyle = 'rgba(255,250,220,0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const offset = i * 15 - 20;
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + 128, 128);
      ctx.stroke();
    }

    // Dark edge shadows for depth
    ctx.fillStyle = 'rgba(80,60,20,0.2)';
    ctx.fillRect(0, 126, 128, 2);
    ctx.fillRect(126, 0, 2, 128);

    // Specular highlights
    ctx.fillStyle = 'rgba(255,255,240,0.4)';
    ctx.fillRect(0, 0, 128, 1);
    ctx.fillRect(0, 0, 1, 128);

    addNoise(ctx, 128, 128, 10);
  });
}

/** Damascus Steel — swirling pattern steel */
export function weaponDamascusSteelTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-damascus-steel', 128, 128, (ctx) => {
    // Steel gray base
    ctx.fillStyle = '#454850';
    ctx.fillRect(0, 0, 128, 128);

    // Damascus wavy pattern layers
    const layers = 16;
    for (let i = 0; i < layers; i++) {
      const phase = (i * Math.PI) / 8;
      const darkness = 0.15 + (i % 3) * 0.08;

      ctx.strokeStyle = `rgba(25,28,35,${darkness})`;
      ctx.lineWidth = 1.5 + (i % 2) * 0.8;
      ctx.beginPath();

      for (let x = 0; x <= 128; x += 2) {
        const y = 64 + Math.sin((x + phase * 20) * 0.08) * 30 * Math.cos(i * 0.3);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Add swirl patterns
    for (let i = 0; i < 6; i++) {
      const cx = 20 + i * 20;
      const cy = 30 + (i % 2) * 60;

      ctx.strokeStyle = `rgba(20,22,28,${0.2 + (i % 2) * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.1) {
        const r = 8 + a * 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.6;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Polished metallic highlights
    ctx.fillStyle = 'rgba(120,125,135,0.2)';
    ctx.fillRect(0, 0, 128, 1);
    for (let i = 0; i < 8; i++) {
      const y = 16 + i * 16;
      ctx.fillStyle = `rgba(100,105,115,${0.08 + (i % 2) * 0.04})`;
      ctx.fillRect(0, y, 128, 1);
    }

    addNoise(ctx, 128, 128, 14);
  });
}

/** Hex Pattern — tactical honeycomb */
export function weaponHexPatternTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-hex-pattern', 128, 128, (ctx) => {
    // Dark base
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(0, 0, 128, 128);

    const hexSize = 12;
    const hexHeight = hexSize * Math.sqrt(3);

    // Draw hexagonal grid
    for (let row = -1; row < 12; row++) {
      for (let col = -1; col < 12; col++) {
        const x = col * hexSize * 1.5;
        const y = row * hexHeight + (col % 2 === 0 ? 0 : hexHeight / 2);

        // Random hex fill
        const fillChance = Math.random();
        if (fillChance > 0.6) {
          ctx.fillStyle = '#2a2d35';
        } else if (fillChance > 0.3) {
          ctx.fillStyle = '#222530';
        } else {
          ctx.fillStyle = '#1e2028';
        }

        // Draw hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const hx = x + hexSize * Math.cos(angle);
          const hy = y + hexSize * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();

        // Hex outline
        ctx.strokeStyle = 'rgba(60,65,75,0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Highlight edges
    ctx.fillStyle = 'rgba(80,85,95,0.2)';
    ctx.fillRect(0, 0, 128, 1);

    addNoise(ctx, 128, 128, 10);
  });
}

/** Tiger Stripe Camo — classic tactical */
export function weaponTigerStripeCamoTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-tiger-stripe', 128, 128, (ctx) => {
    // Tan base
    ctx.fillStyle = '#8a7a5f';
    ctx.fillRect(0, 0, 128, 128);

    // Dark green stripes
    ctx.fillStyle = '#3a3d2a';
    for (let i = 0; i < 20; i++) {
      const startY = Math.random() * 128;
      const waveFreq = 0.3 + Math.random() * 0.4;
      const waveAmp = 8 + Math.random() * 12;
      const thickness = 3 + Math.random() * 6;

      ctx.beginPath();
      for (let x = 0; x <= 128; x += 2) {
        const y = startY + Math.sin(x * waveFreq + i) * waveAmp;
        if (x === 0) ctx.moveTo(x, y - thickness / 2);
        else ctx.lineTo(x, y - thickness / 2);
      }
      for (let x = 128; x >= 0; x -= 2) {
        const y = startY + Math.sin(x * waveFreq + i) * waveAmp;
        ctx.lineTo(x, y + thickness / 2);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Brown accent stripes
    ctx.fillStyle = 'rgba(60,50,35,0.5)';
    for (let i = 0; i < 12; i++) {
      const startY = Math.random() * 128;
      const waveFreq = 0.25 + Math.random() * 0.3;
      const waveAmp = 6 + Math.random() * 8;
      const thickness = 2 + Math.random() * 4;

      ctx.beginPath();
      for (let x = 0; x <= 128; x += 2) {
        const y = startY + Math.cos(x * waveFreq + i * 2) * waveAmp;
        if (x === 0) ctx.moveTo(x, y - thickness / 2);
        else ctx.lineTo(x, y - thickness / 2);
      }
      for (let x = 128; x >= 0; x -= 2) {
        const y = startY + Math.cos(x * waveFreq + i * 2) * waveAmp;
        ctx.lineTo(x, y + thickness / 2);
      }
      ctx.closePath();
      ctx.fill();
    }

    addNoise(ctx, 128, 128, 20);
  });
}

/** Urban Camo — gray city pattern */
export function weaponUrbanCamoTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-urban-camo', 128, 128, (ctx) => {
    // Light gray base
    ctx.fillStyle = '#7a7d82';
    ctx.fillRect(0, 0, 128, 128);

    const colors = ['#4a4d52', '#5a5d62', '#6a6d72', '#3a3d42', '#2a2d32'];

    // Organic splatter shapes for urban camo
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const size = 8 + Math.random() * 24;
      const color = colors[Math.floor(Math.random() * colors.length)];

      ctx.fillStyle = color;
      ctx.beginPath();

      // Irregular blob shape
      const points = 6 + Math.floor(Math.random() * 4);
      for (let j = 0; j < points; j++) {
        const angle = (j / points) * Math.PI * 2;
        const radius = size * (0.7 + Math.random() * 0.6);
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    addNoise(ctx, 128, 128, 18);
  });
}

/** Snake Skin — reptilian scales */
export function weaponSnakeSkinTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-snake-skin', 128, 128, (ctx) => {
    // Tan/beige base
    ctx.fillStyle = '#c4b89a';
    ctx.fillRect(0, 0, 128, 128);

    // Scale pattern
    const scaleSize = 12;
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 12; col++) {
        const x = col * scaleSize + (row % 2 === 0 ? 0 : scaleSize / 2);
        const y = row * scaleSize * 0.7;

        // Scale shape (diamond-ish)
        const darkness = Math.random();
        if (darkness > 0.5) {
          ctx.fillStyle = `rgba(80,70,50,${0.3 + Math.random() * 0.3})`;
        } else {
          ctx.fillStyle = `rgba(100,90,70,${0.2 + Math.random() * 0.2})`;
        }

        ctx.beginPath();
        ctx.moveTo(x, y + scaleSize / 2);
        ctx.lineTo(x + scaleSize / 2, y);
        ctx.lineTo(x + scaleSize, y + scaleSize / 2);
        ctx.lineTo(x + scaleSize / 2, y + scaleSize * 0.8);
        ctx.closePath();
        ctx.fill();

        // Scale outline
        ctx.strokeStyle = 'rgba(60,50,35,0.4)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Random dark spots (python pattern)
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const size = 3 + Math.random() * 8;

      ctx.fillStyle = `rgba(40,30,20,${0.4 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    addNoise(ctx, 128, 128, 16);
  });
}

/** Racing Stripes — bold motorsport aesthetic */
export function weaponRacingStripesTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-racing-stripes', 128, 128, (ctx) => {
    // Black base
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, 128, 128);

    // Red racing stripes (angled)
    const stripeAngle = Math.PI / 6; // 30 degrees
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(stripeAngle);
    ctx.translate(-64, -64);

    // Main red stripe
    const grad = ctx.createLinearGradient(0, 54, 0, 74);
    grad.addColorStop(0, '#b81414');
    grad.addColorStop(0.5, '#d41818');
    grad.addColorStop(1, '#b81414');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 54, 128, 20);

    // White edge stripes
    ctx.fillStyle = '#f0f0f5';
    ctx.fillRect(0, 52, 128, 2);
    ctx.fillRect(0, 74, 128, 2);

    // Secondary stripe
    ctx.fillStyle = 'rgba(180,20,20,0.6)';
    ctx.fillRect(0, 40, 128, 8);

    ctx.restore();

    // Carbon fiber texture overlay
    for (let i = 0; i < 128; i += 4) {
      ctx.fillStyle = `rgba(20,20,25,${0.1 + (i % 8) * 0.02})`;
      ctx.fillRect(0, i, 128, 2);
    }

    addNoise(ctx, 128, 128, 8);
  });
}
