import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld, GROUP_WORLD, createCollisionFilter } from '../core/physics-world';
import { StateMachine } from './ai/state-machine';
import { EnemyModel } from './model/enemy-model';
import { type GuardVariant } from './sprite/guard-sprite-sheet';

const BODY_RADIUS = 0.3;

// If you want overall body height about 1.4, capsule half-height must exclude caps.
const BODY_HEIGHT = 1.4;
const CAPSULE_HALF_HEIGHT = Math.max(0.01, (BODY_HEIGHT * 0.5) - BODY_RADIUS);

// capsule center above feet
const CAPSULE_CENTER_OFFSET_Y = CAPSULE_HALF_HEIGHT + BODY_RADIUS;

const EYE_HEIGHT = 1.6;
const FEET_VISUAL_EPS = 0.02;
const WORLD_ONLY_QUERY_GROUPS = createCollisionFilter(0xffff, GROUP_WORLD);
const DEATH_HOLD_TIME = 0.7;
const DEATH_FADE_TIME = 0.5;
const MODEL_YAW_OFFSET = 0;
const GROUND_SNAP_CAST_HEIGHT = 1.2;
const GROUND_SNAP_CAST_DISTANCE = 8.0;

export class EnemyBase {
  readonly group: THREE.Group;
  readonly model: EnemyModel;

  private readonly rigidBodyHandle: number;
  readonly collider: RAPIER.Collider;
  readonly stateMachine: StateMachine<EnemyBase>;

  health = 100;
  maxHealth = 100;
  moveSpeed = 1.1;
  damage = 8;
  fireRate = 1.5;
  accuracy = 0.08;
  lastFireTime = 0;
  firstShotDelay = 0;
  dead = false;
  deathTimer = 0;
  lastKnownPlayerPos: THREE.Vector3 | null = null;
  timeSinceSeenPlayer = 0;
  waypoints: Array<{ x: number; y: number; z: number }> = [];

  private readonly _tmp = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();

  // cache vertical velocity AFTER physics step
  private _vy = 0;
  private _vx = 0;
  private _vz = 0;
  private _centerY = 0;
  private _targetVx = 0;
  private _targetVz = 0;
  private _separationVx = 0;
  private _separationVz = 0;
  private _readyToDespawn = false;

