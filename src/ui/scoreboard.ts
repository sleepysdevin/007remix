/**
 * Scoreboard UI - Tab key in multiplayer.
 * Shows K/D ratio, player list, ping for all players.
 * Fallout/Westworld tactical style.
 */
export interface ScoreboardPlayer {
  id: string;
  username: string;
  kills: number;
  deaths: number;
  ping?: number;
  isLocalPlayer: boolean;
}

export class Scoreboard {
  private container: HTMLDivElement;
  private tableBody: HTMLTableSectionElement;
  private _visible = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'scoreboard';
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 480px;
      max-height: 70vh;
      background: linear-gradient(180deg, rgba(20, 22, 28, 0.98) 0%, rgba(12, 14, 18, 0.99) 100%);
      border: 2px solid #5a4a3a;
      box-shadow: 0 0 30px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(139, 119, 101, 0.2);
      color: #c4b896;
      font-family: 'Courier New', monospace;
      z-index: 200;
      display: none;
      flex-direction: column;
      pointer-events: auto;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid #5a4a3a;
      background: rgba(0, 0, 0, 0.3);
      font-size: 18px;
      letter-spacing: 4px;
      color: #d4af37;
    `;
    header.textContent = 'SCOREBOARD';
    this.container.appendChild(header);

    // Table
    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    `;
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr style="background: rgba(0,0,0,0.4); color: #8b7355;">
        <th style="text-align: left; padding: 10px 16px;">PLAYER</th>
        <th style="text-align: center; padding: 10px 16px;">K</th>
        <th style="text-align: center; padding: 10px 16px;">D</th>
        <th style="text-align: center; padding: 10px 16px;">K/D</th>
        <th style="text-align: center; padding: 10px 16px;">PING</th>
      </tr>
    `;
    table.appendChild(thead);

    this.tableBody = document.createElement('tbody');
    table.appendChild(this.tableBody);

    const tableWrapper = document.createElement('div');
    tableWrapper.style.cssText = `overflow-y: auto; max-height: 400px;`;
    tableWrapper.appendChild(table);
    this.container.appendChild(tableWrapper);

    // Footer hint
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 10px 20px;
      border-top: 1px solid #5a4a3a;
      font-size: 12px;
      color: #6a5a4a;
    `;
    footer.textContent = 'Hold TAB to view · Release to close';
    this.container.appendChild(footer);

    document.body.appendChild(this.container);
  }

  get visible(): boolean {
    return this._visible;
  }

  /**
   * Update scoreboard with current player data.
   */
  update(players: ScoreboardPlayer[]): void {
    // Sort by kills descending, then by deaths ascending
    const sorted = [...players].sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.deaths - b.deaths;
    });

    this.tableBody.innerHTML = '';

    for (const p of sorted) {
      const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(1) : p.kills.toString();
      const row = document.createElement('tr');
      row.style.cssText = p.isLocalPlayer
        ? `background: rgba(212, 175, 55, 0.15); border-left: 3px solid #d4af37;`
        : '';

      const nameCell = document.createElement('td');
      nameCell.style.padding = '10px 16px';
      nameCell.textContent = p.isLocalPlayer ? `${p.username} (you)` : p.username;
      row.appendChild(nameCell);

      const killsCell = document.createElement('td');
      killsCell.style.cssText = 'text-align: center; padding: 10px 16px; color: #8f8;';
      killsCell.textContent = String(p.kills);
      row.appendChild(killsCell);

      const deathsCell = document.createElement('td');
      deathsCell.style.cssText = 'text-align: center; padding: 10px 16px; color: #f88;';
      deathsCell.textContent = String(p.deaths);
      row.appendChild(deathsCell);

      const kdCell = document.createElement('td');
      kdCell.style.cssText = 'text-align: center; padding: 10px 16px;';
      kdCell.textContent = kd;
      row.appendChild(kdCell);

      const pingCell = document.createElement('td');
      pingCell.style.cssText = 'text-align: center; padding: 10px 16px; color: #8f8;';
      pingCell.textContent = p.ping !== undefined ? `${p.ping}ms` : '—';
      row.appendChild(pingCell);

      this.tableBody.appendChild(row);
    }
  }

  show(): void {
    this._visible = true;
    this.container.style.display = 'flex';
  }

  hide(): void {
    this._visible = false;
    this.container.style.display = 'none';
  }

  dispose(): void {
    document.body.removeChild(this.container);
  }
}
