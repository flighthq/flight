import { describe, expect, it } from 'vitest';

import { spineJsonAnimationsSectionHandler, spineJsonAnimationsSectionReader } from './spineJsonAnimationsHandler.ts';

describe('spineJsonAnimationsSectionHandler', () => {
  it('is the animations section handler', () => {
    expect(spineJsonAnimationsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonAnimationsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonAnimationsSectionReader).toBe(spineJsonAnimationsSectionHandler);
  });
});
