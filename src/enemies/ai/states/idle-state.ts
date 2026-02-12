import type { State } from '../state-machine';
import type { EnemyObject } from '../../enemy-manager';
import type { EnemyManager } from '../../enemy-manager';

/**
 * Idle state: enemy stands at post, slowly looks around.
 * Transitions to 'alert' if player is seen or heard.
 */
export function createIdleState(manager: EnemyManager): State<EnemyObject> {
  const state = new WeakMap<EnemyObject, { lookTimer: number; baseFacing: number }>();

  return {
    name: 'idle',

    enter(enemy) {
      state.set(enemy, {
        lookTimer: 2 + Math.random() * 3,
        baseFacing: enemy.group.rotation.y,
      });
      enemy.model.play('idle');
    },

    update(enemy, dt) {
      const s = state.get(enemy);
      if (!s) return;

      // Slowly look around
      s.lookTimer -= dt;
      if (s.lookTimer <= 0) {
        s.lookTimer = 2 + Math.random() * 3;
        const targetFacing = s.baseFacing + (Math.random() - 0.5) * 1.2;
        enemy.group.rotation.y = targetFacing;
      }

      // Check perception
      const perception = manager.getPerception(enemy);
      if (!perception) return;

      if (perception.canSeePlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('attack', enemy);
      } else if (perception.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('attack', enemy);
      }
    },

    exit(enemy) {
      state.delete(enemy);
    },
  };
}
