import { WeaponBase } from '../weapon-base';

export class Sniper extends WeaponBase {
  constructor() {
    super({
      name: 'Sniper Rifle',
      damage: 80,
      fireRate: 0.8,         // Bolt action, very slow
      maxAmmo: 5,
      reserveAmmo: 15,
      reloadTime: 2.5,
      spread: 0.002,         // Extremely accurate
      range: 150,
      automatic: false,
      raysPerShot: 1,
      spreadCone: 0,
    });
  }
}
