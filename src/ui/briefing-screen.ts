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
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(20,15,25,0.95) 100%);
      color: #d4af37;
      font-family: 'Courier New', monospace;
      z-index: 15;
      padding: 40px;
      box-sizing: border-box;
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

  hide(): void {
    this.container.style.display = 'none';
  }

  setOnStart(callback: () => void): void {
    this.onStart = callback;
  }
}
