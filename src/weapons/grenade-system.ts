import * as THREE from 'three';
import { PhysicsWorld } from '../core/physics-world';
import { EnemyManager } from '../enemies/enemy-manager';

const GRAVITY = -18;
const THROW_SPEED = 16;
const GROUND_RAY_LENGTH = 5;
const GAS_RADIUS = 3;
const GAS_DURATION = 4;
const GAS_DAMAGE_PER_SECOND = 15;

interface ThrownGrenade {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface GasCloud {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  radius: number;
  remaining: number;
  duration: number;
}

export class GrenadeSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private enemyManager: EnemyManager | null = null;
  private thrown: ThrownGrenade[] = [];
  private clouds: GasCloud[] = [];
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _groundNormal = new THREE.Vector3(0, -1, 0);

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;
  }

  setEnemyManager(manager: EnemyManager): void {
    this.enemyManager = manager;
  }

  /** Throw a gas grenade from origin along direction (normalized). */
  throw(origin: THREE.Vector3, direction: THREE.Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0x2a4a2a,
        roughness: 0.8,
        metalness: 0.2,
      }),
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    // Use look direction only — grenade goes where crosshair points; gravity arcs it
    const vel = direction.clone().multiplyScalar(THROW_SPEED);

    this.thrown.push({
      mesh,
      position: origin.clone(),
      velocity: vel,
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
    const hit = this.physics.castRay(x, y, z, 0, -1, 0, GROUND_RAY_LENGTH);
    if (hit) {
      return hit.point.y;
    }
    return 0;
  }

  update(dt: number): void {
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
        this.spawnGasCloud(new THREE.Vector3(g.position.x, groundY + 0.1, g.position.z));
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
  }
}
