import { describe, expect, it } from 'vitest';

import { SCENE2D_WORKING_COLOR_SPACE } from './scene2dWorkingColorSpace';

describe('SCENE2D_WORKING_COLOR_SPACE', () => {
  // The 2D tower composites in the encoded domain — byte-through, no decode, no encode. Changing this
  // is a rendered-output change for every 2D scene, not a refactor.
  it('declares the 2D tower encoded, matching its byte-through pipeline', () => {
    expect(SCENE2D_WORKING_COLOR_SPACE).toBe('srgb');
  });
});
