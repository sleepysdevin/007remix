import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';
import { EventBus } from '../core/event-bus';
import { EnemyBase } from './enemy-base';
import { perceivePlayer, type PerceptionResult } from './ai/perception';
import { createIdleState } from './ai/states/idle-state';
import { createPatrolState } from './ai/states/patrol-state';
import { createAlertState } from './ai/states/alert-state';
import { createAttackState } from './ai/states/attack-state';
import { playGunshot } from '../audio/sound-effects';

const ALERT_PROPAGATION_RANGE = 12;
const DEAD_REMOVAL_TIME = 5;

export interface EnemySpawn {
  x: number;
  y: number;
  z: number;
  facingAngle: number;
  /** Optional patrol path. When set, enemy starts in patrol state. */
  waypoints?: { x: number; z: number }[];
}

export class EnemyManager {
  private enemies: EnemyBase[] = [];
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private events: EventBus;

  // Player state — set externally each frame
  private playerPos = new THREE.Vector3();
  private cameraPos = new THREE.Vector3();
  private playerCollider: RAPIER.Collider;
  private playerIsMoving = false;
  private playerFiredRecently = false;
  private playerFiredTimer = 0;

  // Pooled muzzle flash lights for enemy shots (reuse instead of create/destroy)
  private muzzleFlashPool: THREE.PointLight[] = [];
  private muzzleFlashTimers: number[] = [];

  // Callback for when enemy shoots the player
  onPlayerHit: ((damage: number, fromPos: THREE.Vector3) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    events: EventBus,
    playerCollider: RAPIER.Collider,
  ) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.playerCollider = playerCollider;

