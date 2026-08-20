import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyMotionBlurEffectToGl,
  defaultGlMotionBlurEffectRunner,
  registerGlMotionBlurEffect,
} from './glMotionBlurEffect';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'glMotionBlurEffect.ts'), 'utf8');

describe('applyMotionBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToGl).toBe('function');
  });

  it('negates velocityPixels.y for GL UV bottom-left origin', () => {
    expect(SOURCE).toContain('vec2(velocityPixels.x, -velocityPixels.y)');
  });
});

describe('defaultGlMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlMotionBlurEffectRunner).toBe('function');
  });
});

describe('registerGlMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlMotionBlurEffect).toBeTypeOf('function');
  });
});
