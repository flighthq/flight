import { createGlRenderState } from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget, RadialBlurEffect } from '@flighthq/types/contract';

const programMock = vi.hoisted(() => ({ getGlEffectProgram: vi.fn(() => ({ program: {} })) }));
const glMock = vi.hoisted(() => ({ uniform1f: vi.fn(), uniform2f: vi.fn() }));

vi.mock('./glEffectProgramCache', () => programMock);

// Partial, not wholesale: `createGlRenderState` and the runtime accessor the registry reaches through
// must stay real, or the registration test below would be asserting against a mock of itself.
vi.mock('@flighthq/render-gl/contract', async () => {
  const actual = (await vi.importActual('@flighthq/render-gl/contract')) as Record<string, unknown>;
  return {
    ...actual,
    drawGlFullscreenPass: vi.fn((_state, _program, _textures, _dest, setUniforms) => {
      setUniforms({ ...glMock, getUniformLocation: (_p: unknown, name: string) => name }, { program: {} });
    }),
  };
});

import {
  applyRadialBlurEffectToGl,
  defaultGlRadialBlurEffectRunner,
  registerGlRadialBlurEffect,
} from './glRadialBlurEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';

function apply(effect: Readonly<Partial<RadialBlurEffect>> = {}): void {
  programMock.getGlEffectProgram.mockClear();
  glMock.uniform1f.mockClear();
  glMock.uniform2f.mockClear();
  const target = { height: 64, texture: {}, width: 64 } as unknown as GlRenderTarget;
  applyRadialBlurEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'RadialBlurEffect',
    ...effect,
  } as RadialBlurEffect);
}

function center(): readonly number[] {
  const call = glMock.uniform2f.mock.calls.find((entry) => entry[0] === 'u_center');
  if (call === undefined) throw new Error('no uniform2f call for u_center');
  return call.slice(1) as readonly number[];
}

function scalarUniform(name: string): number {
  const call = glMock.uniform1f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform1f call for ${name}`);
  return call[1] as number;
}

describe('applyRadialBlurEffectToGl', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR. `RadialBlurEffect.centerY` is screen space — top-left
  // origin, +Y down — and this pass reads a BOTTOM-left-origin texcoord, so the descriptor value has to be
  // converted at this seam. It was forwarded untouched, so the zoom smeared about a point mirrored across
  // the frame: for centerY 0.4 the sharp band landed at 0.6 instead, where no shape sat, and the entire
  // picture blurred. `centerY` is a `number` under both readings, and 0.5 is its own mirror, so neither
  // the type nor a centred scene can tell the two apart.
  //
  // MEASURED against the defect, by restoring df48bfa1c^'s exact line into this runner — 4 of 8 failed:
  //   AssertionError: expected 0.4 to be close to 0.6, received difference is 0.19999999999999996
  //   AssertionError: expected 0.05 to be close to 0.95, received difference is 0.8999999999999999
  //   AssertionError: expected 0.1 to be greater than 0.9
  //   AssertionError: expected 0.25 to be close to 0.75, received difference is 0.5
  it('converts a top-left centerY into this backend bottom-left texcoord space', () => {
    apply({ centerX: 0.3, centerY: 0.4 });

    // 0.4 down from the top is 0.6 up from the bottom. X shares an origin on both backends and must not
    // be touched — converting it too would pass the Y assertion while moving the blur sideways.
    expect(center()[0]).toBeCloseTo(0.3, 6);
    expect(center()[1]).toBeCloseTo(0.6, 6);
  });

  it('keeps a centre near the top of the frame near the top', () => {
    apply({ centerY: 0.05 });

    expect(center()[1]).toBeCloseTo(0.95, 6);
  });

  // The ordering claim, which is what stops a conversion that merely offsets from passing the two above.
  it('maps a higher centre to a larger texcoord than a lower one', () => {
    apply({ centerY: 0.1 });
    const high = center()[1]!;
    apply({ centerY: 0.9 });
    const low = center()[1]!;

    expect(high).toBeGreaterThan(low);
  });

  it('defaults to the frame centre, the one value the conversion cannot be seen at', () => {
    apply();

    expect(center()).toEqual([0.5, 0.5]);
  });

  it('passes strength and sample count through as descriptor defaults', () => {
    apply();

    expect(scalarUniform('u_strength')).toBe(0.2);
    expect(scalarUniform('u_samples')).toBe(16);
  });

  // One program serves every parameterisation — the sample count is a uniform, not baked into the source
  // — so the cache key must not vary with the descriptor.
  it('compiles one program for the effect regardless of the descriptor', () => {
    apply({ samples: 8 });
    const first = programMock.getGlEffectProgram.mock.calls[0]![1];
    apply({ samples: 32 });

    expect(programMock.getGlEffectProgram.mock.calls[0]![1]).toBe(first);
    expect(first).toBe('radialBlur');
  });
});

describe('defaultGlRadialBlurEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    glMock.uniform2f.mockClear();
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlRadialBlurEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      { centerY: 0.25, kind: 'RadialBlurEffect' } as RadialBlurEffect,
    );

    expect(center()[1]).toBeCloseTo(0.75, 6);
  });
});

describe('registerGlRadialBlurEffect', () => {
  it('makes the runner resolvable for the RadialBlurEffect kind', () => {
    const state = createGlRenderState(document.createElement('canvas'));

    expect(getGlRenderEffectRunner(state, 'RadialBlurEffect')).toBeNull();
    registerGlRadialBlurEffect(state);
    expect(getGlRenderEffectRunner(state, 'RadialBlurEffect')).toBe(defaultGlRadialBlurEffectRunner);
  });
});
