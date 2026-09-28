import { describe, expect, it } from 'vitest';

import {
  skipSpineBinarySlotTimelines,
  spineBinarySlotTimelineHandler,
  spineBinarySlotTimelineReader,
} from './spineBinarySlotTimelineHandler.ts';

describe('skipSpineBinarySlotTimelines', () => {
  it('is the slot timeline skip function', () => {
    expect(skipSpineBinarySlotTimelines).toBeTypeOf('function');
  });
});

describe('spineBinarySlotTimelineHandler', () => {
  it('is the slot timeline handler', () => {
    expect(spineBinarySlotTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinarySlotTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinarySlotTimelineReader).toBe(spineBinarySlotTimelineHandler);
  });
});
