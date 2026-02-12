import * as THREE from 'three';
import {
  generateMuzzleFlashTexture,
  MUZZLE_FLASH_FRAMES,
  getMuzzleFlashOffset,
} from './muzzle-flash-sprite';
import { getTextureForSkin } from './weapon-skins';
import type { WeaponSkin } from './weapon-skins';

export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

/**
 * Renders a first-person weapon model attached to the camera.
 * GoldenEye style: weapon offset to the right side of screen with sway and recoil.
 */
export class WeaponViewModel {
  readonly group: THREE.Group;
  private weaponMesh: THREE.Group;
  private readonly weaponMeshCache = new Map<string, THREE.Group>();
  private muzzleFlash: THREE.Mesh;
  private muzzleLight: THREE.PointLight;
  private flashTexture!: THREE.CanvasTexture;
  private flashTimer = 0;
  private currentType: WeaponType = 'pistol';
  private currentSkin: WeaponSkin = 'default';

  // Animation state
  private recoilOffset = 0;
  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;

  private restPosition = new THREE.Vector3(0.3, -0.28, -0.5);
  private readonly muzzleOffset = new THREE.Vector3(0, 0.04, -0.32); // per-weapon, at barrel tip

  // Scope
  private _scoped = false;
  private scopeTransition = 0;

  // Reload animation (tilts weapon down then back)
  private reloadAnimTime = 0;
  private reloadAnimDuration = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.renderOrder = 999;

    this.weaponMesh = this.getCachedWeaponMesh('pistol', 'default');
    this.weaponMesh.position.copy(this.restPosition);
    this.group.add(this.weaponMesh);
    this.prewarmDefaultWeaponMeshes();

    // Muzzle flash — procedural sprite atlas with additive blending
    const flashTex = generateMuzzleFlashTexture();
    this.flashTexture = flashTex.clone();
    this.flashTexture.needsUpdate = true;
    this.flashTexture.repeat.set(1 / MUZZLE_FLASH_FRAMES, 1);

