import * as THREE from 'three';
import type { TriggerDef } from './level-schema';
import type { ObjectiveSystem } from './objective-system';

interface TriggerState {
  def: TriggerDef;
  fired: boolean;
}

export class TriggerSystem {
  private triggers = new Map<string, TriggerState>();
  private getPlayerPos: () => { x: number; y: number; z: number };
  private objectiveSystem: ObjectiveSystem | null = null;

  /** Callback when player enters a trigger: (eventString) => void. E.g. "objective:complete:obj1", "door:unlock:door1" */
  onTrigger: ((event: string) => void) | null = null;

  constructor(getPlayerPos: () => { x: number; y: number; z: number }, objectiveSystem?: ObjectiveSystem) {
    this.getPlayerPos = getPlayerPos;
    this.objectiveSystem = objectiveSystem || null;
  }

  /** Set the objective system after construction if needed */
  setObjectiveSystem(objectiveSystem: ObjectiveSystem): void {
    this.objectiveSystem = objectiveSystem;
  }

  addTrigger(def: TriggerDef): void {
    this.triggers.set(def.id, { def, fired: false });
  }

  /** Check if all required objectives for a trigger are completed */
  private areObjectivesComplete(requiredObjectives?: string[]): boolean {
    if (!requiredObjectives || requiredObjectives.length === 0) return true;
    if (!this.objectiveSystem) return false;
    
    return requiredObjectives.every(id => this.objectiveSystem?.isCompleted(id));
  }

  update(): void {
    const pos = this.getPlayerPos();
    const player = new THREE.Vector3(pos.x, pos.y, pos.z);

    for (const state of this.triggers.values()) {
      const { def } = state;
      if (def.once && state.fired) continue;

      // Check if all required objectives are completed (if any)
      if (!this.areObjectivesComplete(def.requireObjectives)) {
        continue;
      }

      const dx = Math.abs(player.x - def.x);
      const dy = Math.abs(player.y - def.y);
      const dz = Math.abs(player.z - def.z);

      if (dx <= def.halfWidth && dy <= def.halfHeight && dz <= def.halfDepth) {
        state.fired = true;
        
        // Handle multiple commands in onEnter (comma-separated)
        const commands = def.onEnter.split(',').map(cmd => cmd.trim());
        commands.forEach(cmd => {
          this.onTrigger?.(cmd);
        });
      }
    }
  }
}
