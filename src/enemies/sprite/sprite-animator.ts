export type AnimationName = 'idle' | 'alert' | 'shoot' | 'hit' | 'death' | 'walk';

interface AnimationDef {
  frames: number[];
  fps: number;
  loop: boolean;
}

const ANIMATIONS: Record<AnimationName, AnimationDef> = {
  idle:  { frames: [0, 1],       fps: 1,   loop: true },
  alert: { frames: [2, 3],       fps: 2,   loop: true },
  shoot: { frames: [4, 5],       fps: 4,   loop: true },
  hit:   { frames: [6, 7],       fps: 8,   loop: false },
  death: { frames: [8, 9, 10],   fps: 4,   loop: false },
  walk:  { frames: [11, 12],     fps: 4,   loop: true },
};

/**
 * Drives sprite-sheet frame animation by computing texture UV offsets.
 */
export class SpriteAnimator {
  private cols: number;
  private rows: number;
  private currentAnim: AnimationName = 'idle';
  private frameIndex = 0;
  private elapsed = 0;
  private _finished = false;

  // Output: texture UV offset for current frame
  offsetX = 0;
  offsetY = 0;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.computeOffset();
  }

  get currentAnimation(): AnimationName {
    return this.currentAnim;
  }

  get finished(): boolean {
    return this._finished;
  }

  /**
   * Switch to a named animation.
   * @param force If true, restart even if already playing this animation.
   */
  play(name: AnimationName, force = false): void {
    if (name === this.currentAnim && !force && !this._finished) return;
    this.currentAnim = name;
    this.frameIndex = 0;
    this.elapsed = 0;
    this._finished = false;
    this.computeOffset();
  }

  update(dt: number): void {
    const anim = ANIMATIONS[this.currentAnim];
    if (this._finished) return;

    this.elapsed += dt;
    const frameDuration = 1 / anim.fps;

    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frameIndex++;

      if (this.frameIndex >= anim.frames.length) {
        if (anim.loop) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = anim.frames.length - 1;
          this._finished = true;
          break;
        }
      }
    }

    this.computeOffset();
  }

  private computeOffset(): void {
    const anim = ANIMATIONS[this.currentAnim];
    const atlasFrame = anim.frames[this.frameIndex];
    const col = atlasFrame % this.cols;
    const row = Math.floor(atlasFrame / this.cols);

    // Three.js UV origin is bottom-left
    this.offsetX = col / this.cols;
    this.offsetY = 1 - (row + 1) / this.rows;
  }
}
