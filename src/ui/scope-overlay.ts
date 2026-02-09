/**
 * Sniper scope overlay — dark vignette with crosshairs.
 */
export class ScopeOverlay {
  private overlay: HTMLDivElement;
  private _visible = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 4;
      transition: opacity 0.1s;
    `;
    this.overlay.innerHTML = `
      <div style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: radial-gradient(circle at center, transparent 20%, rgba(0,0,0,0.95) 45%);
      "></div>
      <div style="
        position: absolute;
        top: 50%; left: 0;
        width: 100%; height: 1px;
        background: rgba(0,0,0,0.6);
      "></div>
      <div style="
        position: absolute;
        top: 0; left: 50%;
        width: 1px; height: 100%;
        background: rgba(0,0,0,0.6);
      "></div>
      <div style="
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 6px; height: 6px;
        border: 1px solid rgba(0,0,0,0.5);
        border-radius: 50%;
      "></div>
    `;
    document.body.appendChild(this.overlay);
  }

  set visible(v: boolean) {
    if (v === this._visible) return;
    this._visible = v;
    this.overlay.style.opacity = v ? '1' : '0';
  }

  get visible(): boolean {
    return this._visible;
  }
}
