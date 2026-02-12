/**
 * 2D screen-space blood overlay — guaranteed visible hit feedback.
 * Projects 3D hit positions to screen and draws blood splats on a canvas overlay.
 */

import * as THREE from 'three';

interface BloodSplat {
  x: number;
  y: number;
  size: number;
  life: number;
  maxLife: number;
  rotation: number;
}

export class BloodOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private splats: BloodSplat[] = [];
  private readonly maxSplats = 20;

  private boundResize = () => this.resize();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 800;
    `;
    document.body.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', this.boundResize);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for blood overlay');
    this.ctx = ctx;
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Spawn a blood splat at the given world position (projects to screen).
   */
  spawn(worldPosition: THREE.Vector3, camera: THREE.Camera): void {
    camera.updateMatrixWorld(true);
    const ndc = worldPosition.clone().project(camera);
    if (ndc.z > 1 || ndc.z < -1) return; // Behind camera
    const x = (ndc.x + 1) * 0.5 * this.canvas.width;
    const y = (1 - ndc.y) * 0.5 * this.canvas.height;
    if (x < -50 || x > this.canvas.width + 50 || y < -50 || y > this.canvas.height + 50) return;

    if (this.splats.length >= this.maxSplats) {
      this.splats.shift();
    }
    this.splats.push({
      x,
      y,
      size: 55 + Math.random() * 50, // Increased to 55-105px
      life: 0,
      maxLife: 1 + Math.random() * 0.5,
      rotation: Math.random() * Math.PI * 2,
    });
  }

  update(dt: number): void {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      this.splats[i].life += dt;
      if (this.splats[i].life >= this.splats[i].maxLife) {
        this.splats.splice(i, 1);
      }
    }
    this.draw();
  }

  private draw(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const s of this.splats) {
      const t = s.life / s.maxLife;
      const opacity = 1 - t;
      if (opacity <= 0) continue;

      this.ctx.save();
      this.ctx.globalAlpha = opacity;
      this.ctx.translate(s.x, s.y);
      this.ctx.rotate(s.rotation);

      // Determine pattern variant based on splat properties
      const variant = Math.floor(s.size * 7.3) % 3;

      if (variant === 0) {
        // Impact crater pattern
        this.drawImpactPattern(s, opacity);
      } else if (variant === 1) {
        // Arterial spray pattern
        this.drawSprayPattern(s, opacity);
      } else {
        // Classic splatter
        this.drawClassicPattern(s, opacity);
      }

      this.ctx.restore();
    }
  }

  /** Impact crater — dense center with radiating droplets */
  private drawImpactPattern(s: BloodSplat, opacity: number): void {
    // Dark outer edge
    this.ctx.fillStyle = `rgba(50, 8, 6, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s.size, 0, Math.PI * 2);
    this.ctx.fill();

    // Mid layer
    this.ctx.fillStyle = `rgba(100, 20, 17, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s.size * 0.75, 0, Math.PI * 2);
    this.ctx.fill();

    // Bright center
    this.ctx.fillStyle = `rgba(190, 40, 35, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s.size * 0.4, 0, Math.PI * 2);
    this.ctx.fill();

    // Radiating droplets
    const droplets = 8 + Math.floor(s.size * 0.3);
    for (let i = 0; i < droplets; i++) {
      const angle = (i / droplets) * Math.PI * 2 + s.rotation * 0.5;
      const dist = s.size * (1.1 + Math.sin(i * 2.7) * 0.3);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const r = s.size * (0.08 + Math.cos(i * 1.9) * 0.04);

      this.ctx.fillStyle = `rgba(80, 16, 14, ${opacity * 0.8})`;
      this.ctx.beginPath();
      this.ctx.arc(dx, dy, r, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /** Arterial spray — directional streaks */
  private drawSprayPattern(s: BloodSplat, opacity: number): void {
    // Small impact point
    this.ctx.fillStyle = `rgba(60, 10, 8, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s.size * 0.4, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = `rgba(180, 35, 30, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s.size * 0.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Directional streaks
    const streakCount = 10 + Math.floor(s.size * 0.4);
    const sprayAngle = s.rotation;
    const fanSpread = Math.PI * 0.35;

    for (let i = 0; i < streakCount; i++) {
      const angleOffset = (Math.sin(i * 2.1) * 0.5) * fanSpread;
      const angle = sprayAngle + angleOffset;
      const len = s.size * (0.8 + Math.cos(i * 1.7) * 0.6);
      const width = s.size * (0.05 + Math.sin(i * 3.3) * 0.03);

      this.ctx.save();
      this.ctx.translate(Math.cos(angle) * len * 0.5, Math.sin(angle) * len * 0.5);
      this.ctx.rotate(angle);
      this.ctx.fillStyle = `rgba(100, 22, 19, ${opacity * 0.85})`;
      this.ctx.fillRect(-width / 2, -len / 2, width, len);
      this.ctx.restore();
    }
  }

  /** Classic splatter — elliptical with drips */
  private drawClassicPattern(s: BloodSplat, opacity: number): void {
    const rx = s.size * 0.95;
    const ry = s.size * 1.15;

    // Dark outer edge
    this.ctx.fillStyle = `rgba(55, 9, 7, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Mid layer
    this.ctx.fillStyle = `rgba(120, 24, 20, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, rx * 0.7, ry * 0.75, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Bright center
    this.ctx.fillStyle = `rgba(200, 42, 37, ${opacity})`;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, rx * 0.35, ry * 0.4, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Drip trails
    const dripCount = 3 + Math.floor(s.size * 0.1);
    for (let i = 0; i < dripCount; i++) {
      const angle = Math.PI * 0.5 + (Math.sin(i * 2.5) - 0.5) * 0.4;
      const len = ry * (0.5 + Math.cos(i * 1.8) * 0.4);
      const width = s.size * (0.08 + Math.sin(i * 3.1) * 0.04);

      this.ctx.save();
      this.ctx.translate(Math.cos(angle) * len * 0.5, Math.sin(angle) * len * 0.5);
      this.ctx.rotate(angle);
      this.ctx.fillStyle = `rgba(85, 18, 15, ${opacity * 0.9})`;
      this.ctx.fillRect(-width / 2, -len / 2, width, len);
      this.ctx.restore();
    }

    // Speckles
    const speckCount = 4 + Math.floor(s.size * 0.15);
    for (let i = 0; i < speckCount; i++) {
      const angle = (i / speckCount) * Math.PI * 2 + s.rotation;
      const dist = s.size * (0.7 + Math.sin(i * 3.7) * 0.3);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const r = s.size * (0.06 + Math.cos(i * 2.9) * 0.03);

      this.ctx.fillStyle = `rgba(70, 14, 12, ${opacity * 0.75})`;
      this.ctx.beginPath();
      this.ctx.arc(dx, dy, r, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.boundResize);
    if (document.body.contains(this.canvas)) {
      document.body.removeChild(this.canvas);
    }
  }
}
