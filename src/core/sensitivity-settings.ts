/**
 * Look sensitivity — delegates to GameSettings for unified settings.
 */

import { GameSettings } from './game-settings';

export interface SensitivityValues {
  mouse: number;
  gamepad: number;
  mobile: number;
}

export const SensitivitySettings = {
  get(): SensitivityValues {
    const g = GameSettings.get();
    return { mouse: g.mouseSens, gamepad: g.gamepadSens, mobile: g.mobileSens };
  },
  set(values: Partial<SensitivityValues>): void {
    const v: Record<string, number> = {};
    if (values.mouse !== undefined) v.mouseSens = values.mouse;
    if (values.gamepad !== undefined) v.gamepadSens = values.gamepad;
    if (values.mobile !== undefined) v.mobileSens = values.mobile;
    if (Object.keys(v).length) GameSettings.set(v);
  },
  getMouseSensitivity: () => GameSettings.getMouseSensitivity(),
  getGamepadSensitivity: () => GameSettings.getGamepadSensitivity(),
  getMobileSensitivity: () => GameSettings.getMobileSensitivity(),
};
