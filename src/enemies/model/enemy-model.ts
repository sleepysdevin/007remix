/**
 * Low-poly 3D enemy model — replaces EnemySprite.
 * Same public interface: mesh, shadowMesh, animator, update(), triggerHitFlash(), play(), dispose().
 * No billboarding — parent group's rotation.y controls facing.
 */

import * as THREE from 'three';
import type { GuardVariant } from '../sprite/guard-sprite-sheet';
import type { Pose } from './pose-library';
import { createGuardModel } from './guard-model-factory';
import { PoseAnimator, type AnimationName } from './pose-animator';

export class EnemyModel {
  readonly mesh: THREE.Group;
  readonly shadowMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;
  readonly animator: PoseAnimator;
  private gun: THREE.Object3D | null = null;
  private weaponPivot: THREE.Group | null = null;
  private isAiming = false;
  private aimTarget = new THREE.Vector3();
  private muzzleFlash: THREE.Mesh | null = null;
  private muzzleFlashTimer = 0;
  private readonly shoulderWorld = new THREE.Vector3();
  private readonly pivotWorld = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly rightWorld = new THREE.Vector3();
  private readonly worldQuat = new THREE.Quaternion();

  private joints: ReturnType<typeof createGuardModel>['joints'];
  private hitFlashMeshes: THREE.Mesh[];
  private hitTintTimer = 0;

  constructor(variant: GuardVariant) {
    try {
      const { rootGroup, joints, hitFlashMeshes } = createGuardModel(variant);
      this.mesh = new THREE.Group();
      this.mesh.add(rootGroup); // Add the model as a child of the main group
      this.joints = joints;
      this.hitFlashMeshes = hitFlashMeshes;
      this.animator = new PoseAnimator();
      
      // Mount weapon on a stable pivot (not directly on animated hand bones).
      this.weaponPivot = new THREE.Group();
      this.mesh.add(this.weaponPivot);
      this.gun = this.createGun();
      this.weaponPivot.add(this.gun);

      // Blob shadow at feet
      const shadowGeo = new THREE.PlaneGeometry(0.8, 0.4);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      this.shadowMesh.position.y = 0.01; // Lower position to ensure it's on ground
      
      console.log('[EnemyModel] Successfully created enemy model');
    } catch (error) {
      console.error('[EnemyModel] Failed to create enemy model:', error);
      // Create a group to hold the fallback mesh
      this.mesh = new THREE.Group();
      
      // Create fallback simple box as a child of the group
      const fallbackGeo = new THREE.BoxGeometry(0.5, 1, 0.5);
      const fallbackMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
      this.mesh.add(fallbackMesh);
      
      // Create minimal fallback joints structure
      this.joints = {
        hips: new THREE.Group(),
        torso: new THREE.Group(),
        head: new THREE.Group(),
        leftShoulder: new THREE.Group(),
        rightShoulder: new THREE.Group(),
        leftElbow: new THREE.Group(),
        rightElbow: new THREE.Group(),
        leftHip: new THREE.Group(),
        rightHip: new THREE.Group(),
        leftKnee: new THREE.Group(),
        rightKnee: new THREE.Group()
      };
      
      // Add all joints to the scene graph
      this.joints.hips.add(this.joints.torso);
      this.joints.torso.add(this.joints.head);
      this.joints.torso.add(this.joints.leftShoulder);
      this.joints.torso.add(this.joints.rightShoulder);
      this.joints.leftShoulder.add(this.joints.leftElbow);
      this.joints.rightShoulder.add(this.joints.rightElbow);
      this.joints.hips.add(this.joints.leftHip);
      this.joints.hips.add(this.joints.rightHip);
      this.joints.leftHip.add(this.joints.leftKnee);
      this.joints.rightHip.add(this.joints.rightKnee);
      
      this.mesh.add(this.joints.hips);
      this.hitFlashMeshes = [fallbackMesh];
      this.animator = new PoseAnimator();
      this.weaponPivot = new THREE.Group();
      this.mesh.add(this.weaponPivot);
      this.gun = this.createGun();
      this.weaponPivot.add(this.gun);
      
      // Simple shadow
      const shadowGeo = new THREE.PlaneGeometry(0.8, 0.4);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      this.shadowMesh.position.y = 0.01;
    }
  }

