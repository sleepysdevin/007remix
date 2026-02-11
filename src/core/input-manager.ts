/** Virtual input state from mobile touch controls. */
export interface MobileInputState {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  fire: boolean;
  aim: boolean;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  reload: boolean;
  gasGrenade: boolean;
  fragGrenade: boolean;
  weaponSwitch: number;
  flashlight: boolean;
  nightVision: boolean;
  inventory: boolean;
  pause: boolean;
  /** Keys to treat as "just pressed" this frame (e.g. ['g','f','n','v',' ','escape']) */
  justPressedKeys: string[];
}

export class InputManager {
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private _mouseDown = false;
  private _rightMouseDown = false;
  private _pointerLocked = false;
  private _scrollDelta = 0;
  private keyJustPressed = new Set<string>();

  /** Gamepad look sensitivity (right stick → pixel-like delta) */
  private static readonly GAMEPAD_LOOK_SENS = 180;
  /** Stick deadzone */
  private static readonly DEADZONE = 0.2;
  /** Previous gamepad button state for "just pressed" */
  private prevGamepadButtons: boolean[] = [];
  private prevGamepadAxes: number[] = [];

  /** Optional mobile input provider (touch controls) */
  private mobileInput: (() => MobileInputState | null) | null = null;

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

  /** Register mobile input provider. When provided and active, its state is merged. */
  setMobileInputProvider(provider: (() => MobileInputState | null) | null): void {
    this.mobileInput = provider;
  }

  /** Returns true if pointer lock is active OR mobile touch controls are active. */
  get canShoot(): boolean {
    if (this._pointerLocked) return true;
    return this.mobileInput?.() != null;
  }

  requestPointerLock(): void {
    if (typeof document.documentElement.requestPointerLock === 'function') {
      this.canvas.requestPointerLock();
    }
  }

  get pointerLocked(): boolean {
    return this._pointerLocked;
  }

  isKeyDown(key: string): boolean {
    const k = key.toLowerCase();
    if (this.keys.has(k)) return true;
    const m = this.mobileInput?.();
    if (m) {
      const map: Record<string, boolean> = {
        w: m.moveY > 0.1,
        s: m.moveY < -0.1,
        a: m.moveX < -0.1,
        d: m.moveX > 0.1,
        ' ': m.jump,
        shift: m.sprint,
        c: m.crouch,
        r: m.reload,
      };
      if (map[k] !== undefined) return map[k];
    }
    return false;
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
    if (this._mouseDown) return true;
    const m = this.mobileInput?.();
    if (m != null && m.fire) return true;
    const gp = navigator.getGamepads?.()?.[0];
    if (gp?.connected && gp.axes.length > 7 && gp.axes[7] > 0.3) return true;
    return false;
  }

  get rightMouseDown(): boolean {
    if (this._rightMouseDown) return true;
    const m = this.mobileInput?.();
    if (m != null && m.aim) return true;
    const gp = navigator.getGamepads?.()?.[0];
    if (gp?.connected && gp.axes.length > 6 && gp.axes[6] > 0.3) return true;
    return false;
  }

  /** Returns -1 (scroll up), 0 (none), or 1 (scroll down) */
  get scrollDelta(): number {
    if (this._scrollDelta !== 0) return this._scrollDelta;
    const m = this.mobileInput?.();
    if (m && m.weaponSwitch !== 0) return m.weaponSwitch;
    return 0;
  }

  /** Call each frame to poll gamepad and merge mobile input. Call before other input reads. */
  update(dt: number): void {
    const gp = navigator.getGamepads?.();
    const pad = gp?.[0] ?? null;

    if (pad?.connected) {
      // Left stick → WASD
      const lx = this.applyDeadzone(pad.axes[0]);
      const ly = this.applyDeadzone(-pad.axes[1]);
      if (ly < -InputManager.DEADZONE) this.keys.add('w');
      else this.keys.delete('w');
      if (ly > InputManager.DEADZONE) this.keys.add('s');
      else this.keys.delete('s');
      if (lx < -InputManager.DEADZONE) this.keys.add('a');
      else this.keys.delete('a');
      if (lx > InputManager.DEADZONE) this.keys.add('d');
      else this.keys.delete('d');

      // Right stick → look
      const rx = this.applyDeadzone(pad.axes[2]);
      const ry = this.applyDeadzone(-pad.axes[3]);
      this.mouseX += rx * InputManager.GAMEPAD_LOOK_SENS * dt * 60;
      this.mouseY += ry * InputManager.GAMEPAD_LOOK_SENS * dt * 60;

      // Triggers: handled in mouseDown/rightMouseDown getters

      // Buttons: A=0 Jump, B=1 Crouch, X=2 Reload, Y=3, LB=4 Gas, RB=5 Frag, LT=6, RT=7, Back=8, Start=9
      const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
      if (btn(0)) this.keys.add(' ');
      else this.keys.delete(' ');
      if (btn(1)) this.keys.add('c');
      else this.keys.delete('c');
      if (btn(2)) this.keys.add('r');
      else this.keys.delete('r');
      if (btn(9)) this.keyJustPressed.add('escape');
      if (btn(10)) this.keys.add('shift');
      else this.keys.delete('shift');

      // D-pad weapon switch
      const dpadLeft = pad.buttons[14]?.pressed ?? false;
      const dpadRight = pad.buttons[15]?.pressed ?? false;
      if (dpadLeft && !this.prevGamepadButtons[14]) this._scrollDelta = -1;
      if (dpadRight && !this.prevGamepadButtons[15]) this._scrollDelta = 1;

      // Just-pressed for buttons that need it
      for (let i = 0; i < Math.min(pad.buttons.length, 16); i++) {
        const now = pad.buttons[i]?.pressed ?? false;
        const was = this.prevGamepadButtons[i] ?? false;
        if (now && !was) {
          if (i === 0) this.keyJustPressed.add(' ');
          if (i === 1) this.keyJustPressed.add('c');
          if (i === 4) this.keyJustPressed.add('g');
          if (i === 5) this.keyJustPressed.add('f');
          if (i === 9) this.keyJustPressed.add('escape');
        }
        this.prevGamepadButtons[i] = now;
      }
    } else {
      this.prevGamepadButtons = [];
    }

    // Merge mobile input (look delta + just-pressed keys)
    const m = this.mobileInput?.();
    if (m) {
      this.mouseX += m.lookDeltaX;
      this.mouseY += m.lookDeltaY;
      for (const k of m.justPressedKeys ?? []) {
        this.keyJustPressed.add(k.toLowerCase());
      }
    }
  }

  private applyDeadzone(v: number): number {
    const a = Math.abs(v);
    if (a < InputManager.DEADZONE) return 0;
    return Math.sign(v) * ((a - InputManager.DEADZONE) / (1 - InputManager.DEADZONE));
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
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.setMobileInputProvider(null);
  }
}
