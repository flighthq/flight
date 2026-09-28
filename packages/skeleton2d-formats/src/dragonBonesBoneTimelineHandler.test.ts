import { describe, expect, it } from 'vitest';

import { dragonBonesBoneTimelineHandler, dragonBonesBoneTimelineReader } from './dragonBonesBoneTimelineHandler.ts';

describe('dragonBonesBoneTimelineHandler', () => {
  it('is the bone timeline handler', () => {
    expect(dragonBonesBoneTimelineHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesBoneTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesBoneTimelineReader).toBe(dragonBonesBoneTimelineHandler);
  });
});
