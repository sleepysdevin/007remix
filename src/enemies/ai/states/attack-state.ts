import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';

const ENGAGE_RANGE = 18;
const PREFERRED_RANGE = 8;
const MOVE_SPEED = 2;
const LOSE_SIGHT_TIMEOUT = 3;

/**
 * Attack state: enemy has spotted the player.
 * Faces player, fires at intervals, strafes slightly.
 * If player is lost for a timeout, transitions to 'alert'.
 */
export function createAttackState(manager: EnemyManager): State<EnemyBase> {
  let lostSightTimer = 0;
  let strafeDir = 1;
  let strafeTimer = 0;

  return {
    name: 'attack',

    enter(enemy) {
      lostSightTimer = 0;
      strafeDir = Math.random() > 0.5 ? 1 : -1;
      strafeTimer = 1 + Math.random() * 2;
      enemy.sprite.play('shoot');
      // Alert nearby enemies immediately
      manager.propagateAlert(enemy);
    },

    update(enemy, dt) {
      const perception = manager.getPerception(enemy);
      const playerPos = manager.getPlayerPosition();

      if (perception?.canSeePlayer) {
        lostSightTimer = 0;
        enemy.lastKnownPlayerPos = playerPos.clone();

        // Face player
        enemy.lookAt(playerPos);

        // Fire at player
        const now = performance.now() / 1000;
        if (enemy.canFire(now)) {
          enemy.lastFireTime = now;
          manager.enemyFireAtPlayer(enemy);
        }

        // Movement: try to maintain preferred range + strafe
        const dist = perception.distanceToPlayer;
        const pos = enemy.group.position;
        const toPlayer = new THREE.Vector3()
          .subVectors(playerPos, pos).normalize();

        // Approach or retreat to preferred range
        let moveZ = 0;
        if (dist > PREFERRED_RANGE + 2) {
          moveZ = 1; // Advance
        } else if (dist < PREFERRED_RANGE - 2) {
          moveZ = -0.5; // Back up
        }

        // Strafe perpendicular to player direction
        strafeTimer -= dt;
        if (strafeTimer <= 0) {
          strafeDir *= -1;
          strafeTimer = 1 + Math.random() * 2;
        }

        const right = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
        pos.x += (toPlayer.x * moveZ + right.x * strafeDir * 0.5) * MOVE_SPEED * dt;
        pos.z += (toPlayer.z * moveZ + right.z * strafeDir * 0.5) * MOVE_SPEED * dt;

        manager.syncPhysicsBody(enemy);
      } else {
        // Lost sight of player
        lostSightTimer += dt;

        // Keep moving toward last known position
        if (enemy.lastKnownPlayerPos) {
          enemy.lookAt(enemy.lastKnownPlayerPos);
          const pos = enemy.group.position;
          const dir = new THREE.Vector3()
            .subVectors(enemy.lastKnownPlayerPos, pos);
          dir.y = 0;
          if (dir.length() > 1) {
            dir.normalize();
            pos.x += dir.x * MOVE_SPEED * dt;
            pos.z += dir.z * MOVE_SPEED * dt;
            manager.syncPhysicsBody(enemy);
          }
        }

        if (lostSightTimer >= LOSE_SIGHT_TIMEOUT) {
          enemy.stateMachine.transition('alert', enemy);
        }
      }

      // If hearing new gunshots, update last known pos
      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = playerPos.clone();
        lostSightTimer = 0;
      }
    },

    exit() {},
  };
}
