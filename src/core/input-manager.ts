export class InputManager {
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private _mouseDown = false;
  private _rightMouseDown = false;
  private _pointerLocked = false;
  private _scrollDelta = 0;
  private keyJustPressed = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  get pointerLocked(): boolean {
    return this._pointerLocked;
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  /** Returns true only on the frame the key was first pressed */
  wasKeyJustPressed(key: string): boolean {
    return this.keyJustPressed.has(key.toLowerCase());
  }

  get mouseMovementX(): number {
    return this.mouseX;
  }

  get mouseMovementY(): number {
    return this.mouseY;
  }

  get mouseDown(): boolean {
    return this._mouseDown;
  }

  get rightMouseDown(): boolean {
    return this._rightMouseDown;
  }

  /** Returns -1 (scroll up), 0 (none), or 1 (scroll down) */
  get scrollDelta(): number {
    return this._scrollDelta;
  }

  /** Call at end of each frame to reset per-frame deltas */
  resetMouse(): void {
    this.mouseX = 0;
    this.mouseY = 0;
    this._scrollDelta = 0;
    this.keyJustPressed.clear();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (!this.keys.has(key)) {
      this.keyJustPressed.add(key);
    }
    this.keys.add(key);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this._pointerLocked) return;
    this.mouseX += e.movementX;
    this.mouseY += e.movementY;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this._mouseDown = true;
    if (e.button === 2) this._rightMouseDown = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this._mouseDown = false;
    if (e.button === 2) this._rightMouseDown = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this._pointerLocked) return;
    e.preventDefault();
    this._scrollDelta = Math.sign(e.deltaY);
  };

  private onPointerLockChange = (): void => {
    this._pointerLocked = document.pointerLockElement === this.canvas;
  };

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
