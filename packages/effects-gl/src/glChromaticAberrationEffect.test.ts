import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyChromaticAberrationEffectToGl,
  defaultGlChromaticAberrationEffectRunner,
  registerGlChromaticAberrationEffect,
} from './glChromaticAberrationEffect';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'glChromaticAberrationEffect.ts'), 'utf8');

function normalizeDirection(
  vector: readonly [number, number],
  epsilon: readonly [number, number],
): readonly [number, number] {
  const x = vector[0] + epsilon[0];
  const y = vector[1] + epsilon[1];
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}

function readShaderEpsilon(): readonly [number, number] {
  const match = SOURCE.match(/normalize\(centered \+ vec2\(([^,]+), ([^)]+)\)\)/);
  if (match === null) throw new Error('chromatic-aberration shader lost its explicit two-axis normalize epsilon');
  const epsilon = [Number(match[1]), Number(match[2])] as const;
  if (!epsilon.every(Number.isFinite)) throw new Error('chromatic-aberration normalize epsilon is not numeric');
  return epsilon;
}

describe('applyChromaticAberrationEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyChromaticAberrationEffectToGl).toBe('function');
  });

  it('keeps the radial direction finite and GL-oriented at and near the optical center', () => {
    const unguardedCenter = normalizeDirection([0, 0], [0, 0]);
    const preFixCenter = normalizeDirection([0, 0], [1e-5, 1e-5]);
    const fixedCenter = normalizeDirection([0, 0], readShaderEpsilon());
    const fixedNearCenter = normalizeDirection([1e-6, 1e-6], readShaderEpsilon());

    expect(unguardedCenter.every(Number.isNaN)).toBe(true);
    expect(preFixCenter[0]).toBeCloseTo(Math.SQRT1_2, 8);
    expect(preFixCenter[1]).toBeCloseTo(Math.SQRT1_2, 8);
    expect(fixedCenter[0]).toBeCloseTo(Math.SQRT1_2, 8);
    expect(fixedCenter[1]).toBeCloseTo(-Math.SQRT1_2, 8);
    expect(fixedNearCenter[0]).toBeCloseTo(11 / Math.sqrt(202), 8);
    expect(fixedNearCenter[1]).toBeCloseTo(-9 / Math.sqrt(202), 8);
    expect(Math.hypot(...fixedCenter)).toBeCloseTo(1, 12);
    expect(Math.hypot(...fixedNearCenter)).toBeCloseTo(1, 12);
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