    // Pre-create a small pool of muzzle flash lights (max 4 concurrent)
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffaa33, 0, 8);
      light.visible = false;
      this.scene.add(light);
      this.muzzleFlashPool.push(light);
      this.muzzleFlashTimers.push(0);
    }

    // Listen for weapon fired events to track player gunshots
    this.events.on('weapon:fired', () => {
      this.playerFiredRecently = true;
      this.playerFiredTimer = 0.5;
    });
  }

  /** Spawn an enemy at the given position */
  spawnEnemy(spawn: EnemySpawn): EnemyBase {
    const enemy = new EnemyBase(
      this.physics,
      spawn.x, spawn.y, spawn.z,
      spawn.facingAngle,
    );
    if (spawn.waypoints?.length) {
      enemy.waypoints = [...spawn.waypoints];
    }

    // Register AI states
    enemy.stateMachine.addState(createIdleState(this));
    enemy.stateMachine.addState(createPatrolState(this));
    enemy.stateMachine.addState(createAlertState(this));
    enemy.stateMachine.addState(createAttackState(this));

    const startState = enemy.waypoints.length >= 2 ? 'patrol' : 'idle';
    enemy.stateMachine.transition(startState, enemy);

    this.enemies.push(enemy);
    this.scene.add(enemy.group);

    return enemy;
  }

  /** Update player state (called each frame from Game) */
  setPlayerState(
    pos: THREE.Vector3,
    isMoving: boolean,
  ): void {
    this.playerPos.copy(pos);
    this.playerIsMoving = isMoving;
  }

  getPlayerPosition(): THREE.Vector3 {
    return this.playerPos;
  }

  /** Update camera position for sprite billboarding */
  setCameraPosition(pos: THREE.Vector3): void {
    this.cameraPos.copy(pos);
  }

  /** Get perception result for an enemy */
  getPerception(enemy: EnemyBase): PerceptionResult | null {
    if (enemy.dead) return null;
    return perceivePlayer(
      enemy,
      this.playerPos,
      this.playerCollider,
      this.physics,
      this.playerIsMoving,
      this.playerFiredRecently,
    );
  }

  /** Sync enemy mesh position to physics body */
  syncPhysicsBody(enemy: EnemyBase): void {
    const pos = enemy.group.position;
    const bodyH = 0.7 + 0.3; // half height + radius
    enemy.rigidBody.setNextKinematicTranslation(
      new RAPIER.Vector3(pos.x, pos.y + bodyH, pos.z),
    );
  }

  /** Alert nearby enemies when one spots the player */
  propagateAlert(sourceEnemy: EnemyBase): void {
    if (sourceEnemy.alertCooldown > 0) return;
    sourceEnemy.alertCooldown = 2;

    for (const enemy of this.enemies) {
      if (enemy === sourceEnemy || enemy.dead) continue;
      const dist = enemy.group.position.distanceTo(sourceEnemy.group.position);
      if (dist <= ALERT_PROPAGATION_RANGE) {
        const state = enemy.stateMachine.currentName;
        if (state === 'idle') {
          enemy.lastKnownPlayerPos = sourceEnemy.lastKnownPlayerPos?.clone() ?? null;
          enemy.stateMachine.transition('alert', enemy);
        }
      }
    }
  }

  /** Fire at the player from an enemy (called by attack state) */
  enemyFireAtPlayer(enemy: EnemyBase): void {
    const enemyPos = enemy.getHeadPosition();
    const dir = new THREE.Vector3()
      .subVectors(this.playerPos, enemyPos)
      .normalize();

    // Apply accuracy spread
    dir.x += (Math.random() - 0.5) * enemy.accuracy;
    dir.y += (Math.random() - 0.5) * enemy.accuracy * 0.5;
    dir.z += (Math.random() - 0.5) * enemy.accuracy;
    dir.normalize();

    // Raycast to see if bullet hits player
    const hit = this.physics.castRay(
      enemyPos.x, enemyPos.y, enemyPos.z,
      dir.x, dir.y, dir.z,
      30,
      enemy.collider,
    );

    // Visual: muzzle flash on enemy
    this.flashEnemyMuzzle(enemyPos);

    // Audio (quieter than player gunshot)
    playGunshot();

    if (hit) {
      // Check if the hit collider is the player's
      if (hit.collider.handle === this.playerCollider.handle) {
        this.onPlayerHit?.(enemy.damage, enemyPos);
      }
    }
  }

  private flashEnemyMuzzle(pos: THREE.Vector3): void {
    // Grab an idle light from the pool (or reuse oldest)
    let idx = this.muzzleFlashTimers.findIndex(t => t <= 0);
    if (idx === -1) idx = 0; // reuse first if all busy
    const light = this.muzzleFlashPool[idx];
    light.position.copy(pos);
    light.intensity = 20;
    light.visible = true;
    this.muzzleFlashTimers[idx] = 0.06;
  }

  /** Check if a Rapier collider belongs to an enemy, and if so return that enemy */
  getEnemyByCollider(collider: RAPIER.Collider): EnemyBase | null {
    for (const enemy of this.enemies) {
      if (enemy.collider.handle === collider.handle) return enemy;
    }
    return null;
  }

  update(dt: number): void {
    // Update player fired timer
    if (this.playerFiredTimer > 0) {
      this.playerFiredTimer -= dt;
      if (this.playerFiredTimer <= 0) {
        this.playerFiredRecently = false;
      }
    }

    // Fade pooled muzzle flash lights
    for (let i = 0; i < this.muzzleFlashPool.length; i++) {
      if (this.muzzleFlashTimers[i] > 0) {
        this.muzzleFlashTimers[i] -= dt;
        if (this.muzzleFlashTimers[i] <= 0) {
          this.muzzleFlashPool[i].visible = false;
          this.muzzleFlashPool[i].intensity = 0;
        } else {
          this.muzzleFlashPool[i].intensity = (this.muzzleFlashTimers[i] / 0.06) * 20;
        }
      }
    }

    // Update all enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, this.cameraPos);

      // Remove dead enemies after delay
      if (enemy.dead) {
        if (enemy.deathTimer > DEAD_REMOVAL_TIME) {
          this.scene.remove(enemy.group);
          // Note: we leave the physics body for now (it sinks below floor)
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  get aliveCount(): number {
    return this.enemies.filter((e) => !e.dead).length;
  }

  get totalCount(): number {
    return this.enemies.length;
  }
}
