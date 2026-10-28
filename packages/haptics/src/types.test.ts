// Generated from crates/flight-haptics/tests/types_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  getHapticImpactStyleString,
  getHapticNotificationTypeString,
  getHapticsOperationString,
  parseHapticImpactStyle,
  parseHapticNotificationType,
  parseHapticsOperation,
} from './contract.ts';

describe('getHapticImpactStyleString', () => {
  it('returns the exact ts strings', () => {
    expect(getHapticImpactStyleString('light')).toEqual('light');
    expect(getHapticImpactStyleString('medium')).toEqual('medium');
    expect(getHapticImpactStyleString('heavy')).toEqual('heavy');
    expect(getHapticImpactStyleString('soft')).toEqual('soft');
    expect(getHapticImpactStyleString('rigid')).toEqual('rigid');
  });
});

describe('getHapticNotificationTypeString', () => {
  it('returns the exact ts strings', () => {
    expect(getHapticNotificationTypeString('success')).toEqual('success');
    expect(getHapticNotificationTypeString('warning')).toEqual('warning');
    expect(getHapticNotificationTypeString('error')).toEqual('error');
  });
});

describe('getHapticsOperationString', () => {
  it('returns the exact ts strings', () => {
    const cases = [
      ['cancel', 'cancel'],
      ['capabilities', 'capabilities'],
      ['impact', 'impact'],
      ['isSupported', 'isSupported'],
      ['notification', 'notification'],
      ['prepare', 'prepare'],
      ['selection', 'selection'],
      ['vibrate', 'vibrate'],
      ['vibratePattern', 'vibratePattern'],
      ['vibrateWaveform', 'vibrateWaveform'],
    ] as const;
    for (const [value, string] of cases) {
      expect(getHapticsOperationString(value)).toEqual(string);
    }
  });
});

describe('parseHapticImpactStyle', () => {
  it('parses exact strings and rejects other spellings', () => {
    expect(parseHapticImpactStyle('light')).toEqual('light');
    expect(parseHapticImpactStyle('medium')).toEqual('medium');
    expect(parseHapticImpactStyle('heavy')).toEqual('heavy');
    expect(parseHapticImpactStyle('soft')).toEqual('soft');
    expect(parseHapticImpactStyle('rigid')).toEqual('rigid');
    expect(parseHapticImpactStyle('Light')).toEqual(undefined);
    expect(parseHapticImpactStyle('')).toEqual(undefined);
  });
});

describe('parseHapticNotificationType', () => {
  it('parses exact strings and rejects other spellings', () => {
    expect(parseHapticNotificationType('success')).toEqual('success');
    expect(parseHapticNotificationType('warning')).toEqual('warning');
    expect(parseHapticNotificationType('error')).toEqual('error');
    expect(parseHapticNotificationType('Success')).toEqual(undefined);
    expect(parseHapticNotificationType('')).toEqual(undefined);
  });
});

describe('parseHapticsOperation', () => {
  it('parses exact strings and rejects other spellings', () => {
    const cases = [
      ['cancel', 'cancel'],
      ['capabilities', 'capabilities'],
      ['impact', 'impact'],
      ['isSupported', 'isSupported'],
      ['notification', 'notification'],
      ['prepare', 'prepare'],
      ['selection', 'selection'],
      ['vibrate', 'vibrate'],
      ['vibratePattern', 'vibratePattern'],
      ['vibrateWaveform', 'vibrateWaveform'],
    ] as const;
    for (const [string, value] of cases) {
      expect(parseHapticsOperation(string)).toEqual(value);
    }
    expect(parseHapticsOperation('issupported')).toEqual(undefined);
    expect(parseHapticsOperation('')).toEqual(undefined);
  });
});
