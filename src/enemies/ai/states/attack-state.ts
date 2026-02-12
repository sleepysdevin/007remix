import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyObject } from '../../enemy-manager';
import type { EnemyManager } from '../../enemy-manager';

const MIN_CHASE_DISTANCE = 0.35;
const LOSE_SIGHT_TIMEOUT = 3;
const SHOT_INTERVAL = 1.6;

interface AttackStateData {
  lostSightTimer: number;
  timeSeenPlayer: number;
  nextShotTime: number;
  fireAnimTimer: number;
  shotInterval: number;
  engageDistance: number;
  lateralMag: number;
  lateralDir: number;
  lateralTimer: number;
}

export function createAttackState(manager: EnemyManager): State<EnemyObject> {
  const state = new WeakMap<EnemyObject, AttackStateData>();

  const toPlayer = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const side = new THREE.Vector3();

  return {
    name: 'attack',

    enter(enemy) {
      const now = performance.now() / 1000;
      state.set(enemy, {
        lostSightTimer: 0,
        timeSeenPlayer: 0,
        nextShotTime: now + (enemy.firstShotDelay ?? 0),
        fireAnimTimer: 0,
        shotInterval: SHOT_INTERVAL * (0.75 + Math.random() * 0.5),
        engageDistance: MIN_CHASE_DISTANCE + Math.random() * 0.35,
        lateralMag: 0.06 + Math.random() * 0.12,
        lateralDir: Math.random() < 0.5 ? -1 : 1,
        lateralTimer: 0.25 + Math.random() * 0.6,
      });
      enemy.model.play('alert');
      manager.propagateAlert(enemy);
    },

    update(enemy, dt) {
      const s = state.get(enemy);
      if (!s) return;

      s.fireAnimTimer = Math.max(0, s.fireAnimTimer - dt);
      const perception = manager.getPerception(enemy);
      const playerPos = manager.getPlayerPosition();
      const now = performance.now() / 1000;

      if (perception?.canSeePlayer) {
        s.lostSightTimer = 0;
        s.timeSeenPlayer += dt;

        enemy.lastKnownPlayerPos = playerPos.clone();
        enemy.timeSinceSeenPlayer = s.timeSeenPlayer;

        toPlayer.subVectors(playerPos, enemy.group.position);
        toPlayer.y = 0;

        const dist = toPlayer.length();

        // face player
        enemy.lookAt(playerPos);
        const target = new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z);

        // Shoot using cached perception (LOS already resolved by perception pass).
        if (now >= s.nextShotTime && s.timeSeenPlayer > 0.4) {
          if (enemy.canFire()) {
            manager.enemyFireAtPlayer(enemy);
            enemy.model.play('shoot', true);
            (enemy.model as any).triggerMuzzleFlash?.();
            s.fireAnimTimer = 0.22;
            enemy.lastFireTime = now;
            s.nextShotTime = now + (s.shotInterval * (0.85 + Math.random() * 0.35));
          }
        }

        // Direct chase: face and run toward player, then hold near them.
        const chaseSpeed = enemy.moveSpeed * 1.2;
        if (dist > s.engageDistance) {
          s.lateralTimer -= dt;
          if (s.lateralTimer <= 0) {
            s.lateralTimer = 0.2 + Math.random() * 0.7;
            s.lateralDir = Math.random() < 0.5 ? -1 : 1;
            s.lateralMag = 0.05 + Math.random() * 0.15;
          }

          // Micro-weave to avoid synchronized movement while still advancing.
          side.set(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(s.lateralDir * s.lateralMag);
          moveDir.copy(toPlayer).normalize().add(side).normalize();

          if (s.fireAnimTimer <= 0) enemy.model.play('walk');
          enemy.move(moveDir, chaseSpeed, dt);
        } else {
          if (s.fireAnimTimer <= 0) enemy.model.play('alert');
          enemy.stop();
        }

        (enemy.model as any).setGunAim?.(target);

        return;
      }

      // lost sight
      s.lostSightTimer += dt;

      // go to last known
      if (enemy.lastKnownPlayerPos) {
        (enemy.model as any).clearGunAim?.();
        enemy.lookAt(enemy.lastKnownPlayerPos);

        toPlayer.subVectors(enemy.lastKnownPlayerPos, enemy.group.position);
        toPlayer.y = 0;

        if (toPlayer.length() > 0.6) {
          enemy.model.play('walk');
          enemy.move(toPlayer, enemy.moveSpeed, dt);
        } else {
          enemy.model.play('alert');
          enemy.stop();
          enemy.rotate(dt * 0.8);
        }
      } else {
        (enemy.model as any).clearGunAim?.();
        enemy.stop();
      }

      if (s.lostSightTimer >= LOSE_SIGHT_TIMEOUT) {
        enemy.stateMachine.transition('alert', enemy);
      }

      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = playerPos.clone();
        s.lostSightTimer = 0;
      }
    },

    exit(enemy) {
      (enemy.model as any).clearGunAim?.();
      state.delete(enemy);
      enemy.stop();
    },
  };
}
