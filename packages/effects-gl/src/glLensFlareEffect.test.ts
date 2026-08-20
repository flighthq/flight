import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyLensFlareEffectToGl,
  defaultGlLensFlareEffectRunner,
  registerGlLensFlareEffect,
} from './glLensFlareEffect';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'glLensFlareEffect.ts'), 'utf8');

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
  const match = SOURCE.match(/normalize\(toCenter \+ vec2\(([^,]+), ([^)]+)\)\)/);
  if (match === null) throw new Error('lens-flare shader lost its explicit two-axis halo normalize epsilon');
  const epsilon = [Number(match[1]), Number(match[2])] as const;
  if (!epsilon.every(Number.isFinite)) throw new Error('lens-flare halo normalize epsilon is not numeric');
  return epsilon;
}

describe('applyLensFlareEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensFlareEffectToGl).toBe('function');
  });

  // Scope boundary: this pins only the normalize epsilon sign for an already-computed `toCenter` vector. Changing
  // that UV transform can invert which sign is correct without this unit seeing the other term. The composed
  // transform-plus-epsilon invariant is deferred to the approved top-left/Y-down effect-UV migration.
  it('pins the halo normalize epsilon sign at and near zero input', () => {
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
