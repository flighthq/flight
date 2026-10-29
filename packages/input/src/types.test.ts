// Generated from crates/flight-input/tests/types_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  getGamepadAxisKindString,
  getGamepadButtonKindString,
  getGamepadMappingString,
  getInputPointerLockExitReasonString,
  getInputPointerLockRequestReasonString,
  getMouseWheelModeString,
  getPointerTypeString,
  parseGamepadAxisKind,
  parseGamepadButtonKind,
  parseGamepadMapping,
  parseInputPointerLockExitReason,
  parseInputPointerLockRequestReason,
  parseMouseWheelMode,
  parsePointerType,
} from './contract.ts';
import type { GamepadAxisKind, GamepadButtonKind, MouseWheelMode, PointerType } from './contract.ts';

describe('getGamepadAxisKindString', () => {
  it('returns every exact ts value', () => {
    const cases: Array<readonly [GamepadAxisKind, string]> = [
      ['StickLeftX', 'StickLeftX'],
      ['StickLeftY', 'StickLeftY'],
      ['StickRightX', 'StickRightX'],
      ['StickRightY', 'StickRightY'],
    ];
    for (const [value, string] of cases) {
      expect(getGamepadAxisKindString(value)).toEqual(string);
    }
  });
});

describe('getGamepadButtonKindString', () => {
  it('returns every exact ts value', () => {
    const cases: Array<readonly [GamepadButtonKind, string]> = [
      ['ButtonEast', 'ButtonEast'],
      ['ButtonNorth', 'ButtonNorth'],
      ['ButtonSouth', 'ButtonSouth'],
      ['ButtonWest', 'ButtonWest'],
      ['DpadDown', 'DpadDown'],
      ['DpadLeft', 'DpadLeft'],
      ['DpadRight', 'DpadRight'],
      ['DpadUp', 'DpadUp'],
      ['Home', 'Home'],
      ['Select', 'Select'],
      ['ShoulderLeft', 'ShoulderLeft'],
      ['ShoulderRight', 'ShoulderRight'],
      ['Start', 'Start'],
      ['StickLeft', 'StickLeft'],
      ['StickRight', 'StickRight'],
      ['Touchpad', 'Touchpad'],
      ['TriggerLeft', 'TriggerLeft'],
      ['TriggerRight', 'TriggerRight'],
    ];
    for (const [value, string] of cases) {
      expect(getGamepadButtonKindString(value)).toEqual(string);
    }
  });
});

describe('getGamepadMappingString', () => {
  it('returns the exact ts mapping strings including the empty one', () => {
    expect(getGamepadMappingString('standard')).toEqual('standard');
    expect(getGamepadMappingString('raw')).toEqual('raw');
    expect(getGamepadMappingString('')).toEqual('');
  });
});

describe('getInputPointerLockExitReasonString', () => {
  it('returns every exact ts reason', () => {
    expect(getInputPointerLockExitReasonString('ok')).toEqual('ok');
    expect(getInputPointerLockExitReasonString('api-unavailable')).toEqual('api-unavailable');
    expect(getInputPointerLockExitReasonString('operation-failed')).toEqual('operation-failed');
  });
});

describe('getInputPointerLockRequestReasonString', () => {
  it('returns every exact ts reason', () => {
    expect(getInputPointerLockRequestReasonString('ok')).toEqual('ok');
    expect(getInputPointerLockRequestReasonString('api-unavailable')).toEqual('api-unavailable');
    expect(getInputPointerLockRequestReasonString('denied')).toEqual('denied');
    expect(getInputPointerLockRequestReasonString('operation-failed')).toEqual('operation-failed');
    expect(getInputPointerLockRequestReasonString('target-not-found')).toEqual('target-not-found');
  });
});

