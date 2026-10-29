// Generated from crates/flight-input/tests/input_gamepad_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  applyGamepadAxisDeadZone,
  applyGamepadStickDeadZone,
  getGamepadAxisName,
  getGamepadButtonName,
} from './contract.ts';
import type { GamepadStickOutput } from './contract.ts';

function close(actual: number, expected: number): void {
  expect(Math.abs(actual - expected) < 1e-4, `expected ${expected}, got ${actual}`).toBe(true);
}

describe('applyGamepadAxisDeadZone', () => {
  it('returns zero inside the dead zone', () => {
    close(applyGamepadAxisDeadZone(0.1, 0.2), 0.0);
    close(applyGamepadAxisDeadZone(-0.1, 0.2), 0.0);
  });
  it('rescales positive and negative values outside the dead zone', () => {
    close(applyGamepadAxisDeadZone(1.0, 0.2), 1.0);
    close(applyGamepadAxisDeadZone(-1.0, 0.2), -1.0);
    const mid = applyGamepadAxisDeadZone(0.6, 0.2);
    expect(mid > 0.0 && mid < 1.0).toBe(true);
  });
  it('returns the raw value when the dead zone is zero', () => {
    close(applyGamepadAxisDeadZone(0.5, 0.0), 0.5);
  });
});

describe('applyGamepadStickDeadZone', () => {
  it('outputs zero inside the radial dead zone', () => {
    let out: GamepadStickOutput = { x: 0.0, y: 0.0 };
    applyGamepadStickDeadZone(out, 0.1, 0.1, 0.2);
    close(out.x, 0.0);
    close(out.y, 0.0);
  });
  it('preserves direction and rescales full deflection to one', () => {
    let out: GamepadStickOutput = { x: 0.0, y: 0.0 };
    applyGamepadStickDeadZone(out, 1.0, 0.0, 0.2);
    close(out.x, 1.0);
    close(out.y, 0.0);
  });
  it('is alias safe when coordinates come from the out record', () => {
    let out: GamepadStickOutput = { x: 0.8, y: 0.0 };
    applyGamepadStickDeadZone(out, 0.8, 0.0, 0.2);
    expect(out.x > 0.0).toBe(true);
    close(out.y, 0.0);
  });
  it('passes through when the dead zone is zero', () => {
    let out: GamepadStickOutput = { x: 0.0, y: 0.0 };
    applyGamepadStickDeadZone(out, 0.3, 0.4, 0.0);
    close(out.x, 0.3);
    close(out.y, 0.4);
  });
});

describe('getGamepadAxisName', () => {
  it('maps standard indices to the exact kinds', () => {
    expect(getGamepadAxisName('standard', 0)).toEqual('StickLeftX');
    expect(getGamepadAxisName('standard', 1)).toEqual('StickLeftY');
    expect(getGamepadAxisName('standard', 2)).toEqual('StickRightX');
    expect(getGamepadAxisName('standard', 3)).toEqual('StickRightY');
    expect(getGamepadAxisName('standard', 4)).toEqual(undefined);
  });
  it('returns none for non standard mapping', () => {
    expect(getGamepadAxisName('raw', 0)).toEqual(undefined);
    expect(getGamepadAxisName('', 0)).toEqual(undefined);
  });
});

describe('getGamepadButtonName', () => {
  it('maps standard indices to the exact kinds', () => {
    expect(getGamepadButtonName('standard', 0)).toEqual('ButtonSouth');
    expect(getGamepadButtonName('standard', 12)).toEqual('DpadUp');
    expect(getGamepadButtonName('standard', 16)).toEqual('Home');
  });
  it('returns none for non standard mapping or out of range indices', () => {
    expect(getGamepadButtonName('raw', 0)).toEqual(undefined);
    expect(getGamepadButtonName('', 0)).toEqual(undefined);
    expect(getGamepadButtonName('standard', 99)).toEqual(undefined);
    expect(getGamepadButtonName('standard', -1)).toEqual(undefined);
  });
});
