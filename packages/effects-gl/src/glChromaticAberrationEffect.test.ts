import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyChromaticAberrationEffectToGl,
  defaultGlChromaticAberrationEffectRunner,
  registerGlChromaticAberrationEffect,
} from './glChromaticAberrationEffect';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'glChromaticAberrationEffect.ts'), 'utf8');

describe('applyChromaticAberrationEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyChromaticAberrationEffectToGl).toBe('function');
  });

  it('negates the normalize epsilon Y for GL UV bottom-left origin', () => {
    expect(SOURCE).toContain('vec2(1e-5, -1e-5)');
  });
});

describe('defaultGlChromaticAberrationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlChromaticAberrationEffectRunner).toBe('function');
  });
});

describe('registerGlChromaticAberrationEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlChromaticAberrationEffect).toBeTypeOf('function');
  });
});
