import type { ObjectiveState } from '../levels/objective-system';

/**
 * HUD panel showing current mission objectives with checkmarks when complete.
 */
export class ObjectivesDisplay {
  private container: HTMLElement;
  private listEl: HTMLElement | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'objectives-display';
    this.container.style.cssText = `
      position: absolute;
      top: 60px;
      left: 20px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.9);
      pointer-events: none;
      max-width: 280px;
    `;
    this.container.style.display = 'none';
    document.getElementById('hud')?.appendChild(this.container);
  }

  /** Attach to HUD if not already (call after HUD exists). */
  attach(): void {
    if (this.container.parentElement) return;
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(this.container);
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  update(objectives: ObjectiveState[]): void {
    if (objectives.length === 0) {
      this.container.innerHTML = '';
      this.listEl = null;
      return;
    }

    if (!this.listEl) {
      const label = document.createElement('div');
      label.textContent = 'OBJECTIVES';
      label.style.cssText = 'font-size: 10px; letter-spacing: 2px; color: rgba(212,175,55,0.9); margin-bottom: 6px;';
      this.container.appendChild(label);
      this.listEl = document.createElement('div');
      this.container.appendChild(this.listEl);
    }

    this.listEl.innerHTML = objectives
      .map(
        (o) =>
          `<div style="margin-bottom: 4px;">${o.completed ? '&#10003;' : '&#9633;'} ${o.title}</div>`,
      )
      .join('');

    this.listEl.style.color = 'rgba(255,255,255,0.85)';
  }
}
