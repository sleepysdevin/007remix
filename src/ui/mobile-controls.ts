/**
 * Mobile touch controls: virtual joysticks and buttons.
 * Shown only on touch-capable devices when the game is active.
 */

import type { MobileInputState } from '../core/input-manager';

const STICK_DEADZONE = 0.15;
const LOOK_SENSITIVITY = 0.5;

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export class MobileControls {
  private container: HTMLDivElement;
  private moveStickEl: HTMLDivElement;
  private lookZoneEl: HTMLDivElement;
  private fireBtn: HTMLDivElement;
  private jumpBtn: HTMLDivElement;
  private crouchBtn: HTMLDivElement;
  private reloadBtn: HTMLDivElement;
  private sprintBtn: HTMLDivElement;

  private moveStickActive = false;
  private moveStickOrigin = { x: 0, y: 0 };
  private moveStickOffset = { x: 0, y: 0 };
  private moveStickRadius = 50;

  private lookTouchActive = false;
  private lookLastPos = { x: 0, y: 0 };
  private lookDelta = { x: 0, y: 0 };

  private fireDown = false;
  private jumpJustPressed = false;
  private crouchDown = false;
  private reloadDown = false;
  private sprintDown = false;

  private justPressedThisFrame: string[] = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'mobile-controls';
    this.container.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 15;
      display: none;
    `;

    // Left: movement joystick
    const moveZone = document.createElement('div');
    moveZone.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 20px;
      width: 140px;
      height: 140px;
      pointer-events: auto;
      touch-action: none;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    this.moveStickEl = document.createElement('div');
    this.moveStickEl.style.cssText = `
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: rgba(212, 175, 55, 0.25);
      border: 2px solid rgba(212, 175, 55, 0.6);
      position: relative;
      touch-action: none;
    `;
    const moveKnob = document.createElement('div');
    moveKnob.style.cssText = `
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(212, 175, 55, 0.5);
      border: 2px solid #d4af37;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      transition: transform 0.05s;
    `;
    moveKnob.id = 'move-stick-knob';
    this.moveStickEl.appendChild(moveKnob);
    moveZone.appendChild(this.moveStickEl);
    this.container.appendChild(moveZone);

    // Right: look touch zone (full right half, touch-drag)
    this.lookZoneEl = document.createElement('div');
    this.lookZoneEl.style.cssText = `
      position: absolute;
      top: 0; right: 0;
      width: 55%;
      height: 100%;
      pointer-events: auto;
      touch-action: none;
    `;
    this.container.appendChild(this.lookZoneEl);

    // Fire button (bottom right)
    this.fireBtn = this.createButton('FIRE', 90, 90);
    this.fireBtn.style.cssText += `
      bottom: 80px;
      right: 24px;
      background: rgba(200, 60, 60, 0.6);
      border-color: #c44;
    `;
    this.container.appendChild(this.fireBtn);

    // Jump (above fire)
    this.jumpBtn = this.createButton('JUMP', 60, 60);
    this.jumpBtn.style.cssText += `
      bottom: 185px;
      right: 44px;
    `;
    this.container.appendChild(this.jumpBtn);

    // Crouch
    this.crouchBtn = this.createButton('C', 44, 44);
    this.crouchBtn.style.cssText += `
      bottom: 85px;
      left: 180px;
      font-size: 14px;
    `;
    this.container.appendChild(this.crouchBtn);

    // Reload
    this.reloadBtn = this.createButton('R', 44, 44);
    this.reloadBtn.style.cssText += `
      bottom: 85px;
      left: 235px;
      font-size: 14px;
    `;
    this.container.appendChild(this.reloadBtn);

    // Sprint
    this.sprintBtn = this.createButton('SPRINT', 70, 36);
    this.sprintBtn.style.cssText += `
      bottom: 140px;
      left: 20px;
      font-size: 10px;
    `;
    this.container.appendChild(this.sprintBtn);

    this.setupMoveStick();
    this.setupLookZone();
    this.setupButtons();

    if (isTouchDevice()) {
      document.body.appendChild(this.container);
    }
  }

  private createButton(label: string, w: number, h: number): HTMLDivElement {
    const btn = document.createElement('div');
    btn.textContent = label;
    btn.style.cssText = `
      position: absolute;
      width: ${w}px;
      height: ${h}px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #d4af37;
      background: rgba(0,0,0,0.5);
      border: 2px solid #d4af37;
      pointer-events: auto;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    `;
    return btn;
  }

  private setupMoveStick(): void {
    const onStart = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      this.moveStickActive = true;
      const pos = this.getEventPos(e);
      const rect = this.moveStickEl.getBoundingClientRect();
      this.moveStickOrigin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      this.moveStickRadius = Math.min(rect.width, rect.height) / 2 - 10;
    };
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!this.moveStickActive) return;
      e.preventDefault();
      const pos = this.getEventPos(e);
      let dx = pos.x - this.moveStickOrigin.x;
      let dy = pos.y - this.moveStickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > this.moveStickRadius) {
        dx = (dx / len) * this.moveStickRadius;
        dy = (dy / len) * this.moveStickRadius;
      }
      this.moveStickOffset = { x: dx / this.moveStickRadius, y: dy / this.moveStickRadius };
      const knob = this.moveStickEl.querySelector('#move-stick-knob');
      if (knob instanceof HTMLElement) {
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
    };
    const onEnd = () => {
      this.moveStickActive = false;
      this.moveStickOffset = { x: 0, y: 0 };
      const knob = this.moveStickEl.querySelector('#move-stick-knob');
      if (knob instanceof HTMLElement) {
        knob.style.transform = 'translate(-50%, -50%)';
      }
    };
    this.moveStickEl.addEventListener('touchstart', onStart, { passive: false });
    this.moveStickEl.addEventListener('touchmove', onMove, { passive: false });
    this.moveStickEl.addEventListener('touchend', onEnd);
    this.moveStickEl.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  }

  private setupLookZone(): void {
    const onStart = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      this.lookTouchActive = true;
      const pos = this.getEventPos(e);
      this.lookLastPos = pos;
      this.lookDelta = { x: 0, y: 0 };
    };
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!this.lookTouchActive) return;
      e.preventDefault();
      const pos = this.getEventPos(e);
      this.lookDelta.x += (pos.x - this.lookLastPos.x) * LOOK_SENSITIVITY;
      this.lookDelta.y += (pos.y - this.lookLastPos.y) * LOOK_SENSITIVITY;
      this.lookLastPos = pos;
    };
    const onEnd = () => {
      this.lookTouchActive = false;
    };
    this.lookZoneEl.addEventListener('touchstart', onStart, { passive: false });
    this.lookZoneEl.addEventListener('touchmove', onMove, { passive: false });
    this.lookZoneEl.addEventListener('touchend', onEnd);
    this.lookZoneEl.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  }

  private getEventPos(e: TouchEvent | MouseEvent): { x: number; y: number } {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ('changedTouches' in e && (e as TouchEvent).changedTouches.length > 0) {
      const t = (e as TouchEvent).changedTouches[0];
      return { x: t.clientX, y: t.clientY };
    }
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  }

  private setupButtons(): void {
    const addTouchBtn = (
      el: HTMLDivElement,
      downKey: keyof MobileControls,
      justPressedKey?: string,
    ) => {
      const setDown = (v: boolean) => {
        (this as any)[downKey] = v;
        if (justPressedKey && v) {
          this.justPressedThisFrame.push(justPressedKey);
        }
      };
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        setDown(true);
      });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        setDown(false);
      });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        setDown(true);
      });
      el.addEventListener('mouseup', (e) => {
        e.preventDefault();
        setDown(false);
      });
    };
    addTouchBtn(this.fireBtn, 'fireDown');
    addTouchBtn(this.jumpBtn, 'jumpJustPressed', ' ');
    addTouchBtn(this.crouchBtn, 'crouchDown', 'c');
    addTouchBtn(this.reloadBtn, 'reloadDown');
    addTouchBtn(this.sprintBtn, 'sprintDown');
  }

  /** Returns current input state. Call each frame. justPressedKeys is consumed. */
  getState(): MobileInputState | null {
    if (!this.container.style.display || this.container.style.display === 'none') {
      return null;
    }

    const moveX = Math.abs(this.moveStickOffset.x) < STICK_DEADZONE
      ? 0
      : this.moveStickOffset.x;
    const moveY = Math.abs(this.moveStickOffset.y) < STICK_DEADZONE
      ? 0
      : -this.moveStickOffset.y;

    const jp = [...this.justPressedThisFrame];
    this.justPressedThisFrame = [];

    const lookX = this.lookDelta.x;
    const lookY = this.lookDelta.y;
    this.lookDelta = { x: 0, y: 0 };

    return {
      moveX,
      moveY,
      lookDeltaX: lookX,
      lookDeltaY: lookY,
      fire: this.fireDown,
      aim: false,
      jump: this.jumpJustPressed,
      crouch: this.crouchDown,
      sprint: this.sprintDown,
      reload: this.reloadDown,
      gasGrenade: false,
      fragGrenade: false,
      weaponSwitch: 0,
      flashlight: false,
      nightVision: false,
      inventory: false,
      pause: false,
      justPressedKeys: jp,
    };
  }

  show(): void {
    if (isTouchDevice()) {
      this.container.style.display = 'block';
    }
  }

  hide(): void {
    this.container.style.display = 'none';
    this.moveStickOffset = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.fireDown = false;
    this.crouchDown = false;
    this.sprintDown = false;
  }

  static isSupported(): boolean {
    return isTouchDevice();
  }
}
