export interface WeaponStats {
  name: string;
  damage: number;
  fireRate: number;       // Shots per second
  maxAmmo: number;        // Max ammo in magazine
  reserveAmmo: number;    // Starting reserve
  reloadTime: number;     // Seconds to reload
  spread: number;         // Accuracy spread in radians (0 = perfect)
  range: number;          // Max raycast distance
  automatic: boolean;     // Hold to fire continuously?
  raysPerShot: number;    // 1 for pistol/rifle, 8 for shotgun
  spreadCone: number;     // Cone angle for multi-ray weapons (shotgun)
}

export abstract class WeaponBase {
  readonly stats: WeaponStats;
  currentAmmo: number;
  reserveAmmo: number;
  private lastFireTime = 0;
  private _reloading = false;
  private reloadStartTime = 0;

  constructor(stats: WeaponStats) {
    this.stats = stats;
    this.currentAmmo = stats.maxAmmo;
    this.reserveAmmo = stats.reserveAmmo;
  }

  get reloading(): boolean {
    return this._reloading;
  }

  canFire(now: number): boolean {
    if (this._reloading) return false;
    if (this.currentAmmo <= 0) return false;
    const interval = 1 / this.stats.fireRate;
    return now - this.lastFireTime >= interval;
  }

  fire(now: number): boolean {
    if (!this.canFire(now)) return false;
    this.currentAmmo--;
    this.lastFireTime = now;
    return true;
  }

  startReload(now: number): boolean {
    if (this._reloading) return false;
    if (this.currentAmmo >= this.stats.maxAmmo) return false;
    if (this.reserveAmmo <= 0) return false;
    this._reloading = true;
    this.reloadStartTime = now;
    return true;
  }

  updateReload(now: number): boolean {
    if (!this._reloading) return false;
    if (now - this.reloadStartTime >= this.stats.reloadTime) {
      const needed = this.stats.maxAmmo - this.currentAmmo;
      const available = Math.min(needed, this.reserveAmmo);
      this.currentAmmo += available;
      this.reserveAmmo -= available;
      this._reloading = false;
      return true; // Reload finished
    }
    return false;
  }

  addAmmo(amount: number): void {
    this.reserveAmmo = Math.min(
      this.reserveAmmo + amount,
      this.stats.maxAmmo * 5,
    );
  }
}
