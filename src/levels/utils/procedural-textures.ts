import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function getOrCreate(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
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

// ─── Helpers ───

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

// ─── Concrete Wall (GoldenEye Facility style — large cinder blocks) ───

export function concreteWallTexture(): THREE.CanvasTexture {
  return getOrCreate('concrete-wall', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Base concrete fill
    ctx.fillStyle = '#8a8882';
    ctx.fillRect(0, 0, W, H);

    // Cinder block pattern: 4 rows, offset brick layout
    const blockRows = 4;
    const blockH = H / blockRows;
    const mortarW = 4;

    for (let r = 0; r < blockRows; r++) {
      const by = r * blockH;
      const offset = r % 2 === 0 ? 0 : W / 4;
      const blocksPerRow = 2;
      const blockW = W / blocksPerRow;

      for (let c = -1; c <= blocksPerRow; c++) {
        const bx = c * blockW + offset;

        // Each block gets a slightly different shade
        const base = 125 + Math.floor(Math.random() * 20 - 10);
        const gb = base - 4 + Math.floor(Math.random() * 8);
        ctx.fillStyle = `rgb(${base}, ${gb}, ${gb - 6})`;
        ctx.fillRect(bx + mortarW / 2, by + mortarW / 2, blockW - mortarW, blockH - mortarW);

        // Subtle inner shadow (top-left darker, bottom-right lighter) for 3D depth
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(bx + mortarW / 2, by + mortarW / 2, blockW - mortarW, 3);
        ctx.fillRect(bx + mortarW / 2, by + mortarW / 2, 3, blockH - mortarW);

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx + mortarW / 2, by + blockH - mortarW / 2 - 3, blockW - mortarW, 3);
        ctx.fillRect(bx + blockW - mortarW / 2 - 3, by + mortarW / 2, 3, blockH - mortarW);

        // Random surface imperfections per block
        ctx.globalAlpha = 0.06;
        for (let s = 0; s < 3; s++) {
          const sx = bx + mortarW + Math.random() * (blockW - mortarW * 2);
          const sy = by + mortarW + Math.random() * (blockH - mortarW * 2);
          const sw = 10 + Math.random() * 20;
          const sh = 5 + Math.random() * 10;
          ctx.fillStyle = Math.random() > 0.5 ? '#665544' : '#445566';
          ctx.fillRect(sx, sy, sw, sh);
        }
        ctx.globalAlpha = 1;
      }

      // Mortar lines — horizontal
      ctx.fillStyle = '#5a5850';
      ctx.fillRect(0, by, W, mortarW);
    }
    // Bottom mortar
    ctx.fillStyle = '#5a5850';
    ctx.fillRect(0, H - mortarW, W, mortarW);

    // Mortar lines — vertical (offset per row)
    for (let r = 0; r < blockRows; r++) {
      const by = r * blockH;
      const offset = r % 2 === 0 ? 0 : W / 4;
      const blockW = W / 2;
      for (let c = 0; c <= 2; c++) {
        const mx = c * blockW + offset;
        ctx.fillStyle = '#5a5850';
        ctx.fillRect(mx - mortarW / 2, by, mortarW, blockH);
      }
    }

    // Stain streaks (water damage, dirt)
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#3a3020';
    ctx.fillRect(60, 100, 15, 156);
    ctx.fillStyle = '#304030';
    ctx.fillRect(180, 0, 12, 80);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(100, 180, 40, 76);
    ctx.globalAlpha = 1;

    // Overall surface noise
    addNoise(ctx, W, H, 18);
  });
}

// ─── Floor Tile (GoldenEye Facility — green/grey industrial tiles) ───

