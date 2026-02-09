import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';

/**
 * Idle state: enemy stands at post, slowly looks around.
 * Transitions to 'alert' if player is seen or heard.
 */
export function createIdleState(manager: EnemyManager): State<EnemyBase> {
  let lookTimer = 0;
  let baseFacing = 0;

  return {
    name: 'idle',

    enter(enemy) {
      lookTimer = 2 + Math.random() * 3;
      baseFacing = enemy.facingAngle;
      enemy.sprite.play('idle');
    },

    update(enemy, dt) {
      // Slowly look around
      lookTimer -= dt;
      if (lookTimer <= 0) {
        lookTimer = 2 + Math.random() * 3;
        enemy.targetFacingAngle = baseFacing + (Math.random() - 0.5) * 1.2;
      }

      // Check perception
      const perception = manager.getPerception(enemy);
      if (!perception) return;

      if (perception.canSeePlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('attack', enemy);
      } else if (perception.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        enemy.stateMachine.transition('alert', enemy);
      }
    },

    exit() {},
  };
}
