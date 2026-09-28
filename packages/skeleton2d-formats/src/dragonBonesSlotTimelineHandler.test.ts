import { describe, expect, it } from 'vitest';

import { dragonBonesSlotTimelineHandler, dragonBonesSlotTimelineReader } from './dragonBonesSlotTimelineHandler.ts';

describe('dragonBonesSlotTimelineHandler', () => {
  it('is the slot timeline handler', () => {
    expect(dragonBonesSlotTimelineHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesSlotTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesSlotTimelineReader).toBe(dragonBonesSlotTimelineHandler);
  });
});
