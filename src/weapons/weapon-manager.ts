import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../core/input-manager';
import { EventBus } from '../core/event-bus';
import { FPSCamera } from '../player/fps-camera';
import { WeaponBase } from './weapon-base';
import { WeaponViewModel, type WeaponType } from './weapon-view-model';
import { ProjectileSystem } from './projectile-system';
import { Pistol } from './weapons/pistol';
import { Rifle } from './weapons/rifle';
import { Shotgun } from './weapons/shotgun';
import { Sniper } from './weapons/sniper';
import { playGunshot, playDryFire, playReload } from '../audio/sound-effects';

const WEAPON_TYPE_MAP: WeaponType[] = ['pistol', 'rifle', 'shotgun', 'sniper'];
const DEFAULT_FOV = 75;
const SCOPED_FOV = 25;

export class WeaponManager {
  private weapons: (WeaponBase | null)[] = [null, null, null, null];
  private currentIndex = 0;
  private viewModel: WeaponViewModel;
  private projectileSystem: ProjectileSystem;
  private fpsCamera: FPSCamera;
  private events: EventBus;
  private playerCollider: RAPIER.Collider;

  private wasMouseDown = false;
  private reloadSoundPlayed = false;
  private _scoped = false;
  private scopeFovTransition = DEFAULT_FOV;

  constructor(
    scene: THREE.Scene,
    fpsCamera: FPSCamera,
    projectileSystem: ProjectileSystem,
    events: EventBus,
    playerCollider: RAPIER.Collider,
  ) {
    this.fpsCamera = fpsCamera;
    this.projectileSystem = projectileSystem;
    this.events = events;
    this.playerCollider = playerCollider;

    this.viewModel = new WeaponViewModel();
    fpsCamera.camera.add(this.viewModel.group);

    // Start with pistol
    this.weapons[0] = new Pistol();
  }

  get currentWeapon(): WeaponBase {
    return this.weapons[this.currentIndex]!;
  }

  get scoped(): boolean {
    return this._scoped;
  }

  addWeapon(type: 'pistol' | 'rifle' | 'shotgun' | 'sniper'): boolean {
    const slotIndex = WEAPON_TYPE_MAP.indexOf(type);
    if (slotIndex === -1) return false;

    if (this.weapons[slotIndex]) {
      this.weapons[slotIndex]!.addAmmo(this.weapons[slotIndex]!.stats.maxAmmo);
      return false;
    }

    switch (type) {
      case 'pistol': this.weapons[slotIndex] = new Pistol(); break;
      case 'rifle': this.weapons[slotIndex] = new Rifle(); break;
      case 'shotgun': this.weapons[slotIndex] = new Shotgun(); break;
      case 'sniper': this.weapons[slotIndex] = new Sniper(); break;
    }
    return true;
  }

  addAmmo(type: 'pistol' | 'rifle' | 'shotgun' | 'sniper', amount: number): void {
    const slotIndex = WEAPON_TYPE_MAP.indexOf(type);
    if (slotIndex !== -1 && this.weapons[slotIndex]) {
      this.weapons[slotIndex]!.addAmmo(amount);
    }
  }

  private switchTo(index: number): void {
    if (index === this.currentIndex) return;
    if (!this.weapons[index]) return;

    this._scoped = false;
    this.viewModel.setScoped(false);
    this.currentIndex = index;
    this.viewModel.switchWeapon(WEAPON_TYPE_MAP[index]);
    this.events.emit('weapon:switched', { weaponName: this.currentWeapon.stats.name });
  }

  update(input: InputManager, dt: number): void {
    const now = performance.now() / 1000;
    const weapon = this.currentWeapon;

    // Weapon switching (number keys)
    for (let i = 0; i < 4; i++) {
      if (input.wasKeyJustPressed(String(i + 1)) && this.weapons[i]) {
        this.switchTo(i);
      }
    }

    // Scroll wheel switching
    if (input.scrollDelta !== 0) {
      let next = this.currentIndex;
      const dir = input.scrollDelta > 0 ? 1 : -1;
      for (let attempt = 0; attempt < 4; attempt++) {
        next = (next + dir + 4) % 4;
        if (this.weapons[next]) {
          this.switchTo(next);
          break;
        }
      }
    }

    // Scope (right-click, sniper only)
    const canScope = WEAPON_TYPE_MAP[this.currentIndex] === 'sniper';
    this._scoped = canScope && input.rightMouseDown;
    this.viewModel.setScoped(this._scoped);

    // Smooth FOV for scope
    const targetFov = this._scoped ? SCOPED_FOV : DEFAULT_FOV;
    this.scopeFovTransition += (targetFov - this.scopeFovTransition) * dt * 12;
    this.fpsCamera.camera.fov = this.scopeFovTransition;
    this.fpsCamera.camera.updateProjectionMatrix();

    // Reload
    if (input.isKeyDown('r')) {
      if (weapon.startReload(now)) {
        playReload();
        this.reloadSoundPlayed = true;
      }
    }
    const reloadFinished = weapon.updateReload(now);
    if (reloadFinished) {
      this.reloadSoundPlayed = false;
    }

    // Fire
    const mouseDown = input.mouseDown;
    const shouldFire = weapon.stats.automatic
      ? mouseDown
      : mouseDown && !this.wasMouseDown;

    if (shouldFire && input.pointerLocked) {
      if (weapon.canFire(now)) {
        weapon.fire(now);
        this.doFire();
      } else if (weapon.currentAmmo <= 0 && !weapon.reloading) {
        if (weapon.startReload(now)) {
          playReload();
        } else {
          playDryFire();
        }
      }
    }

    this.wasMouseDown = mouseDown;

    // View model
    this.viewModel.addSway(input.mouseMovementX, input.mouseMovementY);
    const isMoving =
      input.isKeyDown('w') || input.isKeyDown('a') ||
      input.isKeyDown('s') || input.isKeyDown('d');
    this.viewModel.update(dt, isMoving);
  }

  private doFire(): void {
    const origin = new THREE.Vector3();
    this.fpsCamera.camera.getWorldPosition(origin);
    const direction = new THREE.Vector3();
    this.fpsCamera.getLookDirection(direction);
    const weapon = this.currentWeapon;
    const spreadMult = this._scoped ? 0.1 : 1;

    for (let i = 0; i < weapon.stats.raysPerShot; i++) {
      let dir = direction;
      if (weapon.stats.raysPerShot > 1) {
        dir = direction.clone();
        const cone = weapon.stats.spreadCone;
        dir.x += (Math.random() - 0.5) * cone;
        dir.y += (Math.random() - 0.5) * cone;
        dir.z += (Math.random() - 0.5) * cone;
        dir.normalize();
      } else if (weapon.stats.spread > 0) {
        dir = direction.clone();
        dir.x += (Math.random() - 0.5) * weapon.stats.spread * spreadMult;
        dir.y += (Math.random() - 0.5) * weapon.stats.spread * spreadMult;
        dir.z += (Math.random() - 0.5) * weapon.stats.spread * spreadMult;
        dir.normalize();
      }
      this.projectileSystem.fireRay(origin, dir, weapon, this.playerCollider);
    }

    playGunshot();
    this.viewModel.triggerRecoil();
    this.events.emit('weapon:fired', {
      weaponName: weapon.stats.name,
      position: origin,
      direction,
    });
  }
}
