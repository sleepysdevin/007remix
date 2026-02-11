/**
 * Game over overlay - winner announcement.
 * Shown when a player reaches kill limit or match timer ends.
 */
export interface GameOverCallbacks {
  onExit: () => void;
}

export class GameOverOverlay {
  private container: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private subtitleEl: HTMLDivElement;
  private callbacks: GameOverCallbacks | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      font-family: 'Courier New', monospace;
      color: #d4af37;
    `;

    this.titleEl = document.createElement('div');
    this.titleEl.style.cssText = `
      font-size: 48px;
      font-weight: bold;
      letter-spacing: 8px;
      margin-bottom: 16px;
      text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
    `;
    this.container.appendChild(this.titleEl);

    this.subtitleEl = document.createElement('div');
    this.subtitleEl.style.cssText = `
      font-size: 20px;
      color: #8b7355;
      margin-bottom: 40px;
    `;
    this.container.appendChild(this.subtitleEl);

    const exitBtn = document.createElement('button');
    exitBtn.textContent = 'RETURN TO MENU';
    exitBtn.style.cssText = `
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
    exitBtn.addEventListener('click', () => this.callbacks?.onExit());
    exitBtn.addEventListener('mouseenter', () => {
      exitBtn.style.background = '#d4af37';
      exitBtn.style.color = '#000';
    });
    exitBtn.addEventListener('mouseleave', () => {
      exitBtn.style.background = 'transparent';
      exitBtn.style.color = '#d4af37';
    });
    this.container.appendChild(exitBtn);

    document.body.appendChild(this.container);
  }

  show(winnerUsername: string, reason: 'kills' | 'time', isLocalWinner: boolean): void {
    this.titleEl.textContent = isLocalWinner ? 'VICTORY' : 'DEFEAT';
    this.titleEl.style.color = isLocalWinner ? '#d4af37' : '#8b4545';
    this.subtitleEl.textContent =
      reason === 'kills'
        ? `${winnerUsername} wins the match!`
        : `Match over. ${winnerUsername} had the most kills.`;
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  setCallbacks(cb: GameOverCallbacks): void {
    this.callbacks = cb;
  }

  dispose(): void {
    document.body.removeChild(this.container);
  }
}
