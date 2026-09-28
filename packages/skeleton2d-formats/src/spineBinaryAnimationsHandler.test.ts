import { describe, expect, it } from 'vitest';

import {
  skipSpineBinaryAnimationsSection,
  spineBinaryAnimationsSectionHandler,
  spineBinaryAnimationsSectionReader,
} from './spineBinaryAnimationsHandler.ts';

describe('skipSpineBinaryAnimationsSection', () => {
  it('is the animations section skip function', () => {
    expect(skipSpineBinaryAnimationsSection).toBeTypeOf('function');
  });
});

describe('spineBinaryAnimationsSectionHandler', () => {
  it('is the animations section handler', () => {
    expect(spineBinaryAnimationsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryAnimationsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryAnimationsSectionReader).toBe(spineBinaryAnimationsSectionHandler);
  });
});
