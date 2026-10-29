import { describe, expect, it } from 'vitest';

import {
  getClipRegionContoursReasonString,
  getClipRegionStatusString,
  parseClipRegionContoursReason,
  parseClipRegionStatus,
} from './clipRegionStrings.ts';

describe('getClipRegionContoursReasonString', () => {
  it('returns the exact contour reason literals', () => {
    expect(getClipRegionContoursReasonString('odd-coordinate-count')).toBe('odd-coordinate-count');
    expect(getClipRegionContoursReasonString('too-few-points')).toBe('too-few-points');
  });
});

describe('getClipRegionStatusString', () => {
  it('returns the exact status literals', () => {
    expect(getClipRegionStatusString('active')).toBe('active');
    expect(getClipRegionStatusString('released')).toBe('released');
  });
});

describe('parseClipRegionContoursReason', () => {
  it('parses known contour reasons and rejects unknown values', () => {
    expect(parseClipRegionContoursReason('odd-coordinate-count')).toBe('odd-coordinate-count');
    expect(parseClipRegionContoursReason('vendor')).toBeUndefined();
  });
});

describe('parseClipRegionStatus', () => {
  it('parses known statuses and rejects unknown values', () => {
    expect(parseClipRegionStatus('released')).toBe('released');
    expect(parseClipRegionStatus('vendor')).toBeUndefined();
  });
});
