import { createGlRenderState } from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget, GodRaysEffect } from '@flighthq/types/contract';

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

import { applyGodRaysEffectToGl, defaultGlGodRaysEffectRunner, registerGlGodRaysEffect } from './glGodRaysEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';

function apply(effect: Readonly<Partial<GodRaysEffect>> = {}): void {
  programMock.getGlEffectProgram.mockClear();
  glMock.uniform1f.mockClear();
  glMock.uniform2f.mockClear();
  const target = { height: 64, texture: {}, width: 64 } as unknown as GlRenderTarget;
  applyGodRaysEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'GodRaysEffect',
    ...effect,
  } as GodRaysEffect);
}

function lightPosition(): readonly number[] {
  const call = glMock.uniform2f.mock.calls.find((entry) => entry[0] === 'u_lightPosition');
  if (call === undefined) throw new Error('no uniform2f call for u_lightPosition');
  return call.slice(1) as readonly number[];
}

function scalarUniform(name: string): number {
  const call = glMock.uniform1f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform1f call for ${name}`);
  return call[1] as number;
}

describe('applyGodRaysEffectToGl', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR. `GodRaysEffect.centerY` is declared screen space —
  // top-left origin, 0 = top — and this pass reads a BOTTOM-left-origin texcoord, so the value has to be
  // flipped at this seam. It was forwarded untouched, which put the Gl light 120 px below the Wgpu one
  // for the same descriptor. The type is `number` either way, and a light at 0.5 is its own mirror, so
  // neither a type check nor a centred scene can see it.
  //
  // MEASURED against the defect, by restoring c1dcc6c9b^'s exact line into this runner — 4 of 8 failed:
  //   AssertionError: expected 0.2 to be close to 0.8, received difference is 0.6000000000000001
  //   AssertionError: expected 0.9 to be close to 0.1, received difference is 0.8
  //   AssertionError: expected 0.2 to be greater than 0.8
  //   AssertionError: expected 0.25 to be close to 0.75, received difference is 0.5
  it('flips a top-left centerY into this backend bottom-left texcoord space', () => {
    apply({ centerX: 0.25, centerY: 0.2 });

    // 0.2 down from the top is 0.8 up from the bottom. X needs no conversion and must not get one.
    expect(lightPosition()[0]).toBeCloseTo(0.25, 6);
    expect(lightPosition()[1]).toBeCloseTo(0.8, 6);
  });

  it('keeps a light near the bottom of the frame near the bottom', () => {
    apply({ centerY: 0.9 });

    expect(lightPosition()[1]).toBeCloseTo(0.1, 6);
  });

  // The ordering claim, which is what stops a conversion that merely offsets from passing the two above:
  // a light higher in screen space must end up higher in texcoord space, for every pair.
  it('maps a higher light to a larger texcoord than a lower one', () => {
    apply({ centerY: 0.2 });
    const high = lightPosition()[1]!;
    apply({ centerY: 0.8 });
    const low = lightPosition()[1]!;

    expect(high).toBeGreaterThan(low);
  });

  it('defaults the light to the frame centre, the one value the conversion cannot be seen at', () => {
    apply();

    expect(lightPosition()).toEqual([0.5, 0.5]);
  });

  it('passes the marching parameters through as descriptor defaults', () => {
    apply();

    expect(scalarUniform('u_density')).toBe(0.96);
    expect(scalarUniform('u_decay')).toBe(0.93);
    expect(scalarUniform('u_weight')).toBe(0.4);
    expect(scalarUniform('u_exposure')).toBe(0.6);
  });

  // The sample count is baked into the shader, so it belongs to the program key rather than a uniform —
  // a fractional or zero count would otherwise compile a program with a broken loop bound.
  it('rounds the sample count into the program key and floors it at one', () => {
    apply({ samples: 12.4 });
    expect(programMock.getGlEffectProgram.mock.calls[0]![1]).toBe('atmospheric.godRays.12');

    apply({ samples: 0 });
    expect(programMock.getGlEffectProgram.mock.calls[0]![1]).toBe('atmospheric.godRays.1');
  });
});

describe('defaultGlGodRaysEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    programMock.getGlEffectProgram.mockClear();
    glMock.uniform2f.mockClear();
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlGodRaysEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      { centerY: 0.25, kind: 'GodRaysEffect' } as GodRaysEffect,
    );

    expect(lightPosition()[1]).toBeCloseTo(0.75, 6);
  });
});

describe('registerGlGodRaysEffect', () => {
  it('makes the runner resolvable for the GodRaysEffect kind', () => {
    const state = createGlRenderState(document.createElement('canvas'));

    expect(getGlRenderEffectRunner(state, 'GodRaysEffect')).toBeNull();
    registerGlGodRaysEffect(state);
    expect(getGlRenderEffectRunner(state, 'GodRaysEffect')).toBe(defaultGlGodRaysEffectRunner);
  });
});