  update(dt: number): void {
    this.animator.update(dt);
    this.applyPose(this.animator.currentPose);

    if (this.isAiming) {
      this.applyAimingOverride();
    } else {
      this.applyIdleWeaponPose();
    }

    if (this.muzzleFlash) {
      this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
      this.muzzleFlash.visible = this.muzzleFlashTimer > 0;
    }

    // Hit flash tint
    if (this.hitTintTimer > 0) {
      this.hitTintTimer -= dt;
      for (const m of this.hitFlashMeshes) {
        (m.material as THREE.MeshStandardMaterial).color.setHex(0xff4444);
      }
    } else {
      for (const m of this.hitFlashMeshes) {
        const orig = (m.userData as Record<string, number>).originalColor;
        if (typeof orig === 'number') {
          (m.material as THREE.MeshStandardMaterial).color.setHex(orig);
        }
      }
    }
  }

  triggerHitFlash(): void {
    this.hitTintTimer = 0.12;
  }

  play(name: AnimationName, force = false): void {
    this.animator.play(name, force);
  }

  private applyPose(pose: Pose): void {
    const get = (k: keyof Pose) => (pose[k] ?? 0) as number;
 
    try {
      // Hips Y offset (crouch / death collapse)
      if (this.joints?.hips) {
        this.joints.hips.position.y = 0.9 + get('hipsY');
      }
 
      // Torso
      if (this.joints?.torso) {
        this.joints.torso.rotation.x = get('torsoX');
        this.joints.torso.rotation.z = get('torsoZ');
      }
 
      // Head
      if (this.joints?.head) {
        this.joints.head.rotation.x = get('headX');
        this.joints.head.rotation.y = get('headY');
        this.joints.head.rotation.z = get('headZ');
      }
 
      // Arms
      if (this.joints?.leftShoulder) {
        this.joints.leftShoulder.rotation.x = get('leftShoulderX');
        this.joints.leftShoulder.rotation.z = get('leftShoulderZ');
      }
      if (this.joints?.rightShoulder) {
        this.joints.rightShoulder.rotation.x = get('rightShoulderX');
        this.joints.rightShoulder.rotation.z = get('rightShoulderZ');
      }
      if (this.joints?.leftElbow) {
        this.joints.leftElbow.rotation.x = get('leftElbowX');
      }
      if (this.joints?.rightElbow) {
        this.joints.rightElbow.rotation.x = get('rightElbowX');
      }
 
      // Legs — rotation.x swings in YZ plane (forward/back), rotation.x on knee for bend
      if (this.joints?.leftHip) {
        this.joints.leftHip.rotation.set(get('leftHipX'), 0, 0);
      }
      if (this.joints?.rightHip) {
        this.joints.rightHip.rotation.set(get('rightHipX'), 0, 0);
      }
      if (this.joints?.leftKnee) {
        this.joints.leftKnee.rotation.set(get('leftKneeX'), 0, 0);
      }
      if (this.joints?.rightKnee) {
        this.joints.rightKnee.rotation.set(get('rightKneeX'), 0, 0);
      }
    } catch (error) {
      console.error('Error applying pose:', error);
    }
  }

