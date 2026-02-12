import { WeaponBase } from '../weapons/weapon-base';

export class HUD {
  private healthEl: HTMLElement;
  private ammoEl: HTMLElement;
  private crosshairEl: HTMLElement;
  private hudEl: HTMLElement;
  private armorEl: HTMLElement;
  private grenadeEl: HTMLElement;
  private pingEl: HTMLElement;
  private killsEl: HTMLElement;
  private pickupNoticeEl: HTMLElement;
  private pickupHideTimer: number | null = null;

  private crosshairFlashTimer = 0;

  constructor() {
    this.hudEl = document.getElementById('hud')!;
    this.healthEl = document.getElementById('health-value')!;
    this.ammoEl = document.getElementById('ammo-display')!;
    this.crosshairEl = document.getElementById('crosshair')!;

    // Create armor display (next to health)
    this.armorEl = document.createElement('div');
    this.armorEl.id = 'armor-display';
    this.armorEl.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 120px;
      font-size: 18px;
      font-family: 'Courier New', monospace;
      color: #fff;
      pointer-events: none;
    `;
    this.hudEl.appendChild(this.armorEl);

    this.grenadeEl = document.createElement('div');
    this.grenadeEl.id = 'grenade-display';
    this.grenadeEl.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      margin-bottom: 48px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      color: #8f8;
      pointer-events: none;
    `;
    this.hudEl.appendChild(this.grenadeEl);

    // Ping display (top-right corner)
    this.pingEl = document.createElement('div');
    this.pingEl.id = 'ping-display';
    this.pingEl.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
      color: #8f8;
      pointer-events: none;
      visibility: hidden;
    `;
    this.hudEl.appendChild(this.pingEl);

    // Kills display (multiplayer only)
    this.killsEl = document.createElement('div');
    this.killsEl.id = 'kills-display';
    this.killsEl.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
      color: #8f8;
      pointer-events: none;
      visibility: hidden;
    `;
    this.hudEl.appendChild(this.killsEl);

    this.pickupNoticeEl = document.createElement('div');
    this.pickupNoticeEl.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 16px;
      font-family: 'Courier New', monospace;
      color: #ffdd44;
      text-shadow: 0 0 4px rgba(0,0,0,0.8);
      pointer-events: none;
      transition: opacity 0.18s ease-out, transform 0.18s ease-out;
      opacity: 0;
    `;
    this.hudEl.appendChild(this.pickupNoticeEl);
  }

  /** Update kills display (multiplayer). Pass null to hide. */
  updateKills(kills: number | null, killsToWin = 25): void {
    if (kills === null) {
      this.killsEl.style.visibility = 'hidden';
      return;
    }
    this.killsEl.style.visibility = 'visible';
    this.killsEl.textContent = `Kills: ${kills} / ${killsToWin}`;
  }

  show(): void {
    this.hudEl.style.display = 'block';
  }

  /** Update controls hint for multiplayer (Q = Scoreboard, I = Inventory). */
  setMultiplayerHint(enabled: boolean): void {
    const hint = document.getElementById('controls-hint');
    if (hint) {
      hint.textContent = enabled
        ? 'Q Scoreboard · I Inventory · Shift Sprint · C Crouch · N NV/Mask · V Flashlight'
        : 'Tab Inventory · Shift Sprint · C Crouch · N NV/Mask · V Flashlight';
    }
  }

  hide(): void {
    this.hudEl.style.display = 'none';
  }

  updateHealth(health: number): void {
    this.healthEl.textContent = String(Math.ceil(health));
    if (health <= 25) {
      this.healthEl.style.color = '#ff3333';
    } else if (health <= 50) {
      this.healthEl.style.color = '#ffaa33';
    } else {
      this.healthEl.style.color = '#fff';
    }
  }

  updateArmor(armor: number): void {
    if (armor > 0) {
      this.armorEl.innerHTML = `<span style="color: #66aaff;">&#9632;</span> <span>${Math.ceil(armor)}</span>`;
    } else {
      this.armorEl.innerHTML = '';
    }
  }

  updateGrenades(gasCount: number, fragCount: number): void {
    this.grenadeEl.textContent = `G [Gas]: ${gasCount}  ·  F [Frag]: ${fragCount}`;
    this.grenadeEl.style.visibility = gasCount >= 0 || fragCount >= 0 ? 'visible' : 'hidden';
  }

  updatePing(ping: number | null): void {
    if (ping === null || ping < 0) {
      this.pingEl.style.visibility = 'hidden';
      return;
    }

    this.pingEl.style.visibility = 'visible';
    this.pingEl.textContent = `PING: ${Math.round(ping)}ms`;

    // Color code based on connection quality
    if (ping < 50) {
      this.pingEl.style.color = '#8f8'; // Green - excellent
    } else if (ping < 100) {
      this.pingEl.style.color = '#ff8'; // Yellow - good
    } else if (ping < 200) {
      this.pingEl.style.color = '#fa8'; // Orange - fair
    } else {
      this.pingEl.style.color = '#f88'; // Red - poor
    }
  }

  updateWeapon(weapon: WeaponBase): void {
    const reloadText = weapon.reloading ? ' [RELOADING]' : '';
    this.ammoEl.innerHTML = `
      <div style="font-size: 14px; color: #aaa; margin-bottom: 4px;">${weapon.stats.name}</div>
      <div>
        <span style="font-size: 28px; font-weight: bold;">${weapon.currentAmmo}</span>
        <span style="color: #888;"> / ${weapon.reserveAmmo}</span>
        <span style="color: #ff6;">${reloadText}</span>
      </div>
    `;
  }

  flashCrosshair(): void {
    this.crosshairFlashTimer = 0.15;
    this.crosshairEl.style.color = 'rgba(255, 50, 50, 1)';
  }

  flashCrosshairFire(): void {
    if (this.crosshairFlashTimer <= 0) {
      this.crosshairFlashTimer = 0.06;
      this.crosshairEl.style.color = 'rgba(255, 255, 150, 1)';
    }
  }

  /** Show pickup notification briefly */
  showPickupNotification(text: string): void {
    if (this.pickupHideTimer !== null) {
      window.clearTimeout(this.pickupHideTimer);
      this.pickupHideTimer = null;
    }

    this.pickupNoticeEl.textContent = text;
    this.pickupNoticeEl.style.opacity = '1';
    this.pickupNoticeEl.style.transform = 'translateX(-50%) translateY(0)';

    this.pickupHideTimer = window.setTimeout(() => {
      this.pickupNoticeEl.style.opacity = '0';
      this.pickupNoticeEl.style.transform = 'translateX(-50%) translateY(-14px)';
      this.pickupHideTimer = null;
    }, 650);
  }

  update(dt: number): void {
    if (this.crosshairFlashTimer > 0) {
      this.crosshairFlashTimer -= dt;
      if (this.crosshairFlashTimer <= 0) {
        this.crosshairEl.style.color = 'rgba(255, 255, 255, 0.8)';
      }
    }
  }
}
