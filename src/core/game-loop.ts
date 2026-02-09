export class GameLoop {
  private running = false;
  private lastTime = 0;
  private frameId = 0;
  private onTick: (dt: number) => void;

  constructor(onTick: (dt: number) => void) {
    this.onTick = onTick;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frame();
  }

  stop(): void {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }

  private frame = (): void => {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this.frame);

    const now = performance.now();
    // Cap delta to avoid spiral-of-death after tab switch
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.onTick(dt);
  };
}
