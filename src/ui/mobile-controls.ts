/**
 * Mobile touch controls: virtual joysticks and buttons.
 * Shown only on touch-capable devices when the game is active.
 */

import type { MobileInputState } from '../core/input-manager';
import { SensitivitySettings } from '../core/sensitivity-settings';

const STICK_DEADZONE = 0.15;

/** True only on phones/tablets — touch-capable AND (small viewport OR coarse pointer). */
function isMobileDevice(): boolean {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!hasTouch) return false;
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return narrow || coarsePointer;
}

export class MobileControls {
  private container: HTMLDivElement;
  private moveStickEl: HTMLDivElement;
  private lookZoneEl: HTMLDivElement;
  private jumpBtn: HTMLDivElement;
  private crouchBtn: HTMLDivElement;
  private reloadBtn: HTMLDivElement;
  private sprintBtn: HTMLDivElement;

  private moveStickActive = false;
  private moveStickTouchId: number | null = null;
  private moveStickOrigin = { x: 0, y: 0 };
  private moveStickOffset = { x: 0, y: 0 };
  private moveStickRadius = 50;

  private lookTouchActive = false;
  private lookTouchId: number | null = null;
  private lookLastPos = { x: 0, y: 0 };
  private lookDelta = { x: 0, y: 0 };
  private lookStartTime = 0;
  private lookStartPos = { x: 0, y: 0 };
  private lookHasDragged = false;

  private fireDown = false;
  private fireTapPending = false;
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

    // Left: movement joystick + C/R buttons in a compact cluster
    const leftCluster = document.createElement('div');
    leftCluster.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 20px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      pointer-events: none;
    `;
    const moveZone = document.createElement('div');
    moveZone.style.cssText = `
      width: 120px;
      height: 120px;
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
      background: rgba(212, 175, 55, 0.2);
      border: 2px solid rgba(212, 175, 55, 0.5);
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
    leftCluster.appendChild(moveZone);

    // Sprint button (below joystick, same row as C/R)
    this.sprintBtn = this.createButton('SPRINT', 100, 36);
    this.sprintBtn.style.cssText += `
      font-size: 10px;
    `;
    leftCluster.appendChild(this.sprintBtn);

    // C and R in a horizontal row
    const actionRow = document.createElement('div');
    actionRow.style.cssText = `
      display: flex;
      gap: 10px;
      pointer-events: auto;
    `;
    this.crouchBtn = this.createButton('C', 48, 48);
    this.crouchBtn.style.cssText += `font-size: 14px;`;
    this.reloadBtn = this.createButton('R', 48, 48);
    this.reloadBtn.style.cssText += `font-size: 14px;`;
    actionRow.appendChild(this.crouchBtn);
    actionRow.appendChild(this.reloadBtn);
    leftCluster.appendChild(actionRow);
    this.container.appendChild(leftCluster);

    // Right: look touch zone (covers right 50%, touch-drag to look)
    this.lookZoneEl = document.createElement('div');
    this.lookZoneEl.style.cssText = `
      position: absolute;
      top: 0; right: 0;
      width: 50%;
      height: 100%;
      pointer-events: auto;
      touch-action: none;
    `;
    this.container.appendChild(this.lookZoneEl);

    // Right: jump button only (tap in look zone = fire)
    const rightCluster = document.createElement('div');
    rightCluster.style.cssText = `
      position: absolute;
      bottom: 24px;
      right: 20px;
      pointer-events: none;
    `;
    this.jumpBtn = this.createButton('JUMP', 72, 48);
    this.jumpBtn.style.cssText += `font-size: 11px;`;
    rightCluster.appendChild(this.jumpBtn);
    this.container.appendChild(rightCluster);

    this.setupMoveStick();
    this.setupLookZone();
    this.setupButtons();

