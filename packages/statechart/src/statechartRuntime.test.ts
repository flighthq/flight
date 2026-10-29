import { describe, expect, it } from 'vitest';

import {
  isStatechartComparison,
  isStatechartInteger,
  isStatechartString,
  throwStatechartInputKindTypeError,
  throwStatechartTypeError,
  throwStatechartUnknownInputKindTypeError,
} from './statechartRuntime.ts';
import { StatechartComparison, StatechartInputKind } from './types.ts';

describe('isStatechartComparison', () => {
  it('accepts only the public comparison vocabulary', () => {
    expect(isStatechartComparison(StatechartComparison.Equal)).toBe(true);
    expect(isStatechartComparison('Unknown' as StatechartComparison)).toBe(false);
  });
});

describe('isStatechartInteger', () => {
  it('rejects fractional JavaScript indices', () => {
    expect(isStatechartInteger(1)).toBe(true);
    expect(isStatechartInteger(0.5)).toBe(false);
  });
});

describe('isStatechartString', () => {
  it('rejects non-string values at the TypeScript boundary', () => {
    expect(isStatechartString('Statechart.Custom')).toBe(true);
    expect(isStatechartString(1 as unknown as string)).toBe(false);
  });
});

describe('throwStatechartInputKindTypeError', () => {
  it('preserves known and malformed JavaScript values in mismatch diagnostics', () => {
    expect(() =>
      throwStatechartInputKindTypeError(2, 'Unknown' as StatechartInputKind, StatechartInputKind.Boolean),
    ).toThrow('Statechart input 2 is Unknown, not Boolean');
  });
});

describe('throwStatechartTypeError', () => {
  it('preserves the public TypeError class and message', () => {
    expect(() => throwStatechartTypeError('invalid statechart')).toThrow(TypeError);
    expect(() => throwStatechartTypeError('invalid statechart')).toThrow('invalid statechart');
  });
});

describe('throwStatechartUnknownInputKindTypeError', () => {
  it('preserves malformed JavaScript values in construction diagnostics', () => {
    expect(() => throwStatechartUnknownInputKindTypeError(1, 'Unknown' as StatechartInputKind)).toThrow(
      'Statechart input 1 has unknown kind Unknown',
    );
  });
});
