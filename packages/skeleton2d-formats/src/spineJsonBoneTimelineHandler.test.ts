import { describe, expect, it } from 'vitest';

import { spineJsonBoneTimelineHandler, spineJsonBoneTimelineReader } from './spineJsonBoneTimelineHandler.ts';

describe('spineJsonBoneTimelineHandler', () => {
  it('is the bone timeline handler', () => {
    expect(spineJsonBoneTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonBoneTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonBoneTimelineReader).toBe(spineJsonBoneTimelineHandler);
  });
});
