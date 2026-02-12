import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';
import { WeaponBase } from './weapon-base';

const MAX_DECALS = 50;
const DECAL_LIFETIME = 1.5; // seconds - impact effects fade quickly

interface Decal {
  mesh: THREE.Mesh;
  birthTime: number;
}

interface ActiveParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number; // counts down from 0.3
}

/**
 * Handles hitscan raycasting, wall decals (bullet holes), and impact effects.
 * All particle animation is batched in update() — no per-particle rAF loops.
 */
export class ProjectileSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private decals: Decal[] = [];
  private decalMaterial: THREE.MeshBasicMaterial;

  // Particle pool (pre-allocated, reused)
  private particlePool: THREE.Mesh[] = [];
  private activeParticles: ActiveParticle[] = [];

  // Shared decal geometry (reused for all bullet holes)
  private decalGeo: THREE.CircleGeometry;

  // Reusable temp vectors (avoid per-fire allocations)
  private readonly _spreadDir = new THREE.Vector3();
  private readonly _hitPoint = new THREE.Vector3();
  private readonly _normal = new THREE.Vector3();
  private readonly _lookTarget = new THREE.Vector3();

  // Callbacks for hit detection
  onHitCollider: ((colliderHandle: number, point: THREE.Vector3, normal: THREE.Vector3) => void) | null = null;
  /** If set, decals and impact particles are skipped when the hit collider is an enemy (avoids lingering effects on bodies). */
  isEnemyCollider: ((colliderHandle: number) => boolean) | null = null;

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;

    // Bullet hole decal material
    this.decalMaterial = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Shared decal geometry
    this.decalGeo = new THREE.CircleGeometry(0.03, 5);

    // Pre-create impact particle pool
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0xccaa66,
      transparent: true,
      opacity: 1,
    });
    for (let i = 0; i < 20; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.02, 0.02),
        particleMat.clone(),
      );
      p.visible = false;
      this.scene.add(p);
      this.particlePool.push(p);
    }
  }

  /**
   * Fire a hitscan ray from the camera.
   */
  fireRay(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    weapon: WeaponBase,
    excludeCollider?: RAPIER.Collider,
  ): { hit: boolean; point?: THREE.Vector3; colliderHandle?: number } {
    // Apply weapon spread using reusable vector
    this._spreadDir.copy(direction);
    if (weapon.stats.spread > 0) {
      this._spreadDir.x += (Math.random() - 0.5) * weapon.stats.spread;
      this._spreadDir.y += (Math.random() - 0.5) * weapon.stats.spread;
      this._spreadDir.z += (Math.random() - 0.5) * weapon.stats.spread;
      this._spreadDir.normalize();
    }

    const result = this.physics.castRay(
      origin.x, origin.y, origin.z,
      this._spreadDir.x, this._spreadDir.y, this._spreadDir.z,
      weapon.stats.range,
      excludeCollider,
      undefined,
      true,
    );

    if (result) {
      this._hitPoint.set(result.point.x, result.point.y, result.point.z);
      this._normal.copy(this._spreadDir).negate();

      const colliderHandle = result.colliderHandle;
      const hasHandle = typeof colliderHandle === 'number';
      const hitEnemy = hasHandle ? (this.isEnemyCollider?.(colliderHandle) ?? false) : false;
      if (!hitEnemy) {
        // Only leave decals and particles on walls/geometry — not on enemies (no lingering blocks)
        this.createDecal(this._hitPoint, this._normal);
        this.spawnImpactParticles(this._hitPoint, this._normal);
      }

      // Notify listeners (enemy hit detection)
      if (hasHandle && this.onHitCollider) {
        this.onHitCollider(colliderHandle, this._hitPoint, this._normal);
      }

      return { hit: true, point: this._hitPoint.clone(), colliderHandle };
    }

    return { hit: false };
  }

  private createDecal(position: THREE.Vector3, normal: THREE.Vector3): void {
    // Remove oldest decal if at limit
    if (this.decals.length >= MAX_DECALS) {
      const old = this.decals.shift()!;
      this.scene.remove(old.mesh);
    }

    // Reuse shared geometry
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMaterial);
    mesh.position.copy(position).addScaledVector(normal, 0.005);
    this._lookTarget.copy(position).add(normal);
    mesh.lookAt(this._lookTarget);

    this.scene.add(mesh);
    this.decals.push({ mesh, birthTime: performance.now() / 1000 });
  }

  private spawnImpactParticles(position: THREE.Vector3, normal: THREE.Vector3): void {
    let count = 0;
    for (const p of this.particlePool) {
      if (p.visible) continue;
      if (count >= 4) break;

      p.position.copy(position);
      p.visible = true;
      (p.material as THREE.MeshBasicMaterial).opacity = 1;

      // Random velocity outward from surface
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2 + normal.x * 2,
        Math.random() * 2 + normal.y * 1,
        (Math.random() - 0.5) * 2 + normal.z * 2,
      );

      this.activeParticles.push({ mesh: p, vel, life: 0.3 });
      count++;
    }
  }

  /** Update particles and clean up old decals — called once per frame from game loop */
  update(dt?: number): void {
    const now = performance.now() / 1000;
    const frameDt = dt ?? 0.016;

    // Batch-update active particles (no individual rAF loops)
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const ap = this.activeParticles[i];
      ap.life -= frameDt;
      if (ap.life <= 0) {
        ap.mesh.visible = false;
        this.activeParticles.splice(i, 1);
      } else {
        ap.mesh.position.addScaledVector(ap.vel, frameDt);
        ap.vel.y -= 9.81 * frameDt;
        (ap.mesh.material as THREE.MeshBasicMaterial).opacity = ap.life / 0.3;
      }
    }

    // Clean up old decals
    while (this.decals.length > 0 && now - this.decals[0].birthTime > DECAL_LIFETIME) {
      const old = this.decals.shift()!;
      this.scene.remove(old.mesh);
    }
  }
}
