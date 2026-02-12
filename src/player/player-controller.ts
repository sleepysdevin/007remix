import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { InputManager } from '../core/input-manager';
import { PhysicsWorld, GROUP_PLAYER, GROUP_WORLD, GROUP_ENEMY, createCollisionFilter } from '../core/physics-world';
import { FPSCamera } from './fps-camera';

const MOVE_SPEED = 6;
const SPRINT_MULTIPLIER = 1.65;
const CROUCH_SPEED_MULTIPLIER = 0.4;

const JUMP_VELOCITY = 5;
const GRAVITY = -18; // stronger than Rapier default, since we drive Y ourselves

const PLAYER_RADIUS = 0.3;
const PLAYER_HALF_HEIGHT = 0.6;
const CROUCH_HALF_HEIGHT = 0.35;

const EYE_HEIGHT = 1.65;
const EYE_HEIGHT_CROUCH = 1.0;

// Grounding
const GROUND_RAY_EPS = 0.06;        // how far above bottom to start ray
const GROUND_RAY_LENGTH = 0.22;     // how far down to check
const GROUND_STICK_VELOCITY = -1.2; // small downward velocity while grounded to stay pinned

export class PlayerController {
  private bodyHandle: number;
  private collider: RAPIER.Collider;

  // We control vertical velocity ourselves (gravity/jump)
  private verticalVelocity = 0;
  private grounded = false;

  // Cached position for render + other systems (avoid aliasing issues)
  private position = new THREE.Vector3();
  private lastPosition = new THREE.Vector3();
  private velocity = new THREE.Vector3();

  // Input state
  private moveInput = new THREE.Vector3();
  private jumpRequested = false;
  private sprinting = false;

  health = 100;
  armor = 0;
  maxHealth = 100;
  maxArmor = 100;

  private keys = new Set<string>();
  private dead = false;

  private crouching = false;
  private crouchTransition = 0;
  private currentHalfHeight = PLAYER_HALF_HEIGHT;

  constructor(
    private physics: PhysicsWorld,
    private fpsCamera: FPSCamera,
    spawnX: number,
    spawnY: number,
    spawnZ: number,
  ) {
    const { world, rapier } = physics;

    // Dynamic body with custom gravity handling
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY + PLAYER_HALF_HEIGHT + PLAYER_RADIUS, spawnZ)
      .lockRotations()
      .setLinearDamping(0.5) // Reduced damping for more responsive movement
      .setAngularDamping(0.5)
      .setCcdEnabled(true) // Continuous collision detection
      .setGravityScale(0); // We handle gravity manually
      
    // Create body
    const body = world.createRigidBody(bodyDesc);
    this.bodyHandle = body.handle;