  constructor(
    private readonly physics: PhysicsWorld,
    variant: GuardVariant,
    feetX: number,
    feetY: number,
    feetZ: number,
    private readonly roomBounds?: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    },
  ) {
    this.group = new THREE.Group();
    this.model = new EnemyModel(variant);

    // visuals at feet
    this.group.position.set(feetX, feetY + FEET_VISUAL_EPS, feetZ);
    this.group.add(this.model.mesh);
    this.group.add(this.model.shadowMesh);

    // physics capsule at center
    const centerY = feetY + CAPSULE_CENTER_OFFSET_Y;

    const { body, collider } = this.physics.createKinematicCapsule(
      CAPSULE_HALF_HEIGHT,
      BODY_RADIUS,
      feetX,
      centerY,
      feetZ,
      { friction: 1.0 }
    );

    this.rigidBodyHandle = body.handle;
    this.collider = collider;
    this._centerY = centerY;

    this.stateMachine = new StateMachine<EnemyBase>();
  }

  canFire(): boolean {
    const now = performance.now() / 1000;
    const interval = 1 / Math.max(0.001, this.fireRate);
    return (now - this.lastFireTime) >= interval;
  }

  getForwardDirection(): THREE.Vector3 {
    this._fwd.set(0, 0, 1);
    this._fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
    return this._fwd;
  }

  getHeadPosition(): THREE.Vector3 {
    return this._tmp.set(
      this.group.position.x,
      this.group.position.y + EYE_HEIGHT,
      this.group.position.z,
    );
  }

  /**
   * Call AFTER physics.step().
   */
  syncFromPhysics(): void {
    try {
      const body = this.getRigidBody();
      if (!body) return;
      const t = body.translation();
      if (!t) return; // Safety check

      const tx = t.x;
      const ty = t.y;
      const tz = t.z;
      (t as any).free?.();
      
      this.group.position.set(
        tx,
        (ty - CAPSULE_CENTER_OFFSET_Y) + FEET_VISUAL_EPS,
        tz
      );

      this._vy = 0;
    } catch (error) {
      console.warn('EnemyBase.syncFromPhysics error:', error);
    }
  }

  move(dir: THREE.Vector3, speed: number, _dt: number): void {
    if (this.dead) return;

    const nx = dir.x;
    const nz = dir.z;
    const len = Math.sqrt(nx * nx + nz * nz) || 1;

    const vx = (nx / len) * speed;
    const vz = (nz / len) * speed;

    this._targetVx = vx;
    this._targetVz = vz;
    this._vx = vx;
    this._vz = vz;
  }

  stop(): void {
    this._targetVx = 0;
    this._targetVz = 0;
    this._vx = 0;
    this._vz = 0;
  }

  setSeparationVelocity(vx: number, vz: number): void {
    this._separationVx = vx;
    this._separationVz = vz;
  }

  applyMovement(dt: number): void {
    if (this.dead) return;

    const currentX = this.group.position.x;
    const currentZ = this.group.position.z;
    let nextX = currentX + (this._targetVx + this._separationVx) * dt;
    let nextZ = currentZ + (this._targetVz + this._separationVz) * dt;
    const nextCenterY = this._centerY;

    // Prevent kinematic tunneling through walls by clamping movement to first obstacle.
    const dx = nextX - currentX;
    const dz = nextZ - currentZ;
    const moveDist = Math.sqrt(dx * dx + dz * dz);
    if (moveDist > 0.0001) {
      const dirX = dx / moveDist;
      const dirZ = dz / moveDist;
      const skin = BODY_RADIUS + 0.03;
      const hit = this.physics.castRay(
        currentX,
        nextCenterY,
        currentZ,
        dirX,
        0,
        dirZ,
        moveDist + skin,
        this.collider,
        WORLD_ONLY_QUERY_GROUPS,
      );

      if (hit && hit.toi <= moveDist + skin) {
        const allowedDist = Math.max(0, hit.toi - skin);
        nextX = currentX + dirX * allowedDist;
        nextZ = currentZ + dirZ * allowedDist;

        // If directly blocked, try axis-aligned sliding to reduce "stuck on wall" behavior.
        if (allowedDist <= 0.001) {
          if (Math.abs(dx) > 0.0001) {
            const signX = Math.sign(dx);
            const distX = Math.abs(dx);
            const hitX = this.physics.castRay(
              currentX,
              nextCenterY,
              currentZ,
              signX,
              0,
              0,
              distX + skin,
              this.collider,
              WORLD_ONLY_QUERY_GROUPS,
            );
            const allowX = hitX ? Math.max(0, hitX.toi - skin) : distX;
            nextX = currentX + signX * allowX;
          }

          if (Math.abs(dz) > 0.0001) {
            const signZ = Math.sign(dz);
            const distZ = Math.abs(dz);
            const hitZ = this.physics.castRay(
              currentX,
              nextCenterY,
              currentZ,
              0,
              0,
              signZ,
              distZ + skin,
              this.collider,
              WORLD_ONLY_QUERY_GROUPS,
            );
            const allowZ = hitZ ? Math.max(0, hitZ.toi - skin) : distZ;
            nextZ = currentZ + signZ * allowZ;
          }
        }
      }
    }

    // Keep enemies constrained to their room so they never leak through room seams.
    if (this.roomBounds) {
      nextX = Math.min(this.roomBounds.maxX, Math.max(this.roomBounds.minX, nextX));
      nextZ = Math.min(this.roomBounds.maxZ, Math.max(this.roomBounds.minZ, nextZ));
    }

    // Re-snap to walkable ground under the next XZ position so enemies step
    // back down after leaving props (e.g., boxes) instead of staying elevated.
    let snappedCenterY = nextCenterY;
    const groundHit = this.physics.castRay(
      nextX,
      nextCenterY + GROUND_SNAP_CAST_HEIGHT,
      nextZ,
      0,
      -1,
      0,
      GROUND_SNAP_CAST_DISTANCE,
      this.collider,
      WORLD_ONLY_QUERY_GROUPS,
    );
    if (groundHit) {
      snappedCenterY = groundHit.point.y + CAPSULE_CENTER_OFFSET_Y;
    }

    try {
      const body = this.getRigidBody();
      if (!body) return;
      body.setNextKinematicTranslation(
        { x: nextX, y: snappedCenterY, z: nextZ } as any
      );
      this._centerY = snappedCenterY;
    } catch (error) {
      console.warn('EnemyBase.applyMovement error:', error);
    }
  }

  lookAt(target: THREE.Vector3): void {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    this.group.rotation.y = Math.atan2(dx, dz) + MODEL_YAW_OFFSET;
  }

  rotate(amount: number): void {
    this.group.rotation.y += amount;
  }

  canMove(): boolean {
    return !this.dead;
  }

  update(dt: number): void {
    this.model.update(dt);
    if (!this.dead) return;

    this.deathTimer += dt;
    if (this.deathTimer <= DEATH_HOLD_TIME) return;

    const fadeT = Math.min(1, (this.deathTimer - DEATH_HOLD_TIME) / DEATH_FADE_TIME);
    const opacity = 1 - fadeT;
    this.setVisualOpacity(opacity);
    if (fadeT >= 1) {
      this._readyToDespawn = true;
    }
  }

  getRigidBody(): RAPIER.RigidBody | null {
    return this.physics.world.getRigidBody(this.rigidBodyHandle) ?? null;
  }

  takeDamage(amount: number): void {
    if (this.dead) return;
    const appliedDamage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (appliedDamage <= 0) return;
    this.health -= appliedDamage;
    this.model.triggerHitFlash();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deathTimer = 0;
      this.stop();
      this.setVisualOpacity(1);
      this.stateMachine.transition('dead', this);
    }
  }

  isReadyToDespawn(): boolean {
    return this._readyToDespawn;
  }

  private setVisualOpacity(opacity: number): void {
    const clamped = Math.min(1, Math.max(0, opacity));
    this.model.mesh.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const m = material as THREE.Material & { transparent?: boolean; opacity?: number };
        m.transparent = true;
        m.opacity = clamped;
      }
    });
    const shadowMat = this.model.shadowMesh.material as THREE.Material & { transparent?: boolean; opacity?: number };
    shadowMat.transparent = true;
    shadowMat.opacity = 0.3 * clamped;
  }
}
