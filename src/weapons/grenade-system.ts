import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';
import { EnemyManager } from '../enemies/enemy-manager';
import {
  generateExplosionTexture,
  EXPLOSION_FRAMES,
  getExplosionOffset,
} from './explosion-sprite';

const GRAVITY = -18;
const THROW_SPEED = 16;
const GROUND_RAY_LENGTH = 5;
const GAS_RADIUS = 3;
const GAS_DURATION = 4;
const GAS_DAMAGE_PER_SECOND = 15;
const FRAG_EXPLOSION_RADIUS = 4;
const FRAG_EXPLOSION_DAMAGE = 80;
const FRAG_EXPLOSION_DURATION = 0.5;
const FRAG_EXPLOSION_SIZE = 6;

export type GrenadeType = 'gas' | 'frag';

interface ThrownGrenade {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  type: GrenadeType;
}

interface GasCloud {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  radius: number;
  remaining: number;
  duration: number;
}

interface ActiveExplosion {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  radius: number;
  damageDealt: boolean;
  elapsed: number;
  duration: number;
}

export class GrenadeSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private enemyManager: EnemyManager | null = null;
  /** Excluded from ground raycast so the grenade doesn't "land" on the player. */
  private playerCollider: RAPIER.Collider | null = null;
  private thrown: ThrownGrenade[] = [];
  private clouds: GasCloud[] = [];
  private explosions: ActiveExplosion[] = [];
  private explosionTexture: THREE.Texture | null = null;
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _groundNormal = new THREE.Vector3(0, -1, 0);
  private readonly _cameraPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;
  }

  setEnemyManager(manager: EnemyManager): void {
    this.enemyManager = manager;
  }

  setPlayerCollider(collider: RAPIER.Collider): void {
    this.playerCollider = collider;
  }

  /** Throw a grenade from origin along direction (normalized). */
  throw(origin: THREE.Vector3, direction: THREE.Vector3, type: GrenadeType): void {
    const isFrag = type === 'frag';
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({
        color: isFrag ? 0x333333 : 0x2a4a2a,
        roughness: isFrag ? 0.6 : 0.8,
        metalness: isFrag ? 0.5 : 0.2,
      }),
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const vel = direction.clone().multiplyScalar(THROW_SPEED);

    this.thrown.push({
      mesh,
      position: origin.clone(),
      velocity: vel,
      type,
    });
  }

  private spawnExplosion(at: THREE.Vector3): void {
    if (!this.explosionTexture) {
      this.explosionTexture = generateExplosionTexture();
    }
    const tex = this.explosionTexture.clone();
    tex.repeat.set(1 / EXPLOSION_FRAMES, 1);
    const geo = new THREE.PlaneGeometry(FRAG_EXPLOSION_SIZE, FRAG_EXPLOSION_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at);
    this.scene.add(mesh);

    this.explosions.push({
      mesh,
      position: at.clone(),
      radius: FRAG_EXPLOSION_RADIUS,
      damageDealt: false,
      elapsed: 0,
      duration: FRAG_EXPLOSION_DURATION,
    });
  }

  private spawnGasCloud(at: THREE.Vector3): void {
    const geometry = new THREE.SphereGeometry(GAS_RADIUS, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const material = new THREE.MeshBasicMaterial({
      color: 0x446644,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(at);
    this.scene.add(mesh);

    this.clouds.push({
      mesh,
      position: at.clone(),
      radius: GAS_RADIUS,
      remaining: GAS_DURATION,
      duration: GAS_DURATION,
    });
  }

  private getGroundY(x: number, y: number, z: number): number {
    const hit = this.physics.castRay(
      x, y, z,
      0, -1, 0,
      GROUND_RAY_LENGTH,
      this.playerCollider ?? undefined,
    );
    if (hit) {
      return hit.point.y;
    }
    return 0;
  }

  update(dt: number, camera?: THREE.Camera): void {
    // Update thrown grenades
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const g = this.thrown[i];
      g.velocity.y += GRAVITY * dt;
      g.position.addScaledVector(g.velocity, dt);
      g.mesh.position.copy(g.position);

      const groundY = this.getGroundY(g.position.x, g.position.y, g.position.z);
      if (g.position.y <= groundY + 0.15) {
        this.scene.remove(g.mesh);
        this.thrown.splice(i, 1);
        const impactPos = new THREE.Vector3(g.position.x, groundY + 0.1, g.position.z);
        if (g.type === 'gas') {
          this.spawnGasCloud(impactPos);
        } else {
          this.spawnExplosion(impactPos);
        }
      }
    }

    // Update gas clouds: damage enemies and fade
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.remaining -= dt;

      if (this.enemyManager && c.remaining > 0) {
        const damageThisFrame = GAS_DAMAGE_PER_SECOND * dt;
        this.enemyManager.damageEnemiesInRadius(c.position, c.radius, damageThisFrame);
      }

      const mat = c.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 * (c.remaining / c.duration);

      if (c.remaining <= 0) {
        c.mesh.geometry.dispose();
        mat.dispose();
        this.scene.remove(c.mesh);
        this.clouds.splice(i, 1);
      }
    }

    // Update explosions: billboard, animate sprite, one-time damage, then remove
    if (camera) this._cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.elapsed += dt;
      if (!e.damageDealt && this.enemyManager) {
        this.enemyManager.damageEnemiesInRadius(e.position, e.radius, FRAG_EXPLOSION_DAMAGE);
        e.damageDealt = true;
      }
      const t = Math.min(1, e.elapsed / e.duration);
      const frameIndex = Math.min(
        Math.floor(t * EXPLOSION_FRAMES),
        EXPLOSION_FRAMES - 1,
      );
      const offset = getExplosionOffset(frameIndex);
      (e.mesh.material as THREE.MeshBasicMaterial).map!.offset.set(offset.x, offset.y);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t * 0.7;
      if (camera) {
        e.mesh.lookAt(this._cameraPosition);
      }
      if (e.elapsed >= e.duration) {
        const m = e.mesh.material as THREE.MeshBasicMaterial;
        if (m.map) m.map.dispose();
        e.mesh.geometry.dispose();
        m.dispose();
        this.scene.remove(e.mesh);
        this.explosions.splice(i, 1);
      }
    }
  }
}
