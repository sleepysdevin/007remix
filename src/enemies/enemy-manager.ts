// src/enemies/enemy-manager.ts
import * as THREE from 'three';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { EventBus } from '../core/event-bus';
import { PhysicsWorld } from '../core/physics-world';
import { EnemyBase } from './enemy-base';
import { createAttackState } from './ai/states/attack-state';
import { createPatrolState } from './ai/states/patrol-state';
import { createAlertState } from './ai/states/alert-state';
import { createIdleState } from './ai/states/idle-state';
import { createDeadState } from './ai/states/dead-state';
import { perceivePlayer, type PerceptionResult } from './ai/perception';
import { GUARD_VARIANTS, type GuardVariant } from './sprite/guard-sprite-sheet';

export type EnemyObject = EnemyBase;

export interface EnemySpawn {
  id?: string;
  x: number;
  y: number;
  z: number;
  facingAngle?: number;
  waypoints?: Array<{ x: number; y: number; z: number }>;
  variant?: GuardVariant;
  firstShotDelay?: number;
  health?: number;
  speed?: number;
  roomBounds?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

const DEFAULT_VARIANT: GuardVariant = GUARD_VARIANTS.guard;

// Ground detection tuning
// IMPORTANT: must start INSIDE the room (below ceiling). yHint is near floor
// level already, so 1.5 above keeps us well below any ceiling (height >= 3).
const SPAWN_RAY_START_ABOVE = 1.5;
const SPAWN_RAY_LEN = 5.0;
const FEET_EPS = 0.02;              // tiny lift so feet don’t z-fight
const ENEMY_MIN_SEPARATION = 0.95;
const ENEMY_SEPARATION_STRENGTH = 2.4;
const ENEMY_SPEED_SCALE = 0.75;



export class EnemyManager {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private events: EventBus;
  private playerCollider: RAPIER.Collider;

  private enemies: EnemyObject[] = [];
  private enemyByColliderHandle = new Map<number, EnemyObject>();

  private playerPos = new THREE.Vector3();
  private playerMoving = false;
  private playerFiredRecently = false;
  private playerFiredTimer = 0;

  private cameraPos = new THREE.Vector3();

  onPlayerHit: ((damage: number) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    events: EventBus,
    playerCollider: RAPIER.Collider
  ) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.playerCollider = playerCollider;

    // Optional: listen for weapon fire to make enemies “hear” it.
    // If your EventBus emits 'weapon:fired', this keeps hearing consistent.
    this.events.on?.('weapon:fired', () => {
      this.playerFiredRecently = true;
      this.playerFiredTimer = 0.25; // gunshot audible window
    });
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }

  getPhysics(): PhysicsWorld {
    return this.physics;
  }

  getPlayerPosition(): THREE.Vector3 {
    return this.playerPos;
  }

  setCameraPosition(pos: THREE.Vector3): void {
    this.cameraPos.copy(pos);
  }

  setPlayerState(pos: THREE.Vector3, isMoving: boolean): void {
    this.playerPos.copy(pos);
    this.playerMoving = isMoving;
  }

  setPlayerCollider(collider: RAPIER.Collider): void {
    this.playerCollider = collider;
  }

  /** If you have separate logic for player shots, call this from weapon code too. */
  notifyPlayerFired(): void {
    this.playerFiredRecently = true;
    this.playerFiredTimer = 0.25;
  }

