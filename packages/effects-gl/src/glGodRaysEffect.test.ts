import { createGodRaysEffect } from '@flighthq/effects/contract';
import {
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlContextFromCanvasElement,
  createGlRenderState,
} from '@flighthq/render-gl/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget, GodRaysEffect } from '@flighthq/types/contract';

import * as glEffectProgramCache from './glEffectProgramCache';
import { applyGodRaysEffectToGl, defaultGlGodRaysEffectRunner, registerGlGodRaysEffect } from './glGodRaysEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';

const glMock = {
  uniform1f: vi.fn((_location: unknown, _value: number) => {}),
  uniform2f: vi.fn((_location: unknown, _x: number, _y: number) => {}),
};

beforeEach(() => {
  vi.spyOn(glEffectProgramCache, 'getGlEffectProgram').mockImplementation(((
    _state: unknown,
    _key: string,
    _source: string,
  ) => ({ program: {} })) as never);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation(((
    _state: never,
    _program: never,
    _textures: never,
    _dest: never,
    setUniforms: (gl: never, program: never) => void,
  ) => {
    setUniforms(
      { ...glMock, getUniformLocation: (_p: unknown, name: string) => name } as never,
      { program: {} } as never,
    );
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function apply(effect: Readonly<Partial<GodRaysEffect>> = {}): void {
  vi.mocked(glEffectProgramCache.getGlEffectProgram).mockClear();
  glMock.uniform1f.mockClear();
  glMock.uniform2f.mockClear();
  const target = { height: 64, texture: {}, width: 64 } as unknown as GlRenderTarget;
  applyGodRaysEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, createGodRaysEffect(effect));
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
  it('flips a top-left centerY into this backend bottom-left texcoord space', () => {
    apply({ centerX: 0.25, centerY: 0.2 });

    expect(lightPosition()[0]).toBeCloseTo(0.25, 6);
    expect(lightPosition()[1]).toBeCloseTo(0.8, 6);
  });

  it('keeps a light near the bottom of the frame near the bottom', () => {
    apply({ centerY: 0.9 });

    expect(lightPosition()[1]).toBeCloseTo(0.1, 6);
  });

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

  it('rounds the sample count into the program key and floors it at one', () => {
    apply({ samples: 12.4 });
    expect(vi.mocked(glEffectProgramCache.getGlEffectProgram).mock.calls[0]![1]).toBe('atmospheric.godRays.12');

    apply({ samples: 0 });
    expect(vi.mocked(glEffectProgramCache.getGlEffectProgram).mock.calls[0]![1]).toBe('atmospheric.godRays.1');
  });
});

describe('defaultGlGodRaysEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    vi.mocked(glEffectProgramCache.getGlEffectProgram).mockClear();
    glMock.uniform2f.mockClear();
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlGodRaysEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      createGodRaysEffect({ centerY: 0.25 }),
    );

    expect(lightPosition()[1]).toBeCloseTo(0.75, 6);
  });
});

describe('registerGlGodRaysEffect', () => {
  it('makes the runner resolvable for the GodRaysEffect kind', () => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );

    expect(getGlRenderEffectRunner(state, 'GodRaysEffect')).toBeNull();
    registerGlGodRaysEffect(state);
    expect(getGlRenderEffectRunner(state, 'GodRaysEffect')).toBe(defaultGlGodRaysEffectRunner);
  });
});
