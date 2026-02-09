import * as THREE from 'three';
import type { TriggerDef } from './level-schema';

interface TriggerState {
  def: TriggerDef;
  fired: boolean;
}

export class TriggerSystem {
  private triggers = new Map<string, TriggerState>();
  private getPlayerPos: () => { x: number; y: number; z: number };

  /** Callback when player enters a trigger: (eventString) => void. E.g. "objective:complete:obj1", "door:unlock:door1" */
  onTrigger: ((event: string) => void) | null = null;

  constructor(getPlayerPos: () => { x: number; y: number; z: number }) {
    this.getPlayerPos = getPlayerPos;
  }

  addTrigger(def: TriggerDef): void {
    this.triggers.set(def.id, { def, fired: false });
  }

  update(): void {
    const pos = this.getPlayerPos();
    const player = new THREE.Vector3(pos.x, pos.y, pos.z);

    for (const state of this.triggers.values()) {
      const { def } = state;
      if (def.once && state.fired) continue;

      const dx = Math.abs(player.x - def.x);
      const dy = Math.abs(player.y - def.y);
      const dz = Math.abs(player.z - def.z);

      if (dx <= def.halfWidth && dy <= def.halfHeight && dz <= def.halfDepth) {
        state.fired = true;
        this.onTrigger?.(def.onEnter);
      }
    }
  }
}
