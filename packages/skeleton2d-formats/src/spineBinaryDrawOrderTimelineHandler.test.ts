import { describe, expect, it } from 'vitest';

import {
  skipSpineBinaryDrawOrderTimeline,
  spineBinaryDrawOrderTimelineHandler,
  spineBinaryDrawOrderTimelineReader,
} from './spineBinaryDrawOrderTimelineHandler.ts';

describe('skipSpineBinaryDrawOrderTimeline', () => {
  it('is the draw order timeline skip function', () => {
    expect(skipSpineBinaryDrawOrderTimeline).toBeTypeOf('function');
  });
});

describe('spineBinaryDrawOrderTimelineHandler', () => {
  it('is the draw order timeline handler', () => {
    expect(spineBinaryDrawOrderTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryDrawOrderTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryDrawOrderTimelineReader).toBe(spineBinaryDrawOrderTimelineHandler);
  });
});
