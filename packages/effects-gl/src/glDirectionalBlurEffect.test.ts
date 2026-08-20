import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDirectionalBlurEffectToGl,
  defaultGlDirectionalBlurEffectRunner,
  registerGlDirectionalBlurEffect,
} from './glDirectionalBlurEffect';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'glDirectionalBlurEffect.ts'), 'utf8');

describe('applyDirectionalBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToGl).toBe('function');
  });

  it('negates sin(u_angle) for GL UV bottom-left origin', () => {
    expect(SOURCE).toContain('vec2(cos(u_angle), -sin(u_angle))');
  });
});

describe('defaultGlDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('registerGlDirectionalBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDirectionalBlurEffect).toBeTypeOf('function');
  });
});