export function floorTileTexture(): THREE.CanvasTexture {
  return getOrCreate('floor-tile', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Dark grout base
    ctx.fillStyle = '#2a2a28';
    ctx.fillRect(0, 0, W, H);

    // 4x4 tile grid
    const tiles = 4;
    const tileSize = W / tiles;
    const groutW = 4;

    for (let r = 0; r < tiles; r++) {
      for (let c = 0; c < tiles; c++) {
        const tx = c * tileSize;
        const ty = r * tileSize;

        // Tile color: mix of grey-green with per-tile variation
        const base = 80 + Math.floor(Math.random() * 16 - 8);
        const green = base + 8;
        ctx.fillStyle = `rgb(${base - 4}, ${green}, ${base - 2})`;
        ctx.fillRect(tx + groutW / 2, ty + groutW / 2, tileSize - groutW, tileSize - groutW);

        // Tile edge bevel (top/left = lighter, bottom/right = darker)
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(tx + groutW / 2, ty + groutW / 2, tileSize - groutW, 2);
        ctx.fillRect(tx + groutW / 2, ty + groutW / 2, 2, tileSize - groutW);

        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(tx + groutW / 2, ty + tileSize - groutW / 2 - 2, tileSize - groutW, 2);
        ctx.fillRect(tx + tileSize - groutW / 2 - 2, ty + groutW / 2, 2, tileSize - groutW);

        // Scuff marks on some tiles
        if (Math.random() > 0.5) {
          ctx.globalAlpha = 0.08;
          ctx.strokeStyle = '#222222';
          ctx.lineWidth = 2;
          const sx = tx + 10 + Math.random() * 30;
          const sy = ty + 10 + Math.random() * 30;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.random() * 30 - 15, sy + Math.random() * 30 - 15);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Specular highlight spot (simulates floor reflection)
        if (Math.random() > 0.7) {
          ctx.globalAlpha = 0.04;
          ctx.fillStyle = '#ffffff';
          const hx = tx + tileSize / 2 + Math.random() * 10 - 5;
          const hy = ty + tileSize / 2 + Math.random() * 10 - 5;
          ctx.beginPath();
          ctx.arc(hx, hy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Grout lines (already base color, just reinforce edges)
    ctx.fillStyle = '#1e1e1c';
    for (let i = 0; i <= tiles; i++) {
      ctx.fillRect(0, i * tileSize - groutW / 2, W, groutW);
      ctx.fillRect(i * tileSize - groutW / 2, 0, groutW, H);
    }

    addNoise(ctx, W, H, 14);
  });
}

// ─── Ceiling Panel (Industrial suspended ceiling with light fixtures) ───

export function ceilingPanelTexture(): THREE.CanvasTexture {
  return getOrCreate('ceiling-panel', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Dark frame/grid base
    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(0, 0, W, H);

    // 2x2 recessed panel grid
    const panels = 2;
    const panelSize = W / panels;
    const frameW = 6;

    for (let r = 0; r < panels; r++) {
      for (let c = 0; c < panels; c++) {
        const px = c * panelSize;
        const py = r * panelSize;

        // Panel face — lighter concrete color
        const shade = 150 + Math.floor(Math.random() * 10 - 5);
        ctx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade - 6})`;
        ctx.fillRect(px + frameW, py + frameW, panelSize - frameW * 2, panelSize - frameW * 2);

        // Recessed shadow (panel sits below grid frame)
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(px + frameW, py + frameW, panelSize - frameW * 2, 4);
        ctx.fillRect(px + frameW, py + frameW, 4, panelSize - frameW * 2);

        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px + frameW, py + panelSize - frameW - 4, panelSize - frameW * 2, 4);
        ctx.fillRect(px + panelSize - frameW - 4, py + frameW, 4, panelSize - frameW * 2);

        // Tiny ventilation dots on some panels
        if (r === 0 && c === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          for (let vy = py + 30; vy < py + panelSize - 30; vy += 12) {
            for (let vx = px + 30; vx < px + panelSize - 30; vx += 12) {
              ctx.beginPath();
              ctx.arc(vx, vy, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }

    // Grid frame lines
    ctx.fillStyle = '#555553';
    for (let i = 0; i <= panels; i++) {
      ctx.fillRect(0, i * panelSize - frameW / 2, W, frameW);
      ctx.fillRect(i * panelSize - frameW / 2, 0, frameW, H);
    }
    // Frame highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i <= panels; i++) {
      ctx.fillRect(0, i * panelSize - frameW / 2, W, 1);
      ctx.fillRect(i * panelSize - frameW / 2, 0, 1, H);
    }

    // Fluorescent light tube on one panel (top-left)
    ctx.fillStyle = '#dde8dd';
    ctx.globalAlpha = 0.6;
    ctx.fillRect(30, 50, 10, 56);
    ctx.fillRect(86, 50, 10, 56);
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 40, 86, 76); // glow area
    ctx.globalAlpha = 1;

    addNoise(ctx, W, H, 12);
  });
}

// ─── Wood Crate (Classic military crate with planks, braces, markings) ───

export function woodCrateTexture(): THREE.CanvasTexture {
  return getOrCreate('wood-crate', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Warm wood base
    ctx.fillStyle = '#8B6B43';
    ctx.fillRect(0, 0, W, H);

    // Horizontal planks (6 planks)
    const plankCount = 6;
    const plankH = H / plankCount;
    const gapH = 3;

    for (let i = 0; i < plankCount; i++) {
      const py = i * plankH;

      // Per-plank color variation
      const shade = Math.random() * 20 - 10;
      const r = 139 + shade, g = 107 + shade * 0.8, b = 67 + shade * 0.5;
      ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
      ctx.fillRect(0, py + gapH / 2, W, plankH - gapH);

      // Wood grain — curved lines across plank
      ctx.strokeStyle = `rgba(80, 55, 25, 0.25)`;
      ctx.lineWidth = 1;
      for (let l = 0; l < 8; l++) {
        const gy = py + gapH + 2 + Math.random() * (plankH - gapH * 2 - 4);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        for (let gx = 0; gx < W; gx += 40) {
          ctx.lineTo(gx + 40, gy + Math.random() * 3 - 1.5);
        }
        ctx.stroke();
      }

      // Knot holes on some planks
      if (Math.random() > 0.6) {
        const kx = 30 + Math.random() * (W - 60);
        const ky = py + plankH / 2;
        ctx.fillStyle = `rgba(60, 40, 20, 0.5)`;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 6, 4, Math.random() * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Ring around knot
        ctx.strokeStyle = `rgba(70, 50, 25, 0.3)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 10, 7, Math.random() * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Plank gap (dark line)
      ctx.fillStyle = '#3a2810';
      ctx.fillRect(0, py, W, gapH);
    }

    // Corner brace plates (L-shaped metal at each corner)
    const braceSize = 35;
    const braceW = 8;
    ctx.fillStyle = '#666660';
    // Top-left
    ctx.fillRect(0, 0, braceSize, braceW);
    ctx.fillRect(0, 0, braceW, braceSize);
    // Top-right
    ctx.fillRect(W - braceSize, 0, braceSize, braceW);
    ctx.fillRect(W - braceW, 0, braceW, braceSize);
    // Bottom-left
    ctx.fillRect(0, H - braceW, braceSize, braceW);
    ctx.fillRect(0, H - braceSize, braceW, braceSize);
    // Bottom-right
    ctx.fillRect(W - braceSize, H - braceW, braceSize, braceW);
    ctx.fillRect(W - braceW, H - braceSize, braceW, braceSize);

    // Nails/bolts on braces
    ctx.fillStyle = '#444440';
    const nails = [
      [12, 4], [4, 12], [28, 4], [4, 28],
      [W - 12, 4], [W - 4, 12], [W - 28, 4], [W - 4, 28],
      [12, H - 4], [4, H - 12], [28, H - 4], [4, H - 28],
      [W - 12, H - 4], [W - 4, H - 12], [W - 28, H - 4], [W - 4, H - 28],
    ];
    for (const [nx, ny] of nails) {
      ctx.beginPath();
      ctx.arc(nx, ny, 3, 0, Math.PI * 2);
      ctx.fill();
      // Nail highlight
      ctx.fillStyle = '#888880';
      ctx.beginPath();
      ctx.arc(nx - 1, ny - 1, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#444440';
    }

    // Stencil marking: "MI6" or "007"
    ctx.save();
    ctx.fillStyle = 'rgba(30, 20, 10, 0.35)';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MI6', W / 2, H / 2 + 12);
    ctx.restore();

    addNoise(ctx, W, H, 16);
  });
}

// ─── Metal Crate (Military arms crate — riveted steel panels) ───

export function metalCrateTexture(): THREE.CanvasTexture {
  return getOrCreate('metal-crate', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Steel blue-grey base
    ctx.fillStyle = '#566878';
    ctx.fillRect(0, 0, W, H);

    // Thick outer frame
    const frameW = 12;
    ctx.fillStyle = '#4a5a6a';
    ctx.fillRect(0, 0, W, frameW);
    ctx.fillRect(0, H - frameW, W, frameW);
    ctx.fillRect(0, 0, frameW, H);
    ctx.fillRect(W - frameW, 0, frameW, H);

    // Inner panel — slightly lighter
    ctx.fillStyle = '#667888';
    ctx.fillRect(frameW + 2, frameW + 2, W - frameW * 2 - 4, H - frameW * 2 - 4);

    // Panel seam — horizontal center
    ctx.fillStyle = '#4a5565';
    ctx.fillRect(frameW, H / 2 - 2, W - frameW * 2, 4);
    // Panel seam — vertical center
    ctx.fillRect(W / 2 - 2, frameW, 4, H - frameW * 2);

    // Bevel: top/left highlight, bottom/right shadow
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 0, W, 2);
    ctx.fillRect(0, 0, 2, H);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, H - 2, W, 2);
    ctx.fillRect(W - 2, 0, 2, H);

    // Diagonal reinforcement stripes
    ctx.strokeStyle = 'rgba(60, 70, 80, 0.3)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(frameW, frameW);
    ctx.lineTo(W - frameW, H - frameW);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - frameW, frameW);
    ctx.lineTo(frameW, H - frameW);
    ctx.stroke();

    // Rivets around edges (every 30px)
    const rivetR = 4;
    ctx.fillStyle = '#8899aa';
    const rivetPositions: [number, number][] = [];
    for (let x = frameW / 2; x < W; x += 30) {
      rivetPositions.push([x, frameW / 2]);
      rivetPositions.push([x, H - frameW / 2]);
    }
    for (let y = frameW / 2 + 30; y < H - frameW / 2; y += 30) {
      rivetPositions.push([frameW / 2, y]);
      rivetPositions.push([W - frameW / 2, y]);
    }
    // Center cross rivets
    rivetPositions.push([W / 2, H / 2]);

    for (const [rx, ry] of rivetPositions) {
      // Rivet body
      ctx.fillStyle = '#7a8a9a';
      ctx.beginPath();
      ctx.arc(rx, ry, rivetR, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = '#a0b0c0';
      ctx.beginPath();
      ctx.arc(rx - 1, ry - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(rx + 1, ry + 1, rivetR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Scratches across surface
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#aabbcc';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const sx = 20 + Math.random() * (W - 40);
      const sy = 20 + Math.random() * (H - 40);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.random() * 60 - 30, sy + Math.random() * 60 - 30);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Stencil: "ARMS" or classification mark
    ctx.save();
    ctx.fillStyle = 'rgba(200, 180, 50, 0.25)';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CLASSIFIED', W / 2, H / 2 + 50);
    ctx.restore();

    addNoise(ctx, W, H, 14);
  });
}

// ─── Barrel (Military barrel with metal bands, stencil, hazard marking) ───

export function barrelTexture(): THREE.CanvasTexture {
  return getOrCreate('barrel', 128, 256, (ctx) => {
    const W = 128, H = 256;

    // Olive drab body
    ctx.fillStyle = '#5a6b44';
    ctx.fillRect(0, 0, W, H);

    // Vertical stave lines (subtle)
    ctx.strokeStyle = 'rgba(60, 80, 40, 0.25)';
    ctx.lineWidth = 1;
    for (let x = W / 6; x < W; x += W / 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Slight barrel curvature shading (darker at edges, lighter center)
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.15)');
    grad.addColorStop(0.2, 'rgba(0,0,0,0.03)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.8, 'rgba(0,0,0,0.03)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Metal bands: top rim, upper band, middle band, lower band, bottom rim
    const bandH = 14;
    const bands = [4, 50, 120, 190, H - bandH - 4];
    for (const by of bands) {
      // Band body
      ctx.fillStyle = '#484848';
      ctx.fillRect(0, by, W, bandH);

      // Band highlight (top edge)
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(0, by, W, 2);

      // Band shadow (bottom edge)
      ctx.fillStyle = '#2e2e2e';
      ctx.fillRect(0, by + bandH - 2, W, 2);

      // Rivets on band
      ctx.fillStyle = '#5a5a5a';
      for (let rx = 15; rx < W; rx += 30) {
        ctx.beginPath();
        ctx.arc(rx, by + bandH / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rust streaks dripping down from bands
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#8b5a2a';
    ctx.fillRect(20, 64, 6, 40);
    ctx.fillRect(90, 134, 5, 35);
    ctx.fillRect(50, 204, 7, 30);
    ctx.globalAlpha = 1;

    // Hazard diamond label (center of barrel)
    const labelX = W / 2 - 25;
    const labelY = 140;
    const labelW = 50;
    const labelH = 40;

    ctx.fillStyle = '#ccaa22';
    ctx.fillRect(labelX, labelY, labelW, labelH);
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2;
    ctx.strokeRect(labelX, labelY, labelW, labelH);

    // Hazard text
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HAZARD', W / 2, labelY + 16);
    ctx.font = 'bold 11px monospace';
    ctx.fillText('CLASS 3', W / 2, labelY + 32);
    ctx.textAlign = 'start';

    // Upper stencil: serial number
    ctx.fillStyle = 'rgba(220, 220, 200, 0.2)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOT-007-B', W / 2, 90);
    ctx.textAlign = 'start';

    // Dent marks
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.ellipse(35, 220, 12, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    addNoise(ctx, W, H, 16);
  });
}

// ─── Wall trim / baseboard (optional accent texture) ───

export function wallTrimTexture(): THREE.CanvasTexture {
  return getOrCreate('wall-trim', 256, 32, (ctx) => {
    const W = 256, H = 32;

    // Dark grey-brown trim
    ctx.fillStyle = '#555550';
    ctx.fillRect(0, 0, W, H);

    // Top highlight
    ctx.fillStyle = '#6a6a65';
    ctx.fillRect(0, 0, W, 2);

    // Bottom shadow
    ctx.fillStyle = '#3a3a38';
    ctx.fillRect(0, H - 2, W, 2);

    // Horizontal groove detail
    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(0, 10, W, 3);
    ctx.fillStyle = '#626260';
    ctx.fillRect(0, 10, W, 1);

    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(0, 20, W, 3);
    ctx.fillStyle = '#626260';
    ctx.fillRect(0, 20, W, 1);

    addNoise(ctx, W, H, 10);
  });
}

// ─── Facility Door (Steel security door with handle, hinges, reinforcement) ───

export function facilityDoorTexture(): THREE.CanvasTexture {
  return getOrCreate('facility-door', 128, 256, (ctx) => {
    const W = 128, H = 256;

    // Steel grey base
    ctx.fillStyle = '#606870';
    ctx.fillRect(0, 0, W, H);

    // Outer frame border
    const frame = 6;
    ctx.fillStyle = '#4a5058';
    ctx.fillRect(0, 0, W, frame);
    ctx.fillRect(0, H - frame, W, frame);
    ctx.fillRect(0, 0, frame, H);
    ctx.fillRect(W - frame, 0, frame, H);

    // Frame bevel — highlight top/left, shadow bottom/right
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, 0, W, 2);
    ctx.fillRect(0, 0, 2, H);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, H - 2, W, 2);
    ctx.fillRect(W - 2, 0, 2, H);

    // Two recessed panels (upper and lower)
    const panelInset = 14;
    const panelGap = 10;
    const panelH = (H - frame * 2 - panelGap * 3) / 2;

    for (let i = 0; i < 2; i++) {
      const py = frame + panelGap + i * (panelH + panelGap);

      // Recessed panel body
      ctx.fillStyle = '#586068';
      ctx.fillRect(panelInset, py, W - panelInset * 2, panelH);

      // Panel shadow (recessed: top/left dark, bottom/right light)
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(panelInset, py, W - panelInset * 2, 3);
      ctx.fillRect(panelInset, py, 3, panelH);

      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(panelInset, py + panelH - 3, W - panelInset * 2, 3);
      ctx.fillRect(W - panelInset - 3, py, 3, panelH);
    }

    // Horizontal reinforcement bar across middle
    const barY = H / 2 - 4;
    ctx.fillStyle = '#505860';
    ctx.fillRect(frame, barY, W - frame * 2, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(frame, barY, W - frame * 2, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(frame, barY + 7, W - frame * 2, 1);

    // Door handle (right side, center height)
    const handleX = W - 28;
    const handleY = H / 2 - 10;
    // Handle plate
    ctx.fillStyle = '#888890';
    ctx.fillRect(handleX - 4, handleY - 8, 16, 36);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    ctx.strokeRect(handleX - 4, handleY - 8, 16, 36);
    // Handle bar
    ctx.fillStyle = '#a0a0a8';
    ctx.fillRect(handleX, handleY, 10, 4);
    ctx.fillRect(handleX, handleY, 4, 16);
    // Handle highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(handleX, handleY, 10, 1);

    // Keyhole (below handle)
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.arc(handleX + 4, handleY + 24, 3, 0, Math.PI * 2);
    ctx.fill();

    // Hinges (left side, top and bottom)
    const hingeW = 8;
    const hingeH = 20;
    for (const hy of [30, H - 50]) {
      ctx.fillStyle = '#707878';
      ctx.fillRect(frame - 2, hy, hingeW, hingeH);
      // Hinge pin
      ctx.fillStyle = '#888888';
      ctx.beginPath();
      ctx.arc(frame + hingeW / 2 - 2, hy + hingeH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#aaaaaa';
      ctx.beginPath();
      ctx.arc(frame + hingeW / 2 - 3, hy + hingeH / 2 - 1, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Small window at top of door (wire-reinforced glass)
    const winX = W / 2 - 20;
    const winY = frame + panelGap + 15;
    const winW = 40;
    const winH = 30;
    ctx.fillStyle = '#3a5555';
    ctx.fillRect(winX, winY, winW, winH);
    // Window frame
    ctx.strokeStyle = '#505860';
    ctx.lineWidth = 3;
    ctx.strokeRect(winX, winY, winW, winH);
    // Wire mesh pattern
    ctx.strokeStyle = 'rgba(100, 120, 120, 0.3)';
    ctx.lineWidth = 1;
    for (let wx = winX + 6; wx < winX + winW; wx += 6) {
      ctx.beginPath();
      ctx.moveTo(wx, winY);
      ctx.lineTo(wx, winY + winH);
      ctx.stroke();
    }
    for (let wy = winY + 6; wy < winY + winH; wy += 6) {
      ctx.beginPath();
      ctx.moveTo(winX, wy);
      ctx.lineTo(winX + winW, wy);
      ctx.stroke();
    }

    addNoise(ctx, W, H, 12);
  });
}

// ─── Locked Door variant (red-tinted with warning stripe) ───

export function lockedDoorTexture(): THREE.CanvasTexture {
  return getOrCreate('locked-door', 128, 256, (ctx) => {
    // Start from same base as facility door
    const W = 128, H = 256;

    // Darker steel base with red tint
    ctx.fillStyle = '#5a4448';
    ctx.fillRect(0, 0, W, H);

    // Outer frame
    const frame = 6;
    ctx.fillStyle = '#4a3840';
    ctx.fillRect(0, 0, W, frame);
    ctx.fillRect(0, H - frame, W, frame);
    ctx.fillRect(0, 0, frame, H);
    ctx.fillRect(W - frame, 0, frame, H);

    // Frame bevel
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 0, W, 2);
    ctx.fillRect(0, 0, 2, H);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(0, H - 2, W, 2);
    ctx.fillRect(W - 2, 0, 2, H);

    // Two recessed panels
    const panelInset = 14;
    const panelGap = 10;
    const panelH = (H - frame * 2 - panelGap * 3) / 2;

    for (let i = 0; i < 2; i++) {
      const py = frame + panelGap + i * (panelH + panelGap);
      ctx.fillStyle = '#503840';
      ctx.fillRect(panelInset, py, W - panelInset * 2, panelH);

      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(panelInset, py, W - panelInset * 2, 3);
      ctx.fillRect(panelInset, py, 3, panelH);

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(panelInset, py + panelH - 3, W - panelInset * 2, 3);
      ctx.fillRect(W - panelInset - 3, py, 3, panelH);
    }

    // Danger stripe across middle (black and yellow diagonal)
    const stripeY = H / 2 - 10;
    const stripeH = 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame, stripeY, W - frame * 2, stripeH);
    ctx.clip();
    for (let sx = -stripeH; sx < W + stripeH; sx += 20) {
      ctx.fillStyle = '#ccaa00';
      ctx.beginPath();
      ctx.moveTo(sx, stripeY);
      ctx.lineTo(sx + 10, stripeY);
      ctx.lineTo(sx + 10 + stripeH, stripeY + stripeH);
      ctx.lineTo(sx + stripeH, stripeY + stripeH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Black in between (already visible as base color)

    // Heavy lock plate
    const lockX = W / 2 - 12;
    const lockY = H / 2 + 20;
    ctx.fillStyle = '#888888';
    ctx.fillRect(lockX, lockY, 24, 30);
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 2;
    ctx.strokeRect(lockX, lockY, 24, 30);
    // Keyhole
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.arc(lockX + 12, lockY + 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(lockX + 10, lockY + 12, 4, 10);

    // "RESTRICTED" stencil
    ctx.fillStyle = 'rgba(200, 60, 60, 0.4)';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RESTRICTED', W / 2, H - 30);
    ctx.textAlign = 'start';

    addNoise(ctx, W, H, 14);
  });
}

// ─── Door Frame Texture (dark metal surround) ───

export function doorFrameTexture(): THREE.CanvasTexture {
  return getOrCreate('door-frame', 32, 256, (ctx) => {
    const W = 32, H = 256;

    // Dark steel frame
    ctx.fillStyle = '#3a3e44';
    ctx.fillRect(0, 0, W, H);

    // Inner edge highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(W - 2, 0, 2, H);

    // Outer edge shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, 2, H);

    // Horizontal grooves every ~50px
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let y = 40; y < H; y += 50) {
      ctx.fillRect(2, y, W - 4, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(2, y + 2, W - 4, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
    }

    // Bolt holes at top, mid, bottom
    for (const by of [20, H / 2, H - 20]) {
      ctx.fillStyle = '#555560';
      ctx.beginPath();
      ctx.arc(W / 2, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a6a70';
      ctx.beginPath();
      ctx.arc(W / 2 - 1, by - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    addNoise(ctx, W, H, 10);
  });
}

// ─── Blood Splatter Sprites (hit effect decals — Fallout/retro FPS style) ───

function getOrCreateDecal(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  draw(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Seeded random for consistent variants */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Enhanced blood splatter with multiple pattern types and higher detail */
function drawBloodSplatter(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const seed = variant * 7919;

  // Determine pattern type based on variant
  const patternType = variant % 4;

  if (patternType === 0) {
    // IMPACT CRATER — dense center with explosive radiating droplets
    drawImpactCrater(ctx, w, h, cx, cy, seed);
  } else if (patternType === 1) {
    // ARTERIAL SPRAY — directional fan pattern (realistic wound spray)
    drawArterialSpray(ctx, w, h, cx, cy, seed);
  } else if (patternType === 2) {
    // BULLET EXIT — explosive radial burst with heavy spatter
    drawBulletExit(ctx, w, h, cx, cy, seed);
  } else {
    // CLASSIC SPLAT — elliptical with drips (original enhanced)
    drawClassicSplat(ctx, w, h, cx, cy, seed, variant);
  }

  // Add fine mist particles to all patterns for realism
  addMistParticles(ctx, w, h, cx, cy, seed, 8 + (variant % 5));
}

/** Impact crater pattern — dense center, explosive radiating droplets */
function drawImpactCrater(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number): void {
  const mainR = w * 0.22;

  // Dense dark core (impact site)
  ctx.fillStyle = 'rgba(35, 5, 4, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR, 0, Math.PI * 2);
  ctx.fill();

  // Outer crust
  ctx.fillStyle = 'rgba(65, 12, 10, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // Mid blood
  ctx.fillStyle = 'rgba(120, 25, 22, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Bright wet center
  ctx.fillStyle = 'rgba(200, 42, 38, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Radiating explosive droplets (16-20 droplets)
  const dropletCount = 16 + Math.floor(seededRandom(seed) * 5);
  for (let i = 0; i < dropletCount; i++) {
    const angle = seededRandom(seed + i * 2.7) * Math.PI * 2;
    const dist = mainR * (1.2 + seededRandom(seed + i * 1.3) * 0.8);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dropR = w * (0.015 + seededRandom(seed + i * 3.1) * 0.025);
    const opacity = 0.8 - (dist / (mainR * 2)) * 0.4;

    ctx.fillStyle = `rgba(95, 20, 17, ${opacity})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dropR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Splatter streaks radiating outward
  const streakCount = 8 + Math.floor(seededRandom(seed * 1.1) * 4);
  for (let i = 0; i < streakCount; i++) {
    const angle = seededRandom(seed * 0.5 + i * 3.2) * Math.PI * 2;
    const len = mainR * (0.7 + seededRandom(seed + i * 2.5) * 0.9);
    const sx = Math.cos(angle) * len * 0.6;
    const sy = Math.sin(angle) * len * 0.6;
    const sw = w * (0.008 + seededRandom(seed + i) * 0.008);
    const sh = len * 0.6;

    ctx.save();
    ctx.translate(cx + sx, cy + sy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(75, 16, 14, ${0.75 - i * 0.03})`;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
}

/** Arterial spray pattern — directional fan (realistic wound spray) */
function drawArterialSpray(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number): void {
  const sprayAngle = seededRandom(seed * 0.3) * Math.PI * 2;
  const fanSpread = Math.PI * 0.4; // 72-degree fan
  const mainR = w * 0.18;

  // Small impact point
  ctx.fillStyle = 'rgba(50, 8, 6, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(180, 35, 30, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Directional spray streaks (elongated droplets in fan pattern)
  const streakCount = 20 + Math.floor(seededRandom(seed) * 12);
  for (let i = 0; i < streakCount; i++) {
    const angleOffset = (seededRandom(seed + i * 1.7) - 0.5) * fanSpread;
    const angle = sprayAngle + angleOffset;
    const dist = mainR * (0.8 + seededRandom(seed + i * 2.1) * 1.5);
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * dist;
    const sw = w * (0.006 + seededRandom(seed + i * 1.2) * 0.012);
    const sh = dist * (0.4 + seededRandom(seed + i * 3.3) * 0.3);

    ctx.save();
    ctx.translate(cx + sx * 0.5, cy + sy * 0.5);
    ctx.rotate(angle);
    const opacity = 0.85 - (dist / (mainR * 2.5)) * 0.5;
    ctx.fillStyle = `rgba(110, 23, 20, ${opacity})`;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  // Droplets along spray path
  const dropletCount = 12 + Math.floor(seededRandom(seed * 1.5) * 8);
  for (let i = 0; i < dropletCount; i++) {
    const angleOffset = (seededRandom(seed * 0.7 + i * 2.3) - 0.5) * fanSpread;
    const angle = sprayAngle + angleOffset;
    const dist = mainR * (0.6 + seededRandom(seed + i * 1.9) * 1.8);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dropR = w * (0.012 + seededRandom(seed + i * 2.8) * 0.02);

    ctx.fillStyle = `rgba(85, 18, 15, ${0.8})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dropR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Bullet exit pattern — explosive radial burst with heavy spatter */
function drawBulletExit(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number): void {
  const mainR = w * 0.25;

  // Irregular jagged core (torn flesh)
  ctx.fillStyle = 'rgba(40, 6, 5, 1)';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const jitter = 0.8 + seededRandom(seed + i * 1.5) * 0.4;
    const r = mainR * jitter;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Outer spatter ring
  ctx.fillStyle = 'rgba(75, 15, 12, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Mid blood
  ctx.fillStyle = 'rgba(130, 27, 23, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Bright core
  ctx.fillStyle = 'rgba(210, 48, 42, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Heavy radial spatter (large chunks)
  const chunkCount = 10 + Math.floor(seededRandom(seed) * 6);
  for (let i = 0; i < chunkCount; i++) {
    const angle = seededRandom(seed + i * 2.1) * Math.PI * 2;
    const dist = mainR * (1.1 + seededRandom(seed + i * 1.4) * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const chunkR = w * (0.025 + seededRandom(seed + i * 3.7) * 0.035);

    // Irregular chunk shape
    ctx.fillStyle = `rgba(70, 14, 11, ${0.9})`;
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy + dy, chunkR, chunkR * 1.3, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  // Long streaks (explosive force)
  const streakCount = 14 + Math.floor(seededRandom(seed * 1.3) * 8);
  for (let i = 0; i < streakCount; i++) {
    const angle = seededRandom(seed * 0.8 + i * 2.9) * Math.PI * 2;
    const len = mainR * (1.2 + seededRandom(seed + i * 1.8) * 1.3);
    const sx = Math.cos(angle) * len * 0.7;
    const sy = Math.sin(angle) * len * 0.7;
    const sw = w * (0.007 + seededRandom(seed + i * 2.2) * 0.01);
    const sh = len * 0.8;

    ctx.save();
    ctx.translate(cx + sx, cy + sy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(60, 13, 11, ${0.7})`;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
}

/** Classic splat pattern — elliptical with drips (enhanced) */
function drawClassicSplat(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number, variant: number): void {
  const mainRx = w * (0.2 + (variant % 4) * 0.04);
  const mainRy = h * (0.18 + (variant % 3) * 0.05);
  const tilt = seededRandom(seed * 0.5) * Math.PI * 0.5;

  // Dark outer edge
  ctx.fillStyle = 'rgba(45, 7, 6, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 1.2, mainRy * 1.25, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Dried crust
  ctx.fillStyle = 'rgba(80, 16, 14, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 1.0, mainRy * 1.05, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Mid blood
  ctx.fillStyle = 'rgba(135, 28, 24, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 0.68, mainRy * 0.72, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Bright wet center
  ctx.fillStyle = 'rgba(205, 44, 39, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 0.38, mainRy * 0.42, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Drip trails (gravity pulls downward)
  const dripCount = 3 + Math.floor(seededRandom(seed) * 4);
  for (let i = 0; i < dripCount; i++) {
    const angleBase = Math.PI * 0.5; // Downward
    const angle = angleBase + (seededRandom(seed + i * 1.7) - 0.5) * 0.6;
    const dist = mainRy * (0.5 + seededRandom(seed + i * 2.3) * 0.9);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dripW = w * (0.015 + seededRandom(seed + i * 3.1) * 0.015);
    const dripH = dist * (0.6 + seededRandom(seed + i * 1.9) * 0.5);

    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(90, 19, 16, ${0.85 - i * 0.08})`;
    ctx.fillRect(-dripW / 2, -dripH / 2, dripW, dripH);
    ctx.restore();
  }

  // Speckles around main splat
  const speckCount = 6 + Math.floor(seededRandom(seed * 1.2) * 6);
  for (let i = 0; i < speckCount; i++) {
    const angle = seededRandom(seed + i * 2.5) * Math.PI * 2;
    const dist = mainRx * (0.8 + seededRandom(seed + i * 1.6) * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const r = w * (0.012 + seededRandom(seed + i * 3.4) * 0.015);

    ctx.fillStyle = `rgba(65, 13, 11, ${0.75})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Fine mist particles — tiny dots scattered around for realism */
function addMistParticles(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = seededRandom(seed + i * 4.7) * Math.PI * 2;
    const dist = w * (0.2 + seededRandom(seed + i * 3.9) * 0.35);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const r = w * (0.004 + seededRandom(seed + i * 5.1) * 0.006);
    const opacity = 0.4 + seededRandom(seed + i * 2.8) * 0.3;

    ctx.fillStyle = `rgba(60, 12, 10, ${opacity})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Blood splatter texture for hit decals/particles. variant 0–11 for variety. 256px for maximum detail. */
export function bloodSplatterTexture(variant: number = 0): THREE.CanvasTexture {
  const v = Math.max(0, Math.min(11, Math.floor(variant)));
  return getOrCreateDecal(`blood-splatter-256-${v}`, 256, 256, (ctx) => drawBloodSplatter(ctx, 256, 256, v));
}

/** All blood splatter variants (for random selection). */
export function bloodSplatterTextures(): THREE.CanvasTexture[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => bloodSplatterTexture(i));
}
