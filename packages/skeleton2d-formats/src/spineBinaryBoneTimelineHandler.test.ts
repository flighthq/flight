import { describe, expect, it } from 'vitest';

import {
  buildSpineBinarySegmentEasings,
  skipSpineBinaryBoneTimelines,
  spineBinaryBoneTimelineHandler,
  spineBinaryBoneTimelineReader,
} from './spineBinaryBoneTimelineHandler.ts';

describe('buildSpineBinarySegmentEasings', () => {
  it('is the segment easing builder', () => {
    expect(buildSpineBinarySegmentEasings).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryBoneTimelines', () => {
  it('is the bone timeline skip function', () => {
    expect(skipSpineBinaryBoneTimelines).toBeTypeOf('function');
  });
});

describe('spineBinaryBoneTimelineHandler', () => {
  it('is the bone timeline handler', () => {
    expect(spineBinaryBoneTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryBoneTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryBoneTimelineReader).toBe(spineBinaryBoneTimelineHandler);
  });
});