describe('getMouseWheelModeString', () => {
  it('returns every exact ts value', () => {
    const cases: Array<readonly [MouseWheelMode, string]> = [
      ['lines', 'lines'],
      ['pages', 'pages'],
      ['pixels', 'pixels'],
      ['unknown', 'unknown'],
    ];
    for (const [value, string] of cases) {
      expect(getMouseWheelModeString(value)).toEqual(string);
    }
  });
});

describe('getPointerTypeString', () => {
  it('returns every exact ts value', () => {
    const cases: Array<readonly [PointerType, string]> = [
      ['mouse', 'mouse'],
      ['pen', 'pen'],
      ['touch', 'touch'],
      ['unknown', 'unknown'],
    ];
    for (const [value, string] of cases) {
      expect(getPointerTypeString(value)).toEqual(string);
    }
  });
});

describe('parseGamepadAxisKind', () => {
  it('round trips exact strings and rejects others', () => {
    const values = ['StickLeftX', 'StickLeftY', 'StickRightX', 'StickRightY'] as const;
    for (const value of values) {
      expect(parseGamepadAxisKind(getGamepadAxisKindString(value))).toEqual(value);
    }
    expect(parseGamepadAxisKind('stickleftx')).toEqual(undefined);
  });
});

describe('parseGamepadButtonKind', () => {
  it('round trips every exact string and rejects others', () => {
    const values = [
      'ButtonEast',
      'ButtonNorth',
      'ButtonSouth',
      'ButtonWest',
      'DpadDown',
      'DpadLeft',
      'DpadRight',
      'DpadUp',
      'Home',
      'Select',
      'ShoulderLeft',
      'ShoulderRight',
      'Start',
      'StickLeft',
      'StickRight',
      'Touchpad',
      'TriggerLeft',
      'TriggerRight',
    ] as const;
    for (const value of values) {
      expect(parseGamepadButtonKind(getGamepadButtonKindString(value))).toEqual(value);
    }
    expect(parseGamepadButtonKind('Button')).toEqual(undefined);
  });
});

describe('parseGamepadMapping', () => {
  it('round trips standard raw and empty and rejects others', () => {
    expect(parseGamepadMapping('standard')).toEqual('standard');
    expect(parseGamepadMapping('raw')).toEqual('raw');
    expect(parseGamepadMapping('')).toEqual('');
    expect(parseGamepadMapping('other')).toEqual(undefined);
  });
});

describe('parseInputPointerLockExitReason', () => {
  it('round trips exact strings and rejects others', () => {
    const values = ['ok', 'api-unavailable', 'operation-failed'] as const;
    for (const value of values) {
      expect(parseInputPointerLockExitReason(getInputPointerLockExitReasonString(value))).toEqual(value);
    }
    expect(parseInputPointerLockExitReason('denied')).toEqual(undefined);
  });
});

describe('parseInputPointerLockRequestReason', () => {
  it('round trips exact strings and rejects others', () => {
    const values = ['ok', 'api-unavailable', 'denied', 'operation-failed', 'target-not-found'] as const;
    for (const value of values) {
      expect(parseInputPointerLockRequestReason(getInputPointerLockRequestReasonString(value))).toEqual(value);
    }
    expect(parseInputPointerLockRequestReason('missing')).toEqual(undefined);
  });
});

describe('parseMouseWheelMode', () => {
  it('round trips exact strings and rejects others', () => {
    const values = ['lines', 'pages', 'pixels', 'unknown'] as const;
    for (const value of values) {
      expect(parseMouseWheelMode(getMouseWheelModeString(value))).toEqual(value);
    }
    expect(parseMouseWheelMode('delta')).toEqual(undefined);
  });
});

describe('parsePointerType', () => {
  it('round trips exact strings and rejects others', () => {
    const values = ['mouse', 'pen', 'touch', 'unknown'] as const;
    for (const value of values) {
      expect(parsePointerType(getPointerTypeString(value))).toEqual(value);
    }
    expect(parsePointerType('stylus')).toEqual(undefined);
  });
});
