/**
 * Pause menu overlay — Escape to toggle.
 * Resume or exit back to the start screen.
 */

import { SettingsMenu } from './settings-menu';

export class PauseMenu {
  private overlay: HTMLDivElement;
  private settingsMenu: SettingsMenu;
  private _isOpen = false;

  /** Fires when user clicks Resume */
  onResume: (() => void) | null = null;
  /** Fires when user clicks Exit to Menu */
  onExit: (() => void) | null = null;

  constructor() {
    this.settingsMenu = new SettingsMenu();
    this.settingsMenu.onBack = () => this.overlay.style.display = 'flex';

    this.overlay = document.createElement('div');
    this.overlay.id = 'pause-menu';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.82);
      z-index: 50;
      font-family: 'Courier New', monospace;
      color: #d4af37;
    `;

    const title = document.createElement('h2');
    title.textContent = 'PAUSED';
    title.style.cssText = `
      font-size: 42px;
      letter-spacing: 8px;
      margin-bottom: 24px;
      color: #d4af37;
      text-shadow: 0 0 12px rgba(212, 175, 55, 0.3);
    `;
    this.overlay.appendChild(title);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
    `;

    const resumeBtn = this.createButton('RESUME');
    resumeBtn.addEventListener('click', () => {
      this.hide();
      this.onResume?.();
    });
    btnContainer.appendChild(resumeBtn);

    const settingsBtn = this.createButton('SETTINGS');
    settingsBtn.addEventListener('click', () => {
      this.overlay.style.display = 'none';
      this.settingsMenu.show();
    });
    btnContainer.appendChild(settingsBtn);

    const exitBtn = this.createButton('EXIT TO MENU');
    exitBtn.addEventListener('click', () => {
      this.hide();
      this.onExit?.();
    });
    btnContainer.appendChild(exitBtn);

    this.overlay.appendChild(btnContainer);

    // Click anywhere on overlay (except buttons) to resume
    this.overlay.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('button')) {
        this.hide();
        this.onResume?.();
      }
    });

    // Hint at bottom
    const hint = document.createElement('div');
    hint.textContent = 'Click or press Escape to resume';
    hint.style.cssText = `
      position: absolute;
      bottom: 30px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.35);
      letter-spacing: 2px;
    `;
    this.overlay.appendChild(hint);

    document.body.appendChild(this.overlay);
  }

  private createButton(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 12px 36px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      letter-spacing: 3px;
      background: transparent;
      color: #d4af37;
      border: 2px solid #d4af37;
      cursor: pointer;
      min-width: 240px;
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
    return btn;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  show(): void {
    this._isOpen = true;
    this.overlay.style.display = 'flex';
  }

  hide(): void {
    this._isOpen = false;
    this.overlay.style.display = 'none';
  }

  dispose(): void {
    this.overlay.remove();
  }
}