  spawnEnemy(spawn: EnemySpawn): EnemyObject {
    const id = spawn.id ?? `enemy_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const variant = spawn.variant ?? DEFAULT_VARIANT;
    const adjusted = this.findNonOverlappingSpawn(spawn.x, spawn.z, spawn.roomBounds);

    // ✅ Find ground
    const feetY = this.getGroundFeetY(adjusted.x, spawn.y, adjusted.z);

    const enemy = new EnemyBase(this.physics, variant, adjusted.x, feetY, adjusted.z, spawn.roomBounds);

    // facing
    if (typeof spawn.facingAngle === 'number') {
      enemy.group.rotation.y = spawn.facingAngle;
    }

    // attach helpers to enemy object used by states (non-schema)
    (enemy as any).id = id;
    enemy.waypoints = spawn.waypoints ?? [];
    enemy.firstShotDelay = (spawn.firstShotDelay ?? 0) + Math.random() * 0.35;
    if (Number.isFinite(spawn.health)) {
      const health = Math.max(1, Number(spawn.health));
      enemy.maxHealth = health;
      enemy.health = health;
    }
    if (Number.isFinite(spawn.speed)) {
      enemy.moveSpeed = Math.max(0.5, Number(spawn.speed) * ENEMY_SPEED_SCALE);
    }
    enemy.moveSpeed *= 0.9 + Math.random() * 0.2;

    // State machine setup
    enemy.stateMachine.addState(createIdleState(this));
    enemy.stateMachine.addState(createPatrolState(this));
    enemy.stateMachine.addState(createAlertState(this));
    enemy.stateMachine.addState(createAttackState(this));
    enemy.stateMachine.addState(createDeadState());
    (enemy as any)._perception = {
      canSeePlayer: false,
      canHearPlayer: false,
      distanceToPlayer: Number.POSITIVE_INFINITY,
      directionToPlayer: new THREE.Vector3(0, 0, 1),
    };
    enemy.stateMachine.transition('patrol', enemy);

    // Track + add to scene
    this.enemies.push(enemy);
    this.scene.add(enemy.group);

    this.enemyByColliderHandle.set(enemy.collider.handle, enemy);

    return enemy;
  }

  private findNonOverlappingSpawn(
    x: number,
    z: number,
    roomBounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
  ): { x: number; z: number } {
    const minDist = 2.0;
    const minDistSq = minDist * minDist;
    const maxAttempts = 12;

    const clampToRoom = (valueX: number, valueZ: number): { x: number; z: number } => {
      if (!roomBounds) return { x: valueX, z: valueZ };
      return {
        x: Math.min(roomBounds.maxX, Math.max(roomBounds.minX, valueX)),
        z: Math.min(roomBounds.maxZ, Math.max(roomBounds.minZ, valueZ)),
      };
    };

    const clampedStart = clampToRoom(x, z);
    let candidateX = clampedStart.x;
    let candidateZ = clampedStart.z;
    for (let i = 0; i < maxAttempts; i++) {
      let overlaps = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = candidateX - e.group.position.x;
        const dz = candidateZ - e.group.position.z;
        if ((dx * dx + dz * dz) < minDistSq) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) return { x: candidateX, z: candidateZ };

      const angle = Math.random() * Math.PI * 2;
      const radius = minDist * (0.8 + Math.random() * 0.8);
      const candidate = clampToRoom(
        clampedStart.x + Math.cos(angle) * radius,
        clampedStart.z + Math.sin(angle) * radius,
      );
      candidateX = candidate.x;
      candidateZ = candidate.z;
    }

    return clampedStart;
  }

  /** Called BEFORE physics.step() each fixed tick */
  fixedUpdate(dt: number): void {
    // update gunshot “hearing” timer
    if (this.playerFiredRecently) {
      this.playerFiredTimer -= dt;
      if (this.playerFiredTimer <= 0) {
        this.playerFiredRecently = false;
        this.playerFiredTimer = 0;
      }
    }

    // 1) Mutate bodies first (state updates may call move/stop).
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.stateMachine.update(e, dt);
    }

    this.applyEnemySeparation();

    for (const e of this.enemies) {
      if (e.dead) continue;
      e.applyMovement(dt);
    }

    // 2) Run physics queries after all mutations and cache for next tick.
    for (const e of this.enemies) {
      if (e.dead) continue;
      const perception = perceivePlayer(
        e,
        this.playerPos,
        this.playerCollider as any,
        this.physics,
        this.playerMoving,
        this.playerFiredRecently
      );
      (e as any)._perception = perception;
      if (perception.canSeePlayer) {
        e.lookAt(this.playerPos);
      }
    }
  }

  /** Called AFTER physics.step() each fixed tick */
  syncFromPhysics(): void {
    for (const e of this.enemies) {
      e.syncFromPhysics();
    }
  }

  /** Visual-only update (anim, muzzle flash timers, etc.) */
  update(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt);
      if (e.isReadyToDespawn()) {
        this.removeEnemyPhysics(e);
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
      }
    }
  }

  getPerception(enemy: EnemyObject): PerceptionResult | null {
    return ((enemy as any)._perception as PerceptionResult) ?? null;
  }

  propagateAlert(source: EnemyObject): void {
    const srcPos = source.group.position;
    const ALERT_RADIUS = 10;

    for (const e of this.enemies) {
      if (e === source || e.dead) continue;
      const dx = e.group.position.x - srcPos.x;
      const dz = e.group.position.z - srcPos.z;
      if (dx * dx + dz * dz <= ALERT_RADIUS * ALERT_RADIUS) {
        // do not spam transitions if already attacking
        if (e.stateMachine.currentName !== 'attack') {
          e.lastKnownPlayerPos = this.playerPos.clone();
          e.stateMachine.transition('alert', e);
        }
      }
    }
  }

  enemyFireAtPlayer(enemy: EnemyObject): void {
    // You can add hit chance / ray to player here.
    // Keep it simple: damage player if enemy is in attack state and perception says can see.
    const p = this.getPerception(enemy);
    if (!p?.canSeePlayer) return;

    // simple accuracy / “roll”
    const dist = p.distanceToPlayer;
    const baseHitChance = 0.8;
    const distPenalty = Math.min(0.4, dist / 25);
    const spreadPenalty = Math.min(0.4, enemy.accuracy * 2);
    const hitChance = Math.max(0.25, baseHitChance - distPenalty - spreadPenalty);

    if (Math.random() <= hitChance) {
      this.onPlayerHit?.(enemy.damage);
    }
  }

  getEnemyByCollider(collider: RAPIER.Collider): EnemyObject | null {
    return this.enemyByColliderHandle.get(collider.handle) ?? null;
  }

  getEnemyByColliderHandle(colliderHandle: number): EnemyObject | null {
    return this.enemyByColliderHandle.get(colliderHandle) ?? null;
  }

  removeEnemyPhysics(enemy: EnemyObject): void {
    // Remove collider/body so player doesn’t snag
    try {
      this.physics.removeCollider(enemy.collider, true);
    } catch {}
    try {
      const body = enemy.getRigidBody();
      if (body) this.physics.removeRigidBody(body);
    } catch {}

    this.enemyByColliderHandle.delete(enemy.collider.handle);
  }

  damageEnemiesInRadius(position: THREE.Vector3, radius: number, damage: number): void {
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.group.position.x - position.x;
      const dy = e.group.position.y - position.y;
      const dz = e.group.position.z - position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= r2) {
        const falloff = 1 - Math.sqrt(d2) / radius;
        e.takeDamage(damage * falloff);
        if (e.dead) {
          this.removeEnemyPhysics(e);
        }
      }
    }
  }

  /**
   * ✅ Robust ground placement.
   * This is the function you were asking about — it’s in EnemyManager.
   */
  private getGroundFeetY(x: number, yHint: number, z: number): number {
    const startY = yHint + SPAWN_RAY_START_ABOVE;

    const hit = this.physics.castRay(
      x,
      startY,
      z,
      0,
      -1,
      0,
      SPAWN_RAY_LEN,
    );

    if (!hit) {
      console.warn(
        `[EnemyManager] No ground hit at (${x.toFixed(2)},${yHint.toFixed(2)},${z.toFixed(2)}). ` +
          `Ray from y=${startY.toFixed(2)} to ${(startY - SPAWN_RAY_LEN).toFixed(2)}. Using yHint.`
      );
      return yHint;
    }

    // direction is (0,-1,0): hitY = startY - toi
    const feetY = startY - hit.toi + FEET_EPS;
    return feetY;
  }

  private applyEnemySeparation(): void {
    const n = this.enemies.length;
    const sepVx = new Array<number>(n).fill(0);
    const sepVz = new Array<number>(n).fill(0);
    const minSepSq = ENEMY_MIN_SEPARATION * ENEMY_MIN_SEPARATION;

    for (let i = 0; i < n; i++) {
      const a = this.enemies[i];
      if (!a || a.dead) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.enemies[j];
        if (!b || b.dead) continue;

        const dx = a.group.position.x - b.group.position.x;
        const dz = a.group.position.z - b.group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minSepSq) continue;

        const d = Math.sqrt(Math.max(0.000001, d2));
        const overlap = ENEMY_MIN_SEPARATION - d;
        let nx = dx / d;
        let nz = dz / d;
        if (!Number.isFinite(nx) || !Number.isFinite(nz)) {
          nx = Math.random() > 0.5 ? 1 : -1;
          nz = 0;
        }

        const force = overlap * ENEMY_SEPARATION_STRENGTH;
        sepVx[i] += nx * force;
        sepVz[i] += nz * force;
        sepVx[j] -= nx * force;
        sepVz[j] -= nz * force;
      }
    }

    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      if (!e || e.dead) continue;
      e.setSeparationVelocity(sepVx[i], sepVz[i]);
    }
  }
}
