import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { InputManager } from '../core/input-manager';
import { PhysicsWorld } from '../core/physics-world';
import { FPSCamera } from './fps-camera';

const MOVE_SPEED = 6;
const JUMP_VELOCITY = 5;
const GRAVITY = -15;
const PLAYER_RADIUS = 0.3;
const PLAYER_HALF_HEIGHT = 0.6;
const EYE_HEIGHT = 1.5; // From ground to camera

export class PlayerController {
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private characterController: RAPIER.KinematicCharacterController;
  private verticalVelocity = 0;
  private grounded = false;

  health = 100;
  armor = 0;
  maxHealth = 100;
  maxArmor = 100;

  /** Keys collected (e.g. 'red', 'blue') for locked doors */
  private keys = new Set<string>();

  constructor(
    private physics: PhysicsWorld,
    private fpsCamera: FPSCamera,
    spawnX: number,
    spawnY: number,
    spawnZ: number,
  ) {
    const { world, rapier } = physics;

    // Create kinematic body
    const bodyDesc = rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
      spawnX,
      spawnY + PLAYER_HALF_HEIGHT + PLAYER_RADIUS,
      spawnZ,
    );
    this.body = world.createRigidBody(bodyDesc);

    // Capsule collider
    const colliderDesc = rapier.ColliderDesc.capsule(
      PLAYER_HALF_HEIGHT,
      PLAYER_RADIUS,
    );
    this.collider = world.createCollider(colliderDesc, this.body);

    // Character controller for collision response
    this.characterController = world.createCharacterController(0.02);
    this.characterController.enableAutostep(0.3, 0.2, true);
    this.characterController.enableSnapToGround(0.3);
    this.characterController.setSlideEnabled(true);
  }

  update(input: InputManager, dt: number): void {
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.fpsCamera.getForward(forward);
    this.fpsCamera.getRight(right);

    // Compute desired horizontal movement
    const move = new THREE.Vector3(0, 0, 0);
    if (input.isKeyDown('w')) move.add(forward);
    if (input.isKeyDown('s')) move.sub(forward);
    if (input.isKeyDown('d')) move.add(right);
    if (input.isKeyDown('a')) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * dt);
    }

    // Vertical movement (gravity + jump)
    if (this.grounded && input.isKeyDown(' ')) {
      this.verticalVelocity = JUMP_VELOCITY;
      this.grounded = false;
    }

    this.verticalVelocity += GRAVITY * dt;
    move.y = this.verticalVelocity * dt;

    // Run Rapier character controller
    this.characterController.computeColliderMovement(
      this.collider,
      new RAPIER.Vector3(move.x, move.y, move.z),
    );

    this.grounded = this.characterController.computedGrounded();
    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }

    const corrected = this.characterController.computedMovement();
    const pos = this.body.translation();
    const newPos = {
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    };
    this.body.setNextKinematicTranslation(
      new RAPIER.Vector3(newPos.x, newPos.y, newPos.z),
    );

    // Position camera at eye height above the collider bottom
    const bodyPos = this.body.translation();
    const eyeY = bodyPos.y + PLAYER_HALF_HEIGHT + PLAYER_RADIUS - (PLAYER_HALF_HEIGHT * 2 + PLAYER_RADIUS * 2) + EYE_HEIGHT;
    this.fpsCamera.setPosition(bodyPos.x, eyeY, bodyPos.z);
  }

  getPosition(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  /** Teleport player (e.g. level spawn). */
  setPosition(x: number, y: number, z: number): void {
    const bodyY = y + PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
    this.body.setTranslation(
      new RAPIER.Vector3(x, bodyY, z),
      true,
    );
    const eyeY = bodyY - (PLAYER_HALF_HEIGHT * 2 + PLAYER_RADIUS * 2) + EYE_HEIGHT;
    this.fpsCamera.setPosition(x, eyeY, z);
  }

  hasKey(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  giveKey(keyId: string): void {
    this.keys.add(keyId);
  }

  getCollider(): RAPIER.Collider {
    return this.collider;
  }

  takeDamage(amount: number): void {
    if (this.armor > 0) {
      // Armor absorbs 60% of damage
      const armorAbsorb = Math.min(this.armor, amount * 0.6);
      this.armor -= armorAbsorb;
      amount -= armorAbsorb;
    }
    this.health = Math.max(0, this.health - amount);
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addArmor(amount: number): void {
    this.armor = Math.min(this.maxArmor, this.armor + amount);
  }
}
