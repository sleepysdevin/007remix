import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';
import { StateMachine } from './ai/state-machine';
import { EnemySprite } from './sprite/enemy-sprite';
import { type GuardVariant, GUARD_VARIANTS } from './sprite/guard-sprite-sheet';

const BODY_RADIUS = 0.3;
const BODY_HEIGHT = 1.4;
const EYE_HEIGHT = 1.6;

export class EnemyBase {
  readonly group: THREE.Group;
  readonly sprite: EnemySprite;
  readonly rigidBody: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly stateMachine: StateMachine<EnemyBase>;

  health = 100;
  maxHealth = 100;
  damage = 8;              // Damage per shot to player
  fireRate = 1.5;          // Shots per second
  accuracy = 0.08;         // Spread (lower = more accurate)
  lastFireTime = 0;
  dead = false;
  deathTimer = 0;

  // Facing direction (yaw angle) — used by AI perception, NOT for visual rotation
  facingAngle = 0;
  targetFacingAngle = 0;

  // Last known player position (for alert/chase)
  lastKnownPlayerPos: THREE.Vector3 | null = null;

  /** Patrol waypoints (x, z). When set, AI uses patrol state. */
  waypoints: { x: number; z: number }[] = [];

  // Alert propagation
  alertCooldown = 0;

  // Hit flash
  private hitFlashTimer = 0;

  constructor(
    physics: PhysicsWorld,
    x: number, y: number, z: number,
    facingAngle: number,
    variant: GuardVariant = GUARD_VARIANTS.guard,
  ) {
    this.facingAngle = facingAngle;
    this.targetFacingAngle = facingAngle;

    // Visual mesh group (NO rotation applied — billboard handles visual facing)
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    // Sprite (replaces cylinder body + sphere head + box gun)
    this.sprite = new EnemySprite(variant);
    this.group.add(this.sprite.mesh);
    this.group.add(this.sprite.shadowMesh);

    // Physics body (kinematic — AI controls movement)
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, y + BODY_HEIGHT / 2 + BODY_RADIUS, z);
    this.rigidBody = physics.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(
      BODY_HEIGHT / 2,
      BODY_RADIUS,
    );
    this.collider = physics.world.createCollider(colliderDesc, this.rigidBody);

    // State machine
    this.stateMachine = new StateMachine<EnemyBase>();
  }

  getHeadPosition(): THREE.Vector3 {
    const pos = this.group.position;
    return new THREE.Vector3(pos.x, pos.y + EYE_HEIGHT, pos.z);
  }

  getForwardDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.facingAngle),
      0,
      Math.cos(this.facingAngle),
    );
  }

  /** Smoothly rotate toward target facing angle (AI-only, no visual rotation) */
  updateFacing(dt: number): void {
    let diff = this.targetFacingAngle - this.facingAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const turnSpeed = 4;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
    this.facingAngle += step;
    // DO NOT set group.rotation.y — billboard handles visual facing
  }

  /** Face toward a world position */
  lookAt(target: THREE.Vector3): void {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    this.targetFacingAngle = Math.atan2(dx, dz);
  }

  /** Check if can fire based on fire rate */
  canFire(now: number): boolean {
    return now - this.lastFireTime >= 1 / this.fireRate;
  }

  takeDamage(amount: number): void {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlashTimer = 0.12;
    this.sprite.triggerHitFlash();
    this.sprite.play('hit');

    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  private die(): void {
    this.dead = true;
    this.deathTimer = 0;
    this.sprite.play('death');
  }

  /** Update death animation and hit flash */
  private updateVisuals(dt: number): void {
    // Hit flash timer
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
    }

    // Death: advance timer (sprite animation handles visuals)
    if (this.dead) {
      this.deathTimer += dt;
    }

    // Alert cooldown
    if (this.alertCooldown > 0) {
      this.alertCooldown -= dt;
    }

    // Update sprite animation
    this.sprite.update(dt);
  }

  update(dt: number, cameraPosition?: THREE.Vector3): void {
    if (!this.dead) {
      this.stateMachine.update(this, dt);
      this.updateFacing(dt);
    }
    this.updateVisuals(dt);

    // Billboard the sprite toward camera
    if (cameraPosition) {
      this.sprite.billboardToCamera(cameraPosition, this.group.position);
    }
  }
}
