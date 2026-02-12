import type { ObjectiveDef } from './level-schema';

export interface ObjectiveState {
  id: string;
  title: string;
  completed: boolean;
}

export class ObjectiveSystem {
  private objectives: ObjectiveState[] = [];
  private completedIds = new Set<string>();

  /** Initialize from level schema objectives. */
  load(objectives: ObjectiveDef[]): void {
    this.objectives = objectives.map((o) => ({
      id: o.id,
      title: o.title,
      completed: false,
    }));
    this.completedIds.clear();
  }

  getAll(): ObjectiveState[] {
    return this.objectives;
  }

  complete(objectiveId: string): boolean {
    if (this.completedIds.has(objectiveId)) return false;
    const obj = this.objectives.find((o) => o.id === objectiveId);
    if (!obj) return false;
    obj.completed = true;
    this.completedIds.add(objectiveId);
    return true;
  }

  isCompleted(objectiveId: string): boolean {
    return this.completedIds.has(objectiveId);
  }

  get allComplete(): boolean {
    return this.objectives.length > 0 && this.objectives.every((o) => o.completed);
  }
}