    // Configure collider with appropriate settings
    const colliderDesc = rapier.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
      .setDensity(1.0)
      .setFriction(0.2) // Slight friction for better ground feel
      .setRestitution(0.1) // Small bounce
      .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);

    // Set up collision groups
    const collisionGroups = createCollisionFilter(GROUP_PLAYER, GROUP_WORLD | GROUP_ENEMY);
    colliderDesc.setCollisionGroups(collisionGroups);
    colliderDesc.setSolverGroups(collisionGroups);

    // Create the collider and store it
    this.collider = world.createCollider(colliderDesc, body);

    // Initialize cached position and sync with physics
    this.syncFromPhysics();
  }

  /**
   * Call this AFTER `physics.step()` (once per fixed step).
   * It refreshes cached position safely, and keeps camera glued to the body.
   */
  syncFromPhysics(): void {
    const body = this.physics.world.getRigidBody(this.bodyHandle);
    if (!body) return;
    const t = body.translation(); // read once
    const x = t.x;
    const y = t.y;
    const z = t.z;
    (t as any).free?.();

    this.lastPosition.copy(this.position);
    this.position.set(x, y, z);

    const v = body.linvel();
    this.velocity.set(v.x, v.y, v.z);
    (v as any).free?.();

    // Ground query after sync avoids query+mutation overlap in the same update path.
    this.grounded = this.checkGrounded(x, y, z);

    // Update camera position based on capsule + crouch lerp
    const capsuleBottom = this.position.y - (this.currentHalfHeight + PLAYER_RADIUS);
    const standEyeY = capsuleBottom + EYE_HEIGHT;
    const crouchEyeY = capsuleBottom + EYE_HEIGHT_CROUCH;
    const eyeY = standEyeY + (crouchEyeY - standEyeY) * this.crouchTransition;
    this.fpsCamera.setPosition(this.position.x, eyeY, this.position.z);
  }

  updateInput(input: InputManager): void {
    this.moveInput.set(0, 0, 0);
    if (this.dead) return;

    if (input.wasKeyJustPressed('c')) {
      this.crouching = !this.crouching;
    }

    // Get camera directions BUT flatten to XZ so looking up/down doesn’t push movement
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.fpsCamera.getForward(forward);
    this.fpsCamera.getRight(right);

    forward.y = 0;
    right.y = 0;

    if (forward.lengthSq() > 0) forward.normalize();
    if (right.lengthSq() > 0) right.normalize();

    if (input.isKeyDown('w')) this.moveInput.add(forward);
    if (input.isKeyDown('s')) this.moveInput.sub(forward);
    if (input.isKeyDown('d')) this.moveInput.add(right);
    if (input.isKeyDown('a')) this.moveInput.sub(right);

    if (this.moveInput.lengthSq() > 0) this.moveInput.normalize();

    this.jumpRequested = input.wasKeyJustPressed(' ');
    this.sprinting = input.isKeyDown('shift') && !this.crouching;
  }

  update(dt: number): void {
    this.updatePhysics(dt);
  }

  updatePhysics(dt: number): void {
    if (this.dead) return;

    // Update crouch state first as it affects the collider
    this.updateCrouchState(dt);

    // Use cached values from last sync step to avoid read+mutate aliasing.
    const currentVx = this.velocity.x;
    const currentVz = this.velocity.z;

    // Use previous frame's ground state for this step; refresh at end.
    const wasGrounded = this.grounded;

    // 2) Handle jumping and gravity
    if (wasGrounded) {
      // Reset vertical velocity when grounded to prevent bouncing
      if (this.verticalVelocity <= 0) {
        this.verticalVelocity = -0.5; // Small negative value to keep grounded
      }

      // Handle jump input
      if (this.jumpRequested && !this.crouching) {
        this.verticalVelocity = JUMP_VELOCITY;
        this.grounded = false;
      }
    } else {
      // Apply gravity when in air
      this.verticalVelocity += GRAVITY * dt;
      
      // Apply air resistance (damping)
      this.verticalVelocity *= Math.pow(0.99, dt * 60);
      
      // Terminal velocity
      this.verticalVelocity = Math.max(-30, this.verticalVelocity);
    }
    this.jumpRequested = false;

    // 3) Calculate movement forces
    const speed = this.getCurrentMoveSpeed();
    const targetVx = this.moveInput.x * speed;
    const targetVz = this.moveInput.z * speed;
    
    // Get current horizontal velocity
    // Apply acceleration based on ground/air state
    const acceleration = wasGrounded ? 30.0 : 10.0;
    const maxSpeedChange = acceleration * dt;
    
    // Smoothly interpolate towards target velocity
    const newVx = this.moveInput.lengthSq() > 0.01 
      ? this.lerp(currentVx, targetVx, maxSpeedChange)
      : this.lerp(currentVx, 0, maxSpeedChange * 2); // Faster stop
      
    const newVz = this.moveInput.lengthSq() > 0.01
      ? this.lerp(currentVz, targetVz, maxSpeedChange)
      : this.lerp(currentVz, 0, maxSpeedChange * 2); // Faster stop

    const finalVy =
      wasGrounded && this.moveInput.lengthSq() > 0.01
        ? Math.min(this.verticalVelocity, -0.1)
        : this.verticalVelocity;
    const body = this.physics.world.getRigidBody(this.bodyHandle);
    if (!body) return;
    body.setLinvel({ x: newVx, y: finalVy, z: newVz }, true);

    // Keep cache coherent until next syncFromPhysics.
    this.velocity.set(newVx, finalVy, newVz);

  }
  
  // Helper method for smooth interpolation
  private lerp(start: number, end: number, amount: number): number {
    return start + (end - start) * Math.min(amount, 1.0);
  }

  private checkGrounded(x: number, y: number, z: number): boolean {
    // Capsule bottom in world space
    const bottomY = y - (this.currentHalfHeight + PLAYER_RADIUS);

    // Ray starts slightly above bottom, points down
    const originY = bottomY + GROUND_RAY_EPS;

    const hit = this.physics.castRay(
      x,
      originY,
      z,
      0,
      -1,
      0,
      GROUND_RAY_LENGTH,
      this.collider, // exclude self collider
    );

    return hit !== null;
  }

  private updateCrouchState(dt: number): void {
    const targetTransition = this.crouching ? 1 : 0;
    this.crouchTransition += (targetTransition - this.crouchTransition) * Math.min(1, dt * 12);

    const targetHalfHeight = this.crouching ? CROUCH_HALF_HEIGHT : PLAYER_HALF_HEIGHT;
    if (targetHalfHeight === this.currentHalfHeight) return;

    // Maintain bottom position while resizing capsule
    const tx = this.position.x;
    const ty = this.position.y;
    const tz = this.position.z;
    const oldBottom = ty - (this.currentHalfHeight + PLAYER_RADIUS);

    this.currentHalfHeight = targetHalfHeight;

    // Recreate collider (same body) with collision groups preserved
    const collisionGroups = createCollisionFilter(GROUP_PLAYER, GROUP_WORLD | GROUP_ENEMY);

    this.physics.world.removeCollider(this.collider, true);
    const colliderDesc = this.physics.rapier.ColliderDesc.capsule(this.currentHalfHeight, PLAYER_RADIUS)
      .setDensity(1.0)
      .setFriction(0.0)
      .setRestitution(0.0)
      .setCollisionGroups(collisionGroups)
      .setSolverGroups(collisionGroups);

    const body = this.physics.world.getRigidBody(this.bodyHandle);
    if (!body) return;
    this.collider = this.physics.world.createCollider(colliderDesc, body);

    // Adjust body Y so the bottom stays fixed
    const newY = oldBottom + this.currentHalfHeight + PLAYER_RADIUS;
    body.setTranslation({ x: tx, y: newY, z: tz }, true);
    this.position.set(tx, newY, tz);

    // If we were grounded, keep vertical stable
    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = GROUND_STICK_VELOCITY;
    }
  }

  private getCurrentMoveSpeed(): number {
    let speed = MOVE_SPEED;
    if (this.sprinting) speed *= SPRINT_MULTIPLIER;
    else if (this.crouching) speed *= CROUCH_SPEED_MULTIPLIER;
    return speed;
  }

  get isCrouching(): boolean {
    return this.crouching || this.crouchTransition > 0.1;
  }

  getPosition(): { x: number; y: number; z: number } {
    // Use cached position (avoids Rapier aliasing issues)
    return { x: this.position.x, y: this.position.y, z: this.position.z };
  }

  setPosition(x: number, y: number, z: number): void {
    this.crouching = false;
    this.crouchTransition = 0;

    // Restore standing collider if needed
    if (this.currentHalfHeight !== PLAYER_HALF_HEIGHT) {
      const collisionGroups = createCollisionFilter(GROUP_PLAYER, GROUP_WORLD | GROUP_ENEMY);
      this.physics.world.removeCollider(this.collider, true);
      const colliderDesc = this.physics.rapier.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
        .setCollisionGroups(collisionGroups)
        .setSolverGroups(collisionGroups);
      const body = this.physics.world.getRigidBody(this.bodyHandle);
      if (!body) return;
      this.collider = this.physics.world.createCollider(colliderDesc, body);
      this.currentHalfHeight = PLAYER_HALF_HEIGHT;
    }

    const bodyY = y + PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
    const body = this.physics.world.getRigidBody(this.bodyHandle);
    if (!body) return;
    body.setTranslation({ x, y: bodyY, z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.velocity.set(0, 0, 0);

    this.verticalVelocity = 0;
    this.grounded = false;

    this.syncFromPhysics();
  }

  hasKey(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  getKeys(): string[] {
    return Array.from(this.keys);
  }

  giveKey(keyId: string): void {
    this.keys.add(keyId);
  }

  getCollider(): RAPIER.Collider {
    return this.collider;
  }

  takeDamage(amount: number): void {
    if (this.armor > 0) {
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

  setDead(isDead: boolean): void {
    this.dead = isDead;
    if (isDead) {
      this.moveInput.set(0, 0, 0);
      const body = this.physics.world.getRigidBody(this.bodyHandle);
      if (!body) return;
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
    }
  }

  isDead(): boolean {
    return this.dead;
  }

  respawn(): void {
    this.dead = false;
    this.health = 100;
    this.armor = 0;
    this.verticalVelocity = 0;
  }
}
