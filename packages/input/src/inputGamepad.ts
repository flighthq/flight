// Generated from crates/flight-input/src/input_gamepad.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { GamepadAxisKind, GamepadButtonKind, GamepadMapping, GamepadStickOutput } from './types.ts';

const STANDARD_BUTTON_NAMES: (GamepadButtonKind | undefined)[] = [
  'ButtonSouth',
  'ButtonEast',
  'ButtonWest',
  'ButtonNorth',
  'ShoulderLeft',
  'ShoulderRight',
  'TriggerLeft',
  'TriggerRight',
  'Select',
  'Start',
  'StickLeft',
  'StickRight',
  'DpadUp',
  'DpadDown',
  'DpadLeft',
  'DpadRight',
  'Home',
  'Touchpad',
];

const STANDARD_AXIS_NAMES: (GamepadAxisKind | undefined)[] = ['StickLeftX', 'StickLeftY', 'StickRightX', 'StickRightY'];

/**
 * Filters one gamepad axis through a simple dead zone (TS `applyGamepadAxisDeadZone`).
 */
export function applyGamepadAxisDeadZone(value: number, deadZone: number): number {
  if (deadZone <= 0.0) {
    return value;
  }
  const abs = value < 0.0 ? -value : value;
  if (abs <= deadZone) {
    return 0.0;
  }
  const sign = value < 0.0 ? -1.0 : 1.0;
  return sign * ((abs - deadZone) / (1.0 - deadZone));
}

/**
 * Filters a two-dimensional stick through a radial dead zone (TS
 * `applyGamepadStickDeadZone`). Direction is preserved and the magnitude is rescaled to [0, 1].
 * Alias-safe: the coordinates are captured before `out` is written.
 */
export function applyGamepadStickDeadZone(out: GamepadStickOutput, x: number, y: number, deadZone: number): void {
  if (deadZone <= 0.0) {
    out.x = x;
    out.y = y;
    return;
  }
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude <= deadZone) {
    out.x = 0.0;
    out.y = 0.0;
    return;
  }
  const scale = (magnitude - deadZone) / ((1.0 - deadZone) * magnitude);
  out.x = x * scale;
  out.y = y * scale;
}

/**
 * Returns the semantic axis name for a standard-mapping index (TS `getGamepadAxisName`).
 */
export function getGamepadAxisName(mapping: GamepadMapping, index: number): GamepadAxisKind | undefined {
  if (mapping !== 'standard') {
    return undefined;
  }
  if (index < 0 || index >>> 0 >= STANDARD_AXIS_NAMES.length) {
    return undefined;
  }
  return STANDARD_AXIS_NAMES[index >>> 0];
}

/**
 * Returns the semantic button name for a standard-mapping index (TS `getGamepadButtonName`).
 */
export function getGamepadButtonName(mapping: GamepadMapping, index: number): GamepadButtonKind | undefined {
  if (mapping !== 'standard') {
    return undefined;
  }
  if (index < 0 || index >>> 0 >= STANDARD_BUTTON_NAMES.length) {
    return undefined;
  }
  return STANDARD_BUTTON_NAMES[index >>> 0];
}
