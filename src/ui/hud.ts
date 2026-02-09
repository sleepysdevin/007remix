import { WeaponBase } from '../weapons/weapon-base';

export class HUD {
  private healthEl: HTMLElement;
  private ammoEl: HTMLElement;
  private crosshairEl: HTMLElement;
  private hudEl: HTMLElement;
  private armorEl: HTMLElement;
  private grenadeEl: HTMLElement;

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
  }

  show(): void {
    this.hudEl.style.display = 'block';
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
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 16px;
      font-family: 'Courier New', monospace;
      color: #ffdd44;
      text-shadow: 0 0 4px rgba(0,0,0,0.8);
      pointer-events: none;
      transition: opacity 0.5s, transform 0.5s;
    `;
    el.textContent = text;
    this.hudEl.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 1000);
    setTimeout(() => el.remove(), 1500);
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
