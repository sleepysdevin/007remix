/**
 * Mission complete overlay — shown when the player reaches the extraction point
 * after completing all objectives. GoldenEye style gold text on dark background.
 */
export class MissionCompleteScreen {
  private container: HTMLElement;
  onExit: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'mission-complete-screen';
    this.container.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0);
      color: #d4af37;
      font-family: 'Courier New', monospace;
      z-index: 20;
      padding: 40px;
      box-sizing: border-box;
      transition: background 1.5s ease-in;
    `;
    document.body.appendChild(this.container);
  }

  show(levelName: string, timeElapsed?: number): void {
    this.container.innerHTML = '';
    this.container.style.display = 'flex';
    // Fade to dark background
    requestAnimationFrame(() => {
      this.container.style.background = 'rgba(0, 0, 0, 0.92)';
    });

    // "MISSION COMPLETE" heading — fades in
    const heading = document.createElement('h1');
    heading.textContent = 'MISSION COMPLETE';
    heading.style.cssText = `
      font-size: 48px;
      letter-spacing: 8px;
      color: #e8c547;
      margin-bottom: 16px;
      opacity: 0;
      transform: translateY(-20px);
      transition: opacity 1s ease-out 0.5s, transform 1s ease-out 0.5s;
    `;
    this.container.appendChild(heading);

    // Level name
    const subtitle = document.createElement('div');
    subtitle.textContent = levelName.toUpperCase();
    subtitle.style.cssText = `
      font-size: 18px;
      letter-spacing: 4px;
      color: #b8a060;
      margin-bottom: 40px;
      opacity: 0;
      transition: opacity 1s ease-out 1s;
    `;
    this.container.appendChild(subtitle);

    // Divider line
    const divider = document.createElement('div');
    divider.style.cssText = `
      width: 200px;
      height: 2px;
      background: linear-gradient(90deg, transparent, #d4af37, transparent);
      margin-bottom: 32px;
      opacity: 0;
      transition: opacity 1s ease-out 1.2s;
    `;
    this.container.appendChild(divider);

    // Time (if provided)
    if (timeElapsed != null) {
      const mins = Math.floor(timeElapsed / 60);
      const secs = Math.floor(timeElapsed % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const timeEl = document.createElement('div');
      timeEl.textContent = `TIME: ${timeStr}`;
      timeEl.style.cssText = `
        font-size: 16px;
        letter-spacing: 3px;
        color: #a09050;
        margin-bottom: 12px;
        opacity: 0;
        transition: opacity 1s ease-out 1.4s;
      `;
      this.container.appendChild(timeEl);
    }

    // Status
    const status = document.createElement('div');
    status.textContent = 'ALL OBJECTIVES COMPLETED';
    status.style.cssText = `
      font-size: 14px;
      letter-spacing: 3px;
      color: #66aa44;
      margin-bottom: 48px;
      opacity: 0;
      transition: opacity 1s ease-out 1.6s;
    `;
    this.container.appendChild(status);

    // Exit button
    const btn = document.createElement('button');
    btn.textContent = 'EXIT MISSION';
    btn.style.cssText = `
      padding: 14px 48px;
      font-size: 18px;
      font-family: 'Courier New', monospace;
      letter-spacing: 4px;
      background: transparent;
      color: #d4af37;
      border: 2px solid #d4af37;
      cursor: pointer;
      transition: background 0.2s, color 0.2s, opacity 1s ease-out 2s;
      opacity: 0;
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
      this.onExit?.();
    });
    this.container.appendChild(btn);

    // Trigger CSS transitions after a frame
    requestAnimationFrame(() => {
      heading.style.opacity = '1';
      heading.style.transform = 'translateY(0)';
      subtitle.style.opacity = '1';
      divider.style.opacity = '1';
      status.style.opacity = '1';
      btn.style.opacity = '1';
      // Time element if present
      const timeEl = this.container.querySelector('div:nth-child(5)');
      if (timeEl instanceof HTMLElement && timeElapsed != null) {
        timeEl.style.opacity = '1';
      }
    });
  }

  hide(): void {
    this.container.style.display = 'none';
    this.container.style.background = 'rgba(0, 0, 0, 0)';
  }
}