  private createGun(): THREE.Object3D {
    const gun = new THREE.Group();
    
    // Pistol material
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x6d6d6d,
      emissive: 0x111111,
      emissiveIntensity: 0.35,
      metalness: 0.9,
      roughness: 0.28,
    });
    
    // Build weapon so forward points along local -Z (compatible with lookAt).
    const bodyGeo = new THREE.BoxGeometry(0.14, 0.09, 0.38);
    const body = new THREE.Mesh(bodyGeo, gunMat);
    body.position.set(0, 0, -0.14);
    gun.add(body);
    
    // Barrel points forward (-Z)
    const barrelGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8);
    const barrel = new THREE.Mesh(barrelGeo, gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.34);
    gun.add(barrel);

    // Muzzle flash helper on barrel tip.
    const flashGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.95 });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0, 0, -0.47);
    this.muzzleFlash.visible = false;
    gun.add(this.muzzleFlash);
    
    // Grip
    const gripGeo = new THREE.BoxGeometry(0.12, 0.17, 0.09);
    const grip = new THREE.Mesh(gripGeo, gunMat);
    grip.position.set(0, -0.1, 0.02);
    gun.add(grip);
    
    // Default local mount near hand pivot.
    gun.position.set(0, 0, 0);
    
    // Disable gun from casting shadows to prevent visual glitches
    gun.traverse(child => {
      child.castShadow = false;
      child.receiveShadow = false;
    });
    
    return gun;
  }

  private applyIdleWeaponPose(): void {
    if (!this.weaponPivot || !this.gun) return;
    // Rest pistol a bit lower and farther from shoulder for clearer silhouette.
    this.weaponPivot.position.set(0.29, 0.96, 0.16);
    this.weaponPivot.rotation.set(0.05, 0.12, -0.06);
    this.gun.position.set(0, 0, 0);
    this.gun.rotation.set(0.1, Math.PI * 0.94, 0);
  }

  setGunAim(targetWorldPos: THREE.Vector3): void {
    this.isAiming = true;
    this.aimTarget.copy(targetWorldPos);
  }

  clearGunAim(): void {
    this.isAiming = false;
  }

  triggerMuzzleFlash(): void {
    this.muzzleFlashTimer = 0.06;
    if (this.muzzleFlash) this.muzzleFlash.visible = true;
  }

  private applyAimingOverride(): void {
    if (!this.gun || !this.weaponPivot) return;

    // Keep aiming arm stable so the barrel doesn't wave during walk cycles.
    this.joints.rightShoulder.rotation.x = -0.85;
    this.joints.rightShoulder.rotation.z = -0.08;
    this.joints.rightElbow.rotation.x = -0.25;
    this.joints.leftShoulder.rotation.x = -0.55;
    this.joints.leftShoulder.rotation.z = 0.12;
    this.joints.leftElbow.rotation.x = -0.18;
    // Keep face readable while advancing.
    this.joints.head.rotation.x = 0;
    this.joints.head.rotation.y = 0;
    this.joints.head.rotation.z = 0;

    this.joints.rightShoulder.getWorldPosition(this.shoulderWorld);
    this.mesh.getWorldQuaternion(this.worldQuat);
    this.rightWorld.set(1, 0, 0).applyQuaternion(this.worldQuat).normalize();

    this.aimDir.copy(this.aimTarget).sub(this.shoulderWorld);
    if (this.aimDir.lengthSq() < 0.0001) return;
    this.aimDir.normalize();

    // Position gun on right chest in WORLD space, push toward target,
    // then convert once to local to avoid world/local mixing drift.
    this.pivotWorld.copy(this.shoulderWorld);
    this.pivotWorld.y -= 0.06;
    this.pivotWorld.addScaledVector(this.rightWorld, -0.02);
    this.pivotWorld.addScaledVector(this.aimDir, 0.24);
    this.weaponPivot.position.copy(this.pivotWorld);
    this.mesh.worldToLocal(this.weaponPivot.position);

    this.gun.position.set(0, 0, 0);
    this.gun.rotation.set(0, Math.PI, 0);

    // Point barrel at target.
    // Keep a stable up vector to avoid roll wobble while aiming.
    this.weaponPivot.up.set(0, 1, 0);
    this.weaponPivot.lookAt(this.aimTarget);
  }

  dispose(): void {
    // Clean up gun
    if (this.gun) {
      this.gun.traverse(child => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }
    
    // Clean up other meshes
    this.hitFlashMeshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    
    // Clean up shadow mesh
    if (this.shadowMesh) {
      if (this.shadowMesh.geometry) this.shadowMesh.geometry.dispose();
      if (this.shadowMesh.material) {
        if (Array.isArray(this.shadowMesh.material)) {
          this.shadowMesh.material.forEach(mat => mat.dispose());
        } else {
          this.shadowMesh.material.dispose();
        }
      }
    }
  }
}
