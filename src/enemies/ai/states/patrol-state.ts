import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyObject } from '../../enemy-manager';
import type { EnemyManager } from '../../enemy-manager';

const WAYPOINT_RADIUS = 0.6;

export function createPatrolState(manager: EnemyManager): State<EnemyObject> {
  const state = new WeakMap<EnemyObject, { waypointIndex: number }>();
  const dir = new THREE.Vector3();

  return {
    name: 'patrol',

    enter(enemy) {
      if (enemy.waypoints.length === 0) return;
      state.set(enemy, { waypointIndex: 0 });
      enemy.model.play('walk');
      const first = enemy.waypoints[0];
      enemy.lookAt(new THREE.Vector3(first.x, enemy.group.position.y, first.z));
    },

    update(enemy, dt) {
      try {
        // Safety check
        if (enemy.dead || !enemy.group) {
          return;
        }

        const perception = manager.getPerception(enemy);
        if (perception?.canSeePlayer) {
          const playerPos = manager.getPlayerPosition();
          if (playerPos) {
            enemy.lastKnownPlayerPos = playerPos.clone();
            enemy.stateMachine.transition('attack', enemy);
          }
          return;
        }
        
        if (perception?.canHearPlayer) {
          const playerPos = manager.getPlayerPosition();
          if (playerPos) {
            enemy.lastKnownPlayerPos = playerPos.clone();
            enemy.stateMachine.transition('attack', enemy);
          }
          return;
        }

        const s = state.get(enemy) ?? { waypointIndex: 0 };
        if (!state.has(enemy)) state.set(enemy, s);

        if (!enemy.waypoints || enemy.waypoints.length < 2) {
          enemy.stateMachine.transition('idle', enemy);
          return;
        }

        const pos = enemy.group.position;
        const target = enemy.waypoints[s.waypointIndex];
        if (!target) {
          s.waypointIndex = 0;
          return;
        }

        dir.set(target.x - pos.x, 0, target.z - pos.z);
        const dist = dir.length();

        if (dist <= WAYPOINT_RADIUS) {
          s.waypointIndex = (s.waypointIndex + 1) % enemy.waypoints.length;
        } else if (enemy.canMove && enemy.canMove()) {
          try {
            enemy.model?.play?.('walk');
            enemy.lookAt(new THREE.Vector3(target.x, pos.y, target.z));
            enemy.move(dir, enemy.moveSpeed * 0.9, dt);
          } catch (moveError) {
            console.warn('Error in patrol movement:', moveError);
          }
        }
      } catch (error) {
        console.warn('Error in patrol state update:', error);
      }
    },

    exit(enemy) {
      state.delete(enemy);
      enemy.stop();
    },
  };
}
