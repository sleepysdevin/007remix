import { WeaponBase } from '../weapon-base';

export class Pistol extends WeaponBase {
  constructor() {
    super({
      name: 'PP7',
      damage: 25,
      fireRate: 3,          // 3 shots/sec
      maxAmmo: 7,
      reserveAmmo: 42,
      reloadTime: 1.2,
      spread: 0.01,         // Very accurate
      range: 60,
      automatic: false,
      raysPerShot: 1,
      spreadCone: 0,
    });
  }
}
