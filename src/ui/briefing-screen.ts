import type { LevelSchema } from '../levels/level-schema';

/**
 * Mission briefing overlay: level name, description, objectives, Start mission button.
 * Westworld / GoldenEye style.
 */
export class BriefingScreen {
  private container: HTMLElement;
  private onStart: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'briefing-screen';
    this.container.style.cssText = `
      position: fixed;
      top: 0; 
      left: 0;
      width: 100vw; 
      height: 100vh;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(20,15,25,0.98) 100%);
      color: #d4af37;
      font-family: 'Courier New', monospace;
      z-index: 25;
      padding: 40px;
      box-sizing: border-box;
      margin: 0;
      border: none;
      outline: none;
    `;
    document.body.appendChild(this.container);
  }

  /** Show briefing for a level. Call show() then pass level data. */
  show(level: LevelSchema): void {
    this.container.innerHTML = '';
    this.container.style.display = 'flex';

    const title = document.createElement('h1');
    title.textContent = level.name.toUpperCase();
    title.style.cssText = 'font-size: 42px; letter-spacing: 6px; margin-bottom: 24px; color: #e8c547;';
    this.container.appendChild(title);

    const brief = document.createElement('p');
    brief.textContent = level.briefing;
    brief.style.cssText = 'font-size: 16px; max-width: 560px; line-height: 1.6; color: #b8a060; margin-bottom: 32px; text-align: center;';
    this.container.appendChild(brief);

    const mapWrap = document.createElement('div');
    mapWrap.style.cssText = 'margin-bottom: 24px; display: flex; flex-direction: column; align-items: center;';
    const mapLabel = document.createElement('div');
    mapLabel.textContent = 'MISSION MAP';
    mapLabel.style.cssText = 'font-size: 12px; letter-spacing: 4px; color: #888; margin-bottom: 8px;';
    mapWrap.appendChild(mapLabel);
    mapWrap.appendChild(this.renderMapCanvas(level));
    this.container.appendChild(mapWrap);

    const objLabel = document.createElement('div');
    objLabel.textContent = 'OBJECTIVES';
    objLabel.style.cssText = 'font-size: 12px; letter-spacing: 4px; color: #888; margin-bottom: 12px;';
    this.container.appendChild(objLabel);

    const list = document.createElement('ul');
    list.style.cssText = 'list-style: none; margin-bottom: 40px; padding: 0;';
    for (const o of level.objectives) {
      const li = document.createElement('li');
      li.textContent = `• ${o.title}`;
      li.style.cssText = 'font-size: 14px; color: #a09050; margin-bottom: 8px;';
      list.appendChild(li);
    }
    this.container.appendChild(list);

    const btn = document.createElement('button');
    btn.textContent = 'START MISSION';
    btn.style.cssText = `
      padding: 14px 48px;
      font-size: 18px;
      font-family: 'Courier New', monospace;
      letter-spacing: 4px;
      background: transparent;
      color: #d4af37;
      border: 2px solid #d4af37;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#d4af37';
      btn.style.color = '#000';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.color = '#d4af37';
    });
    btn.addEventListener('click', () => {
      this.hide();
      this.onStart?.();
    });
    this.container.appendChild(btn);
  }

  private renderMapCanvas(level: LevelSchema): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 220;
    canvas.style.cssText = 'border: 1px solid #6b5a28; background: #090909;';
    const ctx = canvas.getContext('2d');
    if (!ctx || level.rooms.length === 0) return canvas;

    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const room of level.rooms) {
      minX = Math.min(minX, room.x - room.width / 2);
      maxX = Math.max(maxX, room.x + room.width / 2);
      minZ = Math.min(minZ, room.z - room.depth / 2);
      maxZ = Math.max(maxZ, room.z + room.depth / 2);
    }
    const pad = 12;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const sx = (canvas.width - pad * 2) / spanX;
    const sy = (canvas.height - pad * 2) / spanZ;
    const s = Math.min(sx, sy);
    const ox = (canvas.width - spanX * s) * 0.5;
    const oy = (canvas.height - spanZ * s) * 0.5;
    const tx = (x: number) => ox + (x - minX) * s;
    const tz = (z: number) => oy + (z - minZ) * s;

    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#8b7840';
    ctx.lineWidth = 1.2;
    for (const room of level.rooms) {
      const x = tx(room.x - room.width / 2);
      const z = tz(room.z - room.depth / 2);
      ctx.strokeRect(x, z, room.width * s, room.depth * s);
    }

    ctx.fillStyle = '#c99b2a';
    for (const door of level.doors) {
      ctx.fillRect(tx(door.x) - 2, tz(door.z) - 2, 4, 4);
    }

    ctx.fillStyle = '#55ccff';
    ctx.beginPath();
    ctx.arc(tx(level.playerSpawn.x), tz(level.playerSpawn.z), 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff5555';
    for (const e of level.enemies) {
      ctx.beginPath();
      ctx.arc(tx(e.x), tz(e.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  setOnStart(callback: () => void): void {
    this.onStart = callback;
  }
}
