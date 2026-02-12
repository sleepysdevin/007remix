import type { State } from '../state-machine';
import type { EnemyObject } from '../../enemy-manager';

export function createDeadState(): State<EnemyObject> {
  return {
    name: 'dead',

    enter(enemy) {
      enemy.stop();
      enemy.model.play('death', true);
    },

    update(enemy, _dt) {
      enemy.stop();
    },

    exit(enemy) {
      enemy.stop();
    },
  };
}
