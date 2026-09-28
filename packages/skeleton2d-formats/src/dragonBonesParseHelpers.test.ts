import { describe, expect, it } from 'vitest';

import {
  buildDragonBonesSegmentEasings,
  dragonBonesFrameTimes,
  dragonBonesFrames,
  dragonBonesInterpolation,
  numberOr,
  parseDragonBonesBoneTransform,
  skipCrumbDragonBonesGroup,
} from './dragonBonesParseHelpers.ts';

describe('buildDragonBonesSegmentEasings', () => {
  it('is a function', () => {
    expect(buildDragonBonesSegmentEasings).toBeTypeOf('function');
  });
});

describe('dragonBonesFrames', () => {
  it('is a function', () => {
    expect(dragonBonesFrames).toBeTypeOf('function');
  });
});

describe('dragonBonesFrameTimes', () => {
  it('is a function', () => {
    expect(dragonBonesFrameTimes).toBeTypeOf('function');
  });
});

describe('dragonBonesInterpolation', () => {
  it('is a function', () => {
    expect(dragonBonesInterpolation).toBeTypeOf('function');
  });
});

describe('numberOr', () => {
  it('returns the number when value is a number', () => {
    expect(numberOr(42, 0)).toBe(42);
  });

  it('returns the fallback when value is not a number', () => {
    expect(numberOr('hello', 0)).toBe(0);
    expect(numberOr(undefined, 7)).toBe(7);
    expect(numberOr(null, -1)).toBe(-1);
  });
});

describe('parseDragonBonesBoneTransform', () => {
  it('is a function', () => {
    expect(parseDragonBonesBoneTransform).toBeTypeOf('function');
  });
});

describe('skipCrumbDragonBonesGroup', () => {
  it('is a function', () => {
    expect(skipCrumbDragonBonesGroup).toBeTypeOf('function');
  });
});
