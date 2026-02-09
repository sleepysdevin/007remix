import { WeaponBase } from '../weapon-base';

export class Shotgun extends WeaponBase {
  constructor() {
    super({
      name: 'Shotgun',
      damage: 12,
      fireRate: 1.2,         // Pump action, slow
      maxAmmo: 5,
      reserveAmmo: 20,
      reloadTime: 2.2,
      spread: 0.01,          // Per-pellet base spread (cone handles the rest)
      range: 20,             // Short range
      automatic: false,
      raysPerShot: 8,        // 8 pellets
      spreadCone: 0.12,      // Wide cone
    });
  }
}
