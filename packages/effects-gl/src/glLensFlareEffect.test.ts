import { createLensFlareEffect } from '@flighthq/effects/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import * as glEffectProgramCache from './glEffectProgramCache';
import {
  applyLensFlareEffectToGl,
  defaultGlLensFlareEffectRunner,
  registerGlLensFlareEffect,
} from './glLensFlareEffect';

// ★ THE SHADER IS READ FROM THE ARGUMENT THE EFFECT HANDS THE PROGRAM CACHE, not from the source file on
// disk. Both reach the same text, but the disk route needs `node:fs` in a RENDER package's tests, which
// has no node types and should not gain them — it left effects-gl unable to typecheck at all. Capturing
// the argument also reads the exact string that would be compiled rather than a file that merely
// contains it.
let SOURCE: string;

beforeAll(() => {
  const spy = vi
    .spyOn(glEffectProgramCache, 'getGlEffectProgram')
    .mockImplementation(((_state: unknown, _key: string, _source: string) => ({ program: {} })) as never);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation((() => {}) as never);
  const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;
  applyLensFlareEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, createLensFlareEffect());
  SOURCE = spy.mock.calls[0]![2] as string;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(glEffectProgramCache, 'getGlEffectProgram').mockImplementation(((
    _state: unknown,
    _key: string,
    _source: string,
  ) => ({ program: {} })) as never);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
