/**
 * Kill feed UI - shows recent kills in top-right corner.
 * Displays "Player1 [weapon] Player2" notifications that fade out.
 */
export class KillFeed {
  private container: HTMLDivElement;
  private readonly maxEntries = 5;
  private readonly entryDuration = 5000; // 5 seconds

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 320px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      z-index: 100;
      pointer-events: none;
      font-family: 'Courier New', monospace;
      font-size: 14px;
    `;

    document.body.appendChild(this.container);
  }

  /**
   * Add a kill entry to the feed.
   */
  addKill(killerName: string, victimName: string, weaponType: string): void {
    const entry = document.createElement('div');
    entry.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 12px;
      border-left: 3px solid #ff0000;
      color: #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.3s ease-out;
    `;

    // Format: "Killer [weapon] Victim"
    const weaponIcon = this.getWeaponIcon(weaponType);
    entry.innerHTML = `
      <span style="color: #ff4444">${this.escapeHtml(killerName)}</span>
      <span style="color: #888888; margin: 0 6px">${weaponIcon}</span>
      <span style="color: #ffffff">${this.escapeHtml(victimName)}</span>
    `;

    // Add to top of feed
    this.container.prepend(entry);

    // Remove excess entries
    while (this.container.children.length > this.maxEntries) {
      const oldestEntry = this.container.lastChild;
      if (oldestEntry) {
        this.container.removeChild(oldestEntry);
      }
    }

    // Fade out and remove after duration
    setTimeout(() => {
      entry.style.transition = 'opacity 0.5s';
      entry.style.opacity = '0';
      setTimeout(() => {
        if (entry.parentNode === this.container) {
          this.container.removeChild(entry);
        }
      }, 500);
    }, this.entryDuration);
  }

  /**
   * Get weapon label for display (tactical style: [RIFLE], [PISTOL], etc.).
   */
  private getWeaponIcon(weaponType: string): string {
    const labels: Record<string, string> = {
      pistol: '[PP7]',
      rifle: '[KF7]',
      shotgun: '[SHOTGUN]',
      sniper: '[SNIPER]',
    };
    return labels[weaponType] || '[—]';
  }

  /**
   * Escape HTML to prevent XSS.
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /**
   * Cleanup and remove from DOM.
   */
  dispose(): void {
    this.clear();
    document.body.removeChild(this.container);
  }
}

// Add CSS animation for slide-in effect
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);
