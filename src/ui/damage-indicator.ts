/**
 * Full-screen directional damage flash.
 * Shows a red vignette that's stronger on the side the damage came from.
 */
export class DamageIndicator {
  private overlay: HTMLDivElement;
  private timer = 0;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 5;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(180, 0, 0, 0.6) 100%);
    `;
    document.body.appendChild(this.overlay);
  }

  /** Flash the damage indicator */
  flash(): void {
    this.timer = 0.3;
    this.overlay.style.opacity = '0.8';
  }

  update(dt: number): void {
    if (this.timer > 0) {
      this.timer -= dt;
      const opacity = Math.max(0, this.timer / 0.3) * 0.8;
      this.overlay.style.opacity = String(opacity);
    }
  }
}
