import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyObject } from '../../enemy-manager';
import type { EnemyManager } from '../../enemy-manager';

const ALERT_DURATION = 2.0;
export function createAlertState(manager: EnemyManager): State<EnemyObject> {
  const state = new WeakMap<EnemyObject, { timer: number }>();
  const dir = new THREE.Vector3();

  return {
    name: 'alert',

    enter(enemy) {
      state.set(enemy, { timer: ALERT_DURATION });
      enemy.model.play('alert');
      if (enemy.lastKnownPlayerPos) enemy.lookAt(enemy.lastKnownPlayerPos);
      manager.propagateAlert(enemy);
    },

    update(enemy, dt) {
      const s = state.get(enemy);
      if (!s) return;
      s.timer -= dt;

      const perception = manager.getPerception(enemy);
      if (perception?.canSeePlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('attack', enemy);
        return;
      }

      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('attack', enemy);
        return;
      }

      if (enemy.lastKnownPlayerPos) {
        dir.subVectors(enemy.lastKnownPlayerPos, enemy.group.position);
        dir.y = 0;

        const dist = dir.length();
        if (dist > 1.0) {
          enemy.model.play('walk');
          enemy.lookAt(enemy.lastKnownPlayerPos);
          enemy.move(dir, enemy.moveSpeed, dt);
        } else {
          enemy.model.play('alert');
          enemy.stop();
          enemy.rotate(dt * 0.8);
        }
      } else {
        enemy.stop();
      }

      if (s.timer <= 0) {
        enemy.stateMachine.transition('idle', enemy);
      }

    },

    exit(enemy) {
      state.delete(enemy);
      enemy.stop();
    },
  };
}
