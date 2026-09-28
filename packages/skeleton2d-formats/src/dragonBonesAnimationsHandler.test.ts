import { describe, expect, it } from 'vitest';

import {
  dragonBonesAnimationsSectionHandler,
  dragonBonesAnimationsSectionReader,
} from './dragonBonesAnimationsHandler.ts';

describe('dragonBonesAnimationsSectionHandler', () => {
  it('is the animations section handler', () => {
    expect(dragonBonesAnimationsSectionHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesAnimationsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesAnimationsSectionReader).toBe(dragonBonesAnimationsSectionHandler);
  });
});
