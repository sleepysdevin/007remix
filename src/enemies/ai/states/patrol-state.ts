import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';

const PATROL_SPEED = 1.8;
const WAYPOINT_RADIUS = 0.6;

/**
 * Patrol state: walk between waypoints when idle.
 * Transitions to alert/attack on perception.
 */
export function createPatrolState(manager: EnemyManager): State<EnemyBase> {
  let waypointIndex = 0;

  return {
    name: 'patrol',

    enter(enemy) {
      if (enemy.waypoints.length === 0) return;
      waypointIndex = 0;
      enemy.sprite.play('walk');
      const first = enemy.waypoints[0];
      enemy.lookAt(new THREE.Vector3(first.x, enemy.group.position.y, first.z));
    },

    update(enemy, dt) {
      // Check perception first
      const perception = manager.getPerception(enemy);
      if (perception?.canSeePlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('attack', enemy);
        return;
      }
      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('alert', enemy);
        return;
      }

      if (enemy.waypoints.length < 2) {
        enemy.stateMachine.transition('idle', enemy);
        return;
      }

      const pos = enemy.group.position;
      const target = enemy.waypoints[waypointIndex];
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= WAYPOINT_RADIUS) {
        waypointIndex = (waypointIndex + 1) % enemy.waypoints.length;
      } else {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        enemy.lookAt(new THREE.Vector3(target.x, pos.y, target.z));
        pos.x += dir.x * PATROL_SPEED * dt;
        pos.z += dir.z * PATROL_SPEED * dt;
        manager.syncPhysicsBody(enemy);
      }
    },

    exit() {},
  };
}
