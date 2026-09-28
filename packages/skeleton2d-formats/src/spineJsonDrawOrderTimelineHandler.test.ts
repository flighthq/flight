import { describe, expect, it } from 'vitest';

import {
  spineJsonDrawOrderTimelineHandler,
  spineJsonDrawOrderTimelineReader,
} from './spineJsonDrawOrderTimelineHandler.ts';

describe('spineJsonDrawOrderTimelineHandler', () => {
  it('is the draw order timeline handler', () => {
    expect(spineJsonDrawOrderTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonDrawOrderTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonDrawOrderTimelineReader).toBe(spineJsonDrawOrderTimelineHandler);
  });
});
