import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyLensFlareEffectToGl,
  defaultGlLensFlareEffectRunner,
  registerGlLensFlareEffect,
} from './glLensFlareEffect';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'glLensFlareEffect.ts'), 'utf8');

describe('applyLensFlareEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensFlareEffectToGl).toBe('function');
  });

  it('negates the halo normalize epsilon Y for GL UV bottom-left origin', () => {
    expect(SOURCE).toContain('vec2(1e-5, -1e-5)');
  });
});

describe('defaultGlLensFlareEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLensFlareEffectRunner).toBe('function');
  });
});

describe('registerGlLensFlareEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlLensFlareEffect).toBeTypeOf('function');
  });
});
