import { WeaponBase } from '../weapon-base';

export class Rifle extends WeaponBase {
  constructor() {
    super({
      name: 'KF7 Soviet',
      damage: 15,
      fireRate: 8,           // Full auto, 8 rounds/sec
      maxAmmo: 30,
      reserveAmmo: 90,
      reloadTime: 1.8,
      spread: 0.03,          // Moderate spread
      range: 50,
      automatic: true,
      raysPerShot: 1,
      spreadCone: 0,
    });
  }
}
