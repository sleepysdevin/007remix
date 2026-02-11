/**
 * Game settings: sensitivity, deadzone, volume.
 * Persists to localStorage.
 */

const STORAGE_KEY = '007remix_settings';

export type GamepadResponseCurve = 'linear' | 'exponential' | 'precision' | 'classic';

export interface GameSettingsValues {
  mouseSens: number;
  gamepadSens: number;
  mobileSens: number;
  deadzoneLeft: number;
  deadzoneRight: number;
  gamepadResponseCurve: GamepadResponseCurve;
  gamepadSmoothing: number;
  gamepadLookYScale: number;
  scopeSensMult: number;
  aimAssistStrength: number;
  aimAssistMode: 'off' | 'slowdown' | 'pull';
  volumeMaster: number;
  volumeMusic: number;
  volumeSFX: number;
}

const DEFAULTS: GameSettingsValues = {
  mouseSens: 50,
  gamepadSens: 25,
  mobileSens: 50,
  deadzoneLeft: 20,
  deadzoneRight: 20,
  gamepadResponseCurve: 'exponential',
  gamepadSmoothing: 35,
  gamepadLookYScale: 65,
  scopeSensMult: 100,
  aimAssistStrength: 0,
  aimAssistMode: 'off',
  volumeMaster: 100,
  volumeMusic: 80,
  volumeSFX: 100,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function load(): GameSettingsValues {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem('007remix_sensitivity');
      if (legacy) {
        const s = JSON.parse(legacy) as { mouse?: number; gamepad?: number; mobile?: number };
        raw = JSON.stringify({
          ...DEFAULTS,
          mouseSens: s.mouse ?? DEFAULTS.mouseSens,
          gamepadSens: s.gamepad ?? DEFAULTS.gamepadSens,
          mobileSens: s.mobile ?? DEFAULTS.mobileSens,
        });
        localStorage.setItem(STORAGE_KEY, raw);
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettingsValues>;
      return {
        mouseSens: clamp(parsed.mouseSens ?? DEFAULTS.mouseSens, 0, 100),
        gamepadSens: clamp(parsed.gamepadSens ?? DEFAULTS.gamepadSens, 0, 100),
        mobileSens: clamp(parsed.mobileSens ?? DEFAULTS.mobileSens, 0, 100),
        deadzoneLeft: clamp(parsed.deadzoneLeft ?? DEFAULTS.deadzoneLeft, 0, 50),
        deadzoneRight: clamp(parsed.deadzoneRight ?? DEFAULTS.deadzoneRight, 0, 50),
        gamepadResponseCurve: (['linear', 'exponential', 'precision', 'classic'] as const).includes(parsed.gamepadResponseCurve as any)
          ? (parsed.gamepadResponseCurve as GamepadResponseCurve)
          : DEFAULTS.gamepadResponseCurve,
        gamepadSmoothing: clamp(parsed.gamepadSmoothing ?? DEFAULTS.gamepadSmoothing, 0, 100),
        gamepadLookYScale: clamp(parsed.gamepadLookYScale ?? DEFAULTS.gamepadLookYScale, 25, 150),
        scopeSensMult: clamp(parsed.scopeSensMult ?? DEFAULTS.scopeSensMult, 25, 150),
        aimAssistStrength: clamp(parsed.aimAssistStrength ?? DEFAULTS.aimAssistStrength, 0, 100),
        aimAssistMode: (['off', 'slowdown', 'pull'] as const).includes(parsed.aimAssistMode as any)
          ? (parsed.aimAssistMode as GameSettingsValues['aimAssistMode'])
          : DEFAULTS.aimAssistMode,
        volumeMaster: clamp(parsed.volumeMaster ?? DEFAULTS.volumeMaster, 0, 100),
        volumeMusic: clamp(parsed.volumeMusic ?? DEFAULTS.volumeMusic, 0, 100),
        volumeSFX: clamp(parsed.volumeSFX ?? DEFAULTS.volumeSFX, 0, 100),
      };
    }
  } catch (_) {}
  return { ...DEFAULTS };
}

let cache = load();

export const GameSettings = {
  get(): GameSettingsValues {
    return { ...cache };
  },

  set(values: Partial<GameSettingsValues>): void {
    if (values.mouseSens !== undefined) cache.mouseSens = clamp(values.mouseSens, 0, 100);
    if (values.gamepadSens !== undefined) cache.gamepadSens = clamp(values.gamepadSens, 0, 100);
    if (values.mobileSens !== undefined) cache.mobileSens = clamp(values.mobileSens, 0, 100);
    if (values.deadzoneLeft !== undefined) cache.deadzoneLeft = clamp(values.deadzoneLeft, 0, 50);
    if (values.deadzoneRight !== undefined) cache.deadzoneRight = clamp(values.deadzoneRight, 0, 50);
    if (values.gamepadResponseCurve !== undefined) cache.gamepadResponseCurve = values.gamepadResponseCurve;
    if (values.gamepadSmoothing !== undefined) cache.gamepadSmoothing = clamp(values.gamepadSmoothing, 0, 100);
    if (values.gamepadLookYScale !== undefined) cache.gamepadLookYScale = clamp(values.gamepadLookYScale, 25, 150);
    if (values.scopeSensMult !== undefined) cache.scopeSensMult = clamp(values.scopeSensMult, 25, 150);
    if (values.aimAssistStrength !== undefined) cache.aimAssistStrength = clamp(values.aimAssistStrength, 0, 100);
    if (values.aimAssistMode !== undefined) cache.aimAssistMode = values.aimAssistMode;
    if (values.volumeMaster !== undefined) cache.volumeMaster = clamp(values.volumeMaster, 0, 100);
    if (values.volumeMusic !== undefined) cache.volumeMusic = clamp(values.volumeMusic, 0, 100);
    if (values.volumeSFX !== undefined) cache.volumeSFX = clamp(values.volumeSFX, 0, 100);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (_) {}
  },

  getMouseSensitivity(): number {
    const n = cache.mouseSens / 100;
    return 0.0005 + n * 0.0035;
  },
  getGamepadSensitivity(): number {
    const n = cache.gamepadSens / 100;
    return 6 + n * 54;
  },
  getGamepadResponseCurve(): GamepadResponseCurve {
    return cache.gamepadResponseCurve;
  },
  getGamepadSmoothing(): number {
    return cache.gamepadSmoothing / 100;
  },
  getGamepadLookYScale(): number {
    return cache.gamepadLookYScale / 100;
  },
  getScopeSensMult(): number {
    return cache.scopeSensMult / 100;
  },
  getAimAssistStrength(): number {
    return cache.aimAssistStrength / 100;
  },
  getAimAssistMode(): GameSettingsValues['aimAssistMode'] {
    return cache.aimAssistMode;
  },
  getMobileSensitivity(): number {
    const n = cache.mobileSens / 100;
    return 0.3 + n * 2.2;
  },
  getDeadzoneLeft(): number {
    return cache.deadzoneLeft / 100;
  },
  getDeadzoneRight(): number {
    return cache.deadzoneRight / 100;
  },
  getVolumeMaster(): number {
    return cache.volumeMaster / 100;
  },
  getVolumeMusic(): number {
    return cache.volumeMusic / 100;
  },
  getVolumeSFX(): number {
    return cache.volumeSFX / 100;
  },
};