    if (isMobileDevice()) {
      document.body.appendChild(this.container);
    }
  }

  private createButton(label: string, w: number, h: number): HTMLDivElement {
    const btn = document.createElement('div');
    btn.textContent = label;
    btn.style.cssText = `
      width: ${w}px;
      height: ${h}px;
      min-width: ${w}px;
      min-height: ${h}px;
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
      const pos = this.getEventPosForTarget(e, this.moveStickEl);
      if ('touches' in e && e.touches.length > 0) {
        this.moveStickTouchId = e.targetTouches[0]?.identifier ?? null;
      } else {
        this.moveStickTouchId = null;
      }
      const rect = this.moveStickEl.getBoundingClientRect();
      this.moveStickOrigin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      this.moveStickRadius = Math.min(rect.width, rect.height) / 2 - 10;
    };
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!this.moveStickActive) return;
      const pos = this.getEventPosForTarget(e, this.moveStickEl);
      if (pos === null) return;
      e.preventDefault();
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
    const onEnd = (e?: TouchEvent | MouseEvent) => {
      if (e && 'changedTouches' in e && this.moveStickTouchId != null) {
        const ct = (e as TouchEvent).changedTouches;
        const found = Array.from(ct).some((t) => t.identifier === this.moveStickTouchId);
        if (!found) return;
      }
      this.moveStickActive = false;
      this.moveStickTouchId = null;
      this.moveStickOffset = { x: 0, y: 0 };
      const knob = this.moveStickEl.querySelector('#move-stick-knob');
      if (knob instanceof HTMLElement) {
        knob.style.transform = 'translate(-50%, -50%)';
      }
    };
    this.moveStickEl.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', (e) => onEnd(e));
    document.addEventListener('touchcancel', (e) => onEnd(e));
    this.moveStickEl.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => onEnd());
  }

  private setupLookZone(): void {
    const TAP_THRESHOLD_PX = 18;
    const TAP_MAX_MS = 280;

    const onStart = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      const pos = this.getEventPosForTarget(e, this.lookZoneEl) ?? this.getEventPos(e);
      this.lookTouchActive = true;
      this.lookTouchId = 'touches' in e && (e as TouchEvent).targetTouches[0]
        ? (e as TouchEvent).targetTouches[0].identifier
        : null;
      this.lookLastPos = { ...pos };
      this.lookStartPos = { ...pos };
      this.lookStartTime = performance.now();
      this.lookHasDragged = false;
      this.lookDelta = { x: 0, y: 0 };
    };
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!this.lookTouchActive) return;
      const pos = this.getLookZoneTouchPos(e);
      if (pos === null) return;
      e.preventDefault();
      const dx = pos.x - this.lookLastPos.x;
      const dy = pos.y - this.lookLastPos.y;
      if (Math.hypot(dx, dy) > TAP_THRESHOLD_PX || Math.hypot(pos.x - this.lookStartPos.x, pos.y - this.lookStartPos.y) > TAP_THRESHOLD_PX) {
        this.lookHasDragged = true;
      }
      const sens = SensitivitySettings.getMobileSensitivity();
      this.lookDelta.x += dx * sens;
      this.lookDelta.y += dy * sens;
      this.lookLastPos = pos;
    };
    const onEnd = (e?: TouchEvent | MouseEvent) => {
      if (e && 'changedTouches' in e && this.lookTouchId != null) {
        const ct = (e as TouchEvent).changedTouches;
        const found = Array.from(ct).some((t) => t.identifier === this.lookTouchId);
        if (!found) return;
      }
      if (!this.lookHasDragged && (performance.now() - this.lookStartTime) < TAP_MAX_MS) {
        this.fireTapPending = true;
      }
      this.lookTouchActive = false;
      this.lookTouchId = null;
    };
    this.lookZoneEl.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', (e) => onEnd(e));
    document.addEventListener('touchcancel', (e) => onEnd(e));
    this.lookZoneEl.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', (e) => onEnd(e));
  }

  private getLookZoneTouchPos(e: TouchEvent | MouseEvent): { x: number; y: number } | null {
    if ('touches' in e) {
      const te = e as TouchEvent;
      if (this.lookTouchId != null && te.touches.length > 0) {
        const t = Array.from(te.touches).find((x) => x.identifier === this.lookTouchId);
        if (t) return { x: t.clientX, y: t.clientY };
      }
      if (te.targetTouches.length > 0 && (e.target === this.lookZoneEl || this.lookZoneEl.contains(e.target as Node))) {
        return { x: te.targetTouches[0].clientX, y: te.targetTouches[0].clientY };
      }
      return null;
    }
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  }

  /** Get position for the touch on our element, or by touch ID for document-level events. */
  private getEventPosForTarget(e: TouchEvent | MouseEvent, targetEl: HTMLElement): { x: number; y: number } | null {
    if ('touches' in e && (e as TouchEvent).touches) {
      const te = e as TouchEvent;
      if (this.moveStickTouchId != null && te.touches.length > 0) {
        const t = Array.from(te.touches).find((x) => x.identifier === this.moveStickTouchId);
        if (t) return { x: t.clientX, y: t.clientY };
      }
      if (te.targetTouches.length > 0 && (e.target === targetEl || targetEl.contains(e.target as Node))) {
        return { x: te.targetTouches[0].clientX, y: te.targetTouches[0].clientY };
      }
      return null;
    }
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  }

  private getEventPos(e: TouchEvent | MouseEvent): { x: number; y: number } {
    const p = this.getEventPosForTarget(e, (e.target as HTMLElement) ?? document.body);
    if (p) return p;
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

    const fire = this.fireTapPending || this.fireDown;
    if (this.fireTapPending) this.fireTapPending = false;

    return {
      moveX,
      moveY,
      lookDeltaX: lookX,
      lookDeltaY: lookY,
      fire,
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
    if (isMobileDevice()) {
      this.container.style.display = 'block';
    }
  }

  hide(): void {
    this.container.style.display = 'none';
    this.moveStickOffset = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.fireDown = false;
    this.fireTapPending = false;
    this.crouchDown = false;
    this.sprintDown = false;
  }

  static isSupported(): boolean {
    return isMobileDevice();
  }
}