    const flashGeo = new THREE.PlaneGeometry(0.2, 0.2);
    const flashMat = new THREE.MeshBasicMaterial({
      map: this.flashTexture,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 8);
    this.muzzleLight.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleLight);
  }

  get scoped(): boolean {
    return this._scoped;
  }

  switchWeapon(type: WeaponType, skin: WeaponSkin = 'default'): void {
    this.currentType = type;
    this.currentSkin = skin;
    this._scoped = false;
    this.scopeTransition = 0;

    this.group.remove(this.weaponMesh);
    this.weaponMesh = this.getCachedWeaponMesh(type, skin);
    this.group.add(this.weaponMesh);

    // Per-weapon rest position and muzzle offset (at barrel tip — flash at muzzle opening)
    if (type === 'rifle') {
      this.restPosition.set(0.28, -0.3, -0.5);
      this.muzzleOffset.set(0, 0.03, -0.54);
    } else if (type === 'shotgun') {
      this.restPosition.set(0.25, -0.32, -0.45);
      this.muzzleOffset.set(0, 0.03, -0.46);
    } else if (type === 'sniper') {
      this.restPosition.set(0.3, -0.3, -0.55);
      this.muzzleOffset.set(0, 0.03, -0.55);
    } else {
      this.restPosition.set(0.3, -0.28, -0.5);
      this.muzzleOffset.set(0, 0.04, -0.32);
    }
    
    // Re-attach flash/light (AFTER muzzleOffset is updated)
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleFlash);
    this.muzzleLight.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleLight);
    
    this.weaponMesh.position.copy(this.restPosition);
  }

  /** Refresh current weapon mesh with a new skin (same type). */
  setSkin(skin: WeaponSkin): void {
    this.currentSkin = skin;
    this.group.remove(this.weaponMesh);
    this.weaponMesh = this.getCachedWeaponMesh(this.currentType, skin);
    this.group.add(this.weaponMesh);
    this.weaponMesh.position.copy(this.restPosition);
    // Apply current muzzle offset before attaching
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleFlash);
    this.muzzleLight.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleLight);
  }

  setScoped(scoped: boolean): void {
    this._scoped = scoped;
  }

  triggerRecoil(): void {
    const strength = this.currentType === 'shotgun' ? 1.6
      : this.currentType === 'sniper' ? 1.4
      : this.currentType === 'rifle' ? 0.6
      : 1.0;
    this.recoilOffset = strength;
    this.flashTimer = 0.05;
  }

  /** Start the reload animation (weapon tilts down then back over duration seconds). */
  startReloadAnimation(duration: number): void {
    this.reloadAnimDuration = duration;
    this.reloadAnimTime = 0;
  }

  update(dt: number, isMoving: boolean, isSprinting = false): void {
    // Scope transition
    const targetScope = this._scoped ? 1 : 0;
    this.scopeTransition += (targetScope - this.scopeTransition) * dt * 10;

    // Recoil
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 8);
    const recoilZ = this.recoilOffset * 0.06;
    const recoilY = this.recoilOffset * 0.03;

    // Bob (stronger when sprinting)
    if (isMoving) {
      this.bobPhase += dt * (isSprinting ? 14 : 10);
    } else {
      this.bobPhase += dt * 2;
    }
    const bobAmount = isSprinting ? 0.022 : isMoving ? 0.012 : 0.003;
    const bobX = Math.sin(this.bobPhase) * bobAmount;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * bobAmount * 0.7;

    // Sway
    this.swayX += (0 - this.swayX) * dt * 3;
    this.swayY += (0 - this.swayY) * dt * 3;

    // Scoped: weapon moves to center
    const scopedPos = new THREE.Vector3(0, -0.15, -0.3);
    const hipX = this.restPosition.x + bobX + this.swayX;
    const hipY = this.restPosition.y + bobY + recoilY + this.swayY;
    const hipZ = this.restPosition.z + recoilZ;

    let finalX = THREE.MathUtils.lerp(hipX, scopedPos.x, this.scopeTransition);
    let finalY = THREE.MathUtils.lerp(hipY, scopedPos.y + recoilY, this.scopeTransition);
    let finalZ = THREE.MathUtils.lerp(hipZ, scopedPos.z + recoilZ, this.scopeTransition);

    // Reload animation: weapon tilt + magazine out/in or shells one-by-one
    let reloadTilt = 0;
    const isShotgun = this.currentType === 'shotgun';
    const isMagFed = this.currentType === 'pistol' || this.currentType === 'rifle' || this.currentType === 'sniper';
    if (this.reloadAnimTime < this.reloadAnimDuration) {
      this.reloadAnimTime += dt;
      const t = Math.min(1, this.reloadAnimTime / this.reloadAnimDuration);
      if (t < 0.2) {
        reloadTilt = t / 0.2;
      } else if (t < 0.7) {
        reloadTilt = 1;
      } else {
        reloadTilt = (1 - t) / 0.3;
      }
      finalY += reloadTilt * -0.06;
      finalZ += reloadTilt * 0.03;

      if (isMagFed) {
        const mag = this.weaponMesh.getObjectByName('reloadMag') as (THREE.Mesh & { userData: { restY: number } }) | undefined;
        if (mag?.userData?.restY != null) {
          const restY = mag.userData.restY as number;
          let magOut = 0;
          if (t < 0.25) {
            magOut = t / 0.25;
          } else if (t < 0.48) {
            magOut = 1;
          } else if (t < 0.72) {
            magOut = 1 - (t - 0.48) / 0.24;
          }
          mag.position.y = restY + magOut * -0.12;
        }
      }

      if (isShotgun) {
        const loadX = -0.055, loadY = -0.045, loadZ = -0.08;
        for (let i = 1; i <= 5; i++) {
          const shell = this.weaponMesh.getObjectByName(`reloadShell${i}`) as (THREE.Mesh & { userData: { restZ: number } }) | undefined;
          if (shell?.userData?.restZ == null) continue;
          const restZ = (shell as THREE.Mesh & { userData: { restZ: number } }).userData.restZ;
          const t0 = 0.05 + (i - 1) * 0.18;
          const t1 = t0 + 0.18;
          let u = 0;
          if (t >= t1) u = 1;
          else if (t > t0) u = (t - t0) / (t1 - t0);
          shell.position.x = THREE.MathUtils.lerp(loadX, 0, u);
          shell.position.y = THREE.MathUtils.lerp(loadY, -0.01, u);
          shell.position.z = THREE.MathUtils.lerp(loadZ, restZ, u);
        }
      }
    } else if (isMagFed) {
      const mag = this.weaponMesh.getObjectByName('reloadMag') as (THREE.Mesh & { userData: { restY: number } }) | undefined;
      if (mag?.userData?.restY != null) {
        mag.position.y = mag.userData.restY as number;
      }
    }
    this.weaponMesh.position.set(finalX, finalY, finalZ);
    this.weaponMesh.rotation.x = reloadTilt * 0.4;
    this.weaponMesh.rotation.z = reloadTilt * 0.12;

    // Hide weapon when fully scoped
    this.weaponMesh.visible = this.scopeTransition < 0.9;

    // Muzzle flash — cycle through sprite atlas frames
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const t = Math.max(0, this.flashTimer / 0.05);
      const frameIndex = Math.min(
        Math.floor((1 - t) * MUZZLE_FLASH_FRAMES),
        MUZZLE_FLASH_FRAMES - 1,
      );
      const offset = getMuzzleFlashOffset(frameIndex);
      this.flashTexture.offset.set(offset.x, offset.y);
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = t;
      this.muzzleLight.intensity = t * 30;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    } else {
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
      this.muzzleLight.intensity = 0;
    }
  }

  addSway(dx: number, dy: number): void {
    this.swayX -= dx * 0.0003;
    this.swayY += dy * 0.0003;
  }

  /** Build a weapon mesh for preview rendering (inventory thumbnails). Same mesh as in-world. */
  buildWeaponMeshForPreview(type: WeaponType, skin: WeaponSkin): THREE.Group {
    return this.getCachedWeaponMesh(type, skin);
  }

  // ─── Weapon mesh builders ───

  private getCacheKey(type: WeaponType, skin: WeaponSkin): string {
    return `${type}:${skin}`;
  }

  private getCachedWeaponMesh(type: WeaponType, skin: WeaponSkin): THREE.Group {
    const key = this.getCacheKey(type, skin);
    let cached = this.weaponMeshCache.get(key);
    if (!cached) {
      cached = this.buildWeaponMesh(type, skin);
      this.weaponMeshCache.set(key, cached);
    }
    return cached.clone(true);
  }

  private prewarmDefaultWeaponMeshes(): void {
    // Prebuild defaults so first pickup/switch doesn't stall rendering.
    this.getCachedWeaponMesh('rifle', 'default');
    this.getCachedWeaponMesh('shotgun', 'default');
    this.getCachedWeaponMesh('sniper', 'default');
  }

  private buildWeaponMesh(type: WeaponType, skin: WeaponSkin): THREE.Group {
    switch (type) {
      case 'rifle': return this.buildRifleMesh(skin);
      case 'shotgun': return this.buildShotgunMesh(skin);
      case 'sniper': return this.buildSniperMesh(skin);
      default: return this.buildPistolMesh(skin);
    }
  }

  private buildPistolMesh(skin: WeaponSkin): THREE.Group {
    const gun = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'metal'),
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.8,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'grip'),
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.2,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.5,
      metalness: 0.6,
    });
    // Body scaled up ~15% for chunkier GoldenEye feel
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.046, 0.25), bodyMat);
    body.position.set(0, 0.04, -0.03); gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, -0.2); gun.add(barrel);
    // Barrel bushing ring at muzzle
    const barrelRing = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 8), bodyMat);
    barrelRing.rotation.x = Math.PI / 2; barrelRing.position.set(0, 0.04, -0.245); gun.add(barrelRing);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.034, 0.18), bodyMat);
    slide.position.set(0, 0.01, 0); gun.add(slide);
    // Slide serrations — rear of slide (4 raised ridges)
    for (let i = 0; i < 4; i++) {
      const serr = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.003, 0.005), accentMat);
      serr.position.set(0, 0.028, -0.09 - i * 0.012); gun.add(serr);
    }
    // Ejection port — dark recessed rectangle on right side
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.015, 0.03), accentMat);
    ejectionPort.position.set(0.024, 0.04, -0.04); gun.add(ejectionPort);
    // Trigger guard — 3 thin boxes forming a loop under the body
    const triggerGuardBack = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), bodyMat);
    triggerGuardBack.position.set(0, -0.02, 0.06); gun.add(triggerGuardBack);
    const triggerGuardLeft = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), bodyMat);
    triggerGuardLeft.position.set(-0.018, -0.035, 0.04); gun.add(triggerGuardLeft);
    const triggerGuardRight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), bodyMat);
    triggerGuardRight.position.set(0.018, -0.035, 0.04); gun.add(triggerGuardRight);
    // Trigger
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.006), accentMat);
    trigger.position.set(0, -0.015, 0.02); gun.add(trigger);
    // Front sight post
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.015, 0.015), bodyMat);
    frontSight.position.set(0, 0.05, -0.2); gun.add(frontSight);
    // Rear sight notch — two small boxes
    const rearSightL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.01), bodyMat);
    rearSightL.position.set(-0.012, 0.04, 0.06); gun.add(rearSightL);
    const rearSightR = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.01), bodyMat);
    rearSightR.position.set(0.012, 0.04, 0.06); gun.add(rearSightR);
    // Hammer
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.015, 0.02), bodyMat);
    hammer.position.set(0, 0.025, -0.11); gun.add(hammer);
    // Slide stop lever (small rectangle on left side)
    const slideStop = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.02), accentMat);
    slideStop.position.set(-0.025, 0.02, -0.02); gun.add(slideStop);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.045), gripMat);
    grip.position.set(0, -0.05, 0.04); grip.rotation.x = 0.15; gun.add(grip);
    // Grip screws (tiny dots on each side)
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.3, metalness: 0.9 });
    const screwGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.004, 6);
    const screwL = new THREE.Mesh(screwGeo, screwMat);
    screwL.rotation.z = Math.PI / 2; screwL.position.set(-0.022, -0.05, 0.04); gun.add(screwL);
    const screwR = new THREE.Mesh(screwGeo, screwMat);
    screwR.rotation.z = Math.PI / 2; screwR.position.set(0.022, -0.05, 0.04); gun.add(screwR);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.065, 0.032), bodyMat);
    mag.position.set(0, -0.065, 0.05);
    mag.name = 'reloadMag';
    (mag.userData as Record<string, number>).restY = -0.065;
    gun.add(mag);
    return gun;
  }

  private buildRifleMesh(skin: WeaponSkin): THREE.Group {
    const gun = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'metalMid'),
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.7,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'wood'),
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.1,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.5,
      metalness: 0.6,
    });
    // Receiver scaled up for bolder look
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.32), bodyMat);
    receiver.position.set(0, 0.02, -0.05); gun.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.2, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.32); gun.add(barrel);
    // Muzzle ring
    const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 8), bodyMat);
    muzzleRing.rotation.x = Math.PI / 2; muzzleRing.position.set(0, 0.03, -0.42); gun.add(muzzleRing);
    // Handguard — box around barrel area with ventilation slots
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.15), bodyMat);
    handguard.position.set(0, 0.03, -0.25); gun.add(handguard);
    // Ventilation slots on handguard (3 dark grooves)
    for (let i = 0; i < 3; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.004, 0.018), accentMat);
      slot.position.set(0, 0.048, -0.21 - i * 0.035); gun.add(slot);
    }
    // Ejection port on right side
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.035), accentMat);
    ejectionPort.position.set(0.027, 0.025, -0.08); gun.add(ejectionPort);
    // Front sight post with protective ears
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), bodyMat);
    frontSight.position.set(0, 0.045, -0.4); gun.add(frontSight);
    const frontSightEarL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.012), bodyMat);
    frontSightEarL.position.set(-0.008, 0.042, -0.4); gun.add(frontSightEarL);
    const frontSightEarR = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.012), bodyMat);
    frontSightEarR.position.set(0.008, 0.042, -0.4); gun.add(frontSightEarR);
    // Rear sight notch
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.015), bodyMat);
    rearSight.position.set(0, 0.045, -0.2); gun.add(rearSight);
    // Charging handle — small box on top-right of receiver
    const chargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.04), bodyMat);
    chargingHandle.position.set(0.03, 0.045, -0.08); gun.add(chargingHandle);
    // Trigger guard
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 0.06), bodyMat);
    triggerGuard.position.set(0, -0.045, 0.02); gun.add(triggerGuard);
    // Trigger
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.006), accentMat);
    trigger.position.set(0, -0.032, 0.01); gun.add(trigger);
    // Receiver pins (2 small circles on left side)
    const pinGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.004, 6);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.9 });
    const pin1 = new THREE.Mesh(pinGeo, pinMat);
    pin1.rotation.z = Math.PI / 2; pin1.position.set(-0.027, 0.02, -0.03); gun.add(pin1);
    const pin2 = new THREE.Mesh(pinGeo, pinMat);
    pin2.rotation.z = Math.PI / 2; pin2.position.set(-0.027, 0.02, 0.06); gun.add(pin2);
    // Stock butt plate
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.02), bodyMat);
    buttPlate.position.set(0, -0.01, 0.26); gun.add(buttPlate);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.085, 0.042), bodyMat);
    mag.position.set(0, -0.045, -0.02);
    mag.name = 'reloadMag';
    (mag.userData as Record<string, number>).restY = -0.045;
    gun.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.055, 0.14), woodMat);
    stock.position.set(0, -0.01, 0.15); gun.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.075, 0.038), woodMat);
    grip.position.set(0, -0.045, 0.05); grip.rotation.x = 0.2; gun.add(grip);
    return gun;
  }

  private buildShotgunMesh(skin: WeaponSkin): THREE.Group {
    const gun = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'metal'),
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.8,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'woodMid'),
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.1,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.5,
      metalness: 0.6,
    });
    // Barrel chunkier: r 0.024
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.4, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.2); gun.add(barrel);
    // Muzzle ring — thicker ring at barrel tip
    const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.01, 8), bodyMat);
    muzzleRing.rotation.x = Math.PI / 2; muzzleRing.position.set(0, 0.03, -0.4); gun.add(muzzleRing);
    // Magazine tube — visible tube under barrel (GoldenEye style)
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), bodyMat);
    magTube.rotation.x = Math.PI / 2; magTube.position.set(0, -0.02, -0.15); gun.add(magTube);
    // Tube cap
    const tubeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 8), bodyMat);
    tubeCap.rotation.x = Math.PI / 2; tubeCap.position.set(0, -0.02, -0.31); gun.add(tubeCap);
    // Barrel clamp connecting barrel to mag tube
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.012), bodyMat);
    clamp.position.set(0, 0.005, -0.28); gun.add(clamp);
    // Front bead sight
    const beadSight = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), bodyMat);
    beadSight.position.set(0, 0.04, -0.38); gun.add(beadSight);
    // Trigger guard
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.07), bodyMat);
    triggerGuard.position.set(0, -0.045, 0.08); gun.add(triggerGuard);
    // Trigger
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.006), accentMat);
    trigger.position.set(0, -0.03, 0.065); gun.add(trigger);
    // Pump with grip grooves
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.1), woodMat);
    pump.position.set(0, 0.0, -0.15); gun.add(pump);
    // Pump grooves (ridges for grip)
    for (let i = 0; i < 5; i++) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.002, 0.008), accentMat);
      groove.position.set(0, 0.021, -0.17 + i * 0.02); gun.add(groove);
    }
    // Ejection port on right side of receiver
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.025, 0.04), accentMat);
    ejectionPort.position.set(0.03, 0.015, 0.04); gun.add(ejectionPort);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.15), bodyMat);
    receiver.position.set(0, 0.01, 0.05); gun.add(receiver);
    // Safety button (small dot on top of receiver)
    const safety = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 6), accentMat);
    safety.position.set(0, 0.045, 0.09); gun.add(safety);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.058, 0.18), woodMat);
    stock.position.set(0, -0.005, 0.2); gun.add(stock);
    // Rubber butt pad
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.06, 0.008), accentMat);
    buttPad.position.set(0, -0.005, 0.292); gun.add(buttPad);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.075, 0.038), woodMat);
    grip.position.set(0, -0.045, 0.08); grip.rotation.x = 0.15; gun.add(grip);
    const shellMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'metal'),
      color: 0xcc8833,
      roughness: 0.6,
      metalness: 0.3,
    });
    const shellTubeZ = [-0.22, -0.18, -0.14, -0.10, -0.06];
    for (let i = 0; i < 5; i++) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), shellMat);
      shell.rotation.x = Math.PI / 2;
      shell.position.set(0, -0.01, shellTubeZ[i]);
      shell.name = `reloadShell${i + 1}`;
      (shell.userData as Record<string, number>).restZ = shellTubeZ[i];
      gun.add(shell);
    }
    return gun;
  }

  private buildSniperMesh(skin: WeaponSkin): THREE.Group {
    const gun = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'metal'),
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.8,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'woodDark'),
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.1,
    });
    const scopeMat = new THREE.MeshStandardMaterial({
      map: getTextureForSkin(skin, 'scope'),
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.9,
    });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.45, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.25); gun.add(barrel);
    // Muzzle brake — wider cylinder at barrel tip
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.04, 8), bodyMat);
    muzzleBrake.rotation.x = Math.PI / 2; muzzleBrake.position.set(0, 0.03, -0.48); gun.add(muzzleBrake);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.052, 0.2), bodyMat);
    receiver.position.set(0, 0.02, 0); gun.add(receiver);
    // Scope with rings — two thin cylinders connecting scope to receiver
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), scopeMat);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.07, -0.02); gun.add(scope);
    const scopeRingFront = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.015, 8), bodyMat);
    scopeRingFront.rotation.x = Math.PI / 2; scopeRingFront.position.set(0, 0.07, -0.06); gun.add(scopeRingFront);
    const scopeRingRear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.015, 8), bodyMat);
    scopeRingRear.rotation.x = Math.PI / 2; scopeRingRear.position.set(0, 0.07, 0.02); gun.add(scopeRingRear);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.058, 0.2), woodMat);
    stock.position.set(0, 0, 0.2); gun.add(stock);
    // Cheek rest — small box on stock
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.08), woodMat);
    cheekRest.position.set(0, 0.035, 0.15); gun.add(cheekRest);
    // Trigger guard
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.032, 0.055), bodyMat);
    triggerGuard.position.set(0, -0.042, 0.04); gun.add(triggerGuard);
    // Bolt handle knob
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), bodyMat);
    boltKnob.position.set(0.03, 0.035, 0.02); gun.add(boltKnob);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.025, 6), bodyMat);
    bolt.position.set(0.025, 0.03, 0.02); gun.add(bolt);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.075, 0.036), bodyMat);
    mag.position.set(0, -0.038, -0.02);
    mag.name = 'reloadMag';
    (mag.userData as Record<string, number>).restY = -0.038;
    gun.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.075, 0.038), woodMat);
    grip.position.set(0, -0.045, 0.06); grip.rotation.x = 0.15; gun.add(grip);
    return gun;
  }
}
