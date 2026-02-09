import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';

const ALERT_DURATION = 2.0; // Seconds before going back to idle if player not found
const MOVE_SPEED = 2.5;

/**
 * Alert state: enemy heard something or was alerted by a nearby guard.
 * Turns toward the sound, moves toward last known position.
 * Transitions to 'attack' if player is spotted, or back to 'idle' after timeout.
 */
export function createAlertState(manager: EnemyManager): State<EnemyBase> {
  let timer = 0;

  return {
    name: 'alert',

    enter(enemy) {
      timer = ALERT_DURATION;
      enemy.sprite.play('alert');
      // Turn toward last known player position
      if (enemy.lastKnownPlayerPos) {
        enemy.lookAt(enemy.lastKnownPlayerPos);
      }
      // Alert nearby enemies
      manager.propagateAlert(enemy);
    },

    update(enemy, dt) {
      timer -= dt;

      // Check perception
      const perception = manager.getPerception(enemy);
      if (perception?.canSeePlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('attack', enemy);
        return;
      }

      // Move toward last known position
      if (enemy.lastKnownPlayerPos) {
        const pos = enemy.group.position;
        const dir = new THREE.Vector3()
          .subVectors(enemy.lastKnownPlayerPos, pos);
        dir.y = 0;
        const dist = dir.length();

        if (dist > 1) {
          dir.normalize();
          enemy.lookAt(enemy.lastKnownPlayerPos);

          // Move
          pos.x += dir.x * MOVE_SPEED * dt;
          pos.z += dir.z * MOVE_SPEED * dt;

          // Sync physics body
          manager.syncPhysicsBody(enemy);
        } else {
          // Reached last known position, look around
          enemy.targetFacingAngle += dt * 2;
        }
      }

      // Timeout — go back to idle
      if (timer <= 0) {
        enemy.stateMachine.transition('idle', enemy);
      }

      // If took damage, go straight to attack
      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        timer = ALERT_DURATION; // Reset timer
      }
    },

    exit() {},
  };
}
