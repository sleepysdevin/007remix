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
  private readonly muzzleOffset = new THREE.Vector3(0, 0.05, -0.35);

  // Scope
  private _scoped = false;
  private scopeTransition = 0;

  // Reload animation (tilts weapon down then back)
  private reloadAnimTime = 0;
  private reloadAnimDuration = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.renderOrder = 999;

    this.weaponMesh = this.buildWeaponMesh('pistol', 'default');
    this.weaponMesh.position.copy(this.restPosition);
    this.group.add(this.weaponMesh);

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
    this.weaponMesh = this.buildWeaponMesh(type, skin);
    this.group.add(this.weaponMesh);

    // Re-attach flash/light
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleFlash);
    this.muzzleLight.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleLight);

    // Per-weapon rest position
    if (type === 'rifle') {
      this.restPosition.set(0.28, -0.3, -0.5);
    } else if (type === 'shotgun') {
      this.restPosition.set(0.25, -0.32, -0.45);
    } else if (type === 'sniper') {
      this.restPosition.set(0.3, -0.3, -0.55);
    } else {
      this.restPosition.set(0.3, -0.28, -0.5);
    }
    this.weaponMesh.position.copy(this.restPosition);
  }

  /** Refresh current weapon mesh with a new skin (same type). */
  setSkin(skin: WeaponSkin): void {
    this.currentSkin = skin;
    this.group.remove(this.weaponMesh);
    this.weaponMesh = this.buildWeaponMesh(this.currentType, skin);
    this.group.add(this.weaponMesh);
    this.weaponMesh.position.copy(this.restPosition);
    this.weaponMesh.add(this.muzzleFlash);
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
    return this.buildWeaponMesh(type, skin);
  }

  // ─── Weapon mesh builders ───

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
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), bodyMat);
    body.position.set(0, 0.04, -0.03); gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, -0.18); gun.add(barrel);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.16), bodyMat);
    slide.position.set(0, 0.01, 0); gun.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.04), gripMat);
    grip.position.set(0, -0.05, 0.04); grip.rotation.x = 0.15; gun.add(grip);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.03), bodyMat);
    mag.position.set(0, -0.06, 0.05);
    mag.name = 'reloadMag';
    (mag.userData as Record<string, number>).restY = -0.06;
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
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.3), bodyMat);
    receiver.position.set(0, 0.02, -0.05); gun.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.3); gun.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.04), bodyMat);
    mag.position.set(0, -0.04, -0.02);
    mag.name = 'reloadMag';
    (mag.userData as Record<string, number>).restY = -0.04;
    gun.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.15), woodMat);
    stock.position.set(0, -0.01, 0.15); gun.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.035), woodMat);
    grip.position.set(0, -0.04, 0.05); grip.rotation.x = 0.2; gun.add(grip);
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
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.2); gun.add(barrel);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.1), woodMat);
    pump.position.set(0, 0.0, -0.15); gun.add(pump);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.15), bodyMat);
    receiver.position.set(0, 0.01, 0.05); gun.add(receiver);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.18), woodMat);
    stock.position.set(0, -0.005, 0.2); gun.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.035), woodMat);
    grip.position.set(0, -0.04, 0.08); grip.rotation.x = 0.15; gun.add(grip);
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
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.45, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.25); gun.add(barrel);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.2), bodyMat);
    receiver.position.set(0, 0.02, 0); gun.add(receiver);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8), scopeMat);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.065, -0.02); gun.add(scope);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.2), woodMat);
    stock.position.set(0, 0, 0.2); gun.add(stock);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), bodyMat);
    bolt.position.set(0.025, 0.03, 0.02); gun.add(bolt);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.07, 0.035), bodyMat);
    mag.position.set(0, -0.035, -0.02);
    mag.name = 'reloadMag';
    (mag.userData as Record<string, number>).restY = -0.035;
    gun.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.035), woodMat);
    grip.position.set(0, -0.04, 0.06); grip.rotation.x = 0.15; gun.add(grip);
    return gun;
  }
}
