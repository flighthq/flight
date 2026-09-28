import { describe, expect, it } from 'vitest';

import { spineJsonSlotTimelineHandler, spineJsonSlotTimelineReader } from './spineJsonSlotTimelineHandler.ts';

describe('spineJsonSlotTimelineHandler', () => {
  it('is the slot timeline handler', () => {
    expect(spineJsonSlotTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonSlotTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonSlotTimelineReader).toBe(spineJsonSlotTimelineHandler);
  });
});
