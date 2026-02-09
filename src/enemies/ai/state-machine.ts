export interface State<T> {
  name: string;
  enter(ctx: T): void;
  update(ctx: T, dt: number): void;
  exit(ctx: T): void;
}

export class StateMachine<T> {
  private states = new Map<string, State<T>>();
  private current: State<T> | null = null;

  get currentState(): State<T> | null {
    return this.current;
  }

  get currentName(): string {
    return this.current?.name ?? 'none';
  }

  addState(state: State<T>): void {
    this.states.set(state.name, state);
  }

  transition(name: string, ctx: T): void {
    const next = this.states.get(name);
    if (!next) return;
    if (this.current === next) return;
    this.current?.exit(ctx);
    this.current = next;
    this.current.enter(ctx);
  }

  update(ctx: T, dt: number): void {
    this.current?.update(ctx, dt);
  }
}
