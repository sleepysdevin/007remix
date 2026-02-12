/**
 * Character Models screen — opened from main menu. Drag-and-drop VRM/GLB for enemies, player, character.
 */

import { createCharacterModelsPanel } from './character-models-panel';

export class CharacterModelsScreen {
  private container: HTMLDivElement;

  /** Fires when user clicks Back */
  onBack: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'character-models-screen';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, rgba(10, 12, 16, 0.98) 0%, rgba(5, 6, 8, 0.99) 100%);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #c4b896;
      font-family: 'Courier New', monospace;
      z-index: 15;
      overflow-y: auto;
      padding: 24px;
    `;

    const title = document.createElement('h2');
    title.style.cssText = `
      font-size: 28px;
      letter-spacing: 6px;
      color: #d4af37;
      margin-bottom: 8px;
    `;
    title.textContent = 'CUSTOM MODELS';
    this.container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size: 14px; color: #6a5a4a; margin-bottom: 24px;';
    subtitle.textContent = 'Upload VRM/GLB for enemies, player, and character. Used in 2D and 3D modes.';
    this.container.appendChild(subtitle);

    const panelWrap = document.createElement('div');
    panelWrap.style.cssText = 'margin-bottom: 24px;';
    panelWrap.appendChild(createCharacterModelsPanel(() => {}));
    this.container.appendChild(panelWrap);

    const backBtn = document.createElement('button');
    backBtn.textContent = 'BACK';
    backBtn.style.cssText = `
      padding: 14px 32px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      letter-spacing: 3px;
      background: transparent;
      color: #d4af37;
      border: 2px solid #d4af37;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    `;
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.background = '#d4af37';
      backBtn.style.color = '#000';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.background = 'transparent';
      backBtn.style.color = '#d4af37';
    });
    backBtn.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.container.appendChild(backBtn);

    document.body.appendChild(this.container);
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    if (document.body.contains(this.container)) {
      document.body.removeChild(this.container);
    }
  }
}
