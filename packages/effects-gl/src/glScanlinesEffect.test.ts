import {
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlContextFromCanvasElement,
  createGlRenderState,
} from '@flighthq/render-gl/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget, ScanlinesEffect } from '@flighthq/types/contract';

import * as glEffectProgramCache from './glEffectProgramCache';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import {
  applyScanlinesEffectToGl,
  defaultGlScanlinesEffectRunner,
  registerGlScanlinesEffect,
} from './glScanlinesEffect';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

const glMock = {
  uniform1f: vi.fn((_location: unknown, _value: number) => {}),
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
      { ...glMock, getUniformLocation: (_program: unknown, name: string) => name } as never,
      { program: {} } as never,
    );
  }) as never);
  vi.mocked(glEffectProgramCache.getGlEffectProgram).mockClear();
  glMock.uniform1f.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function apply(effect: Readonly<Partial<ScanlinesEffect>> = {}): void {
  const target = { height: 60, texture: {}, width: 80 } as unknown as GlRenderTarget;
  applyScanlinesEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'ScanlinesEffect',
    ...effect,
  } as ScanlinesEffect);
}

function lineAtImageY(imageY: number, count: number): number {
  apply();
  const source = vi.mocked(glEffectProgramCache.getGlEffectProgram).mock.calls[0]![2] as string;
  const expression = extractGlslExpression(source, /float line = ([^;]+);/);
  return evaluateGlslScalarExpression(expression, {
    'v_texCoord.y': 1 - imageY,
    u_count: count,
  });
}

function uniformValue(name: string): number {
  const call = glMock.uniform1f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform1f call for ${name}`);
  return call[1] as number;
}

describe('applyScanlinesEffectToGl', () => {
  // The shader runs against bottom-left texcoords while the effect is authored in top-left image space.
  // A non-integral count makes the two rows observably different; an integral count can put both on the
  // same sine phase and let the origin conversion disappear behind a passing assertion.
  it('anchors the pattern to top-left image rows rather than bottom-left texcoords', () => {
    const count = 2.5;

    expect(lineAtImageY(0.2, count)).toBeCloseTo(1, 6);
    expect(lineAtImageY(0.8, count)).toBeCloseTo(0.5, 6);
  });

  it('passes the descriptor values through to the shader uniforms', () => {
    apply({ count: 17, intensity: 0.45 });

    expect(uniformValue('u_count')).toBe(17);
    expect(uniformValue('u_intensity')).toBeCloseTo(0.45, 6);
  });

  it('uses the documented scanline defaults', () => {
    apply();

    expect(uniformValue('u_count')).toBe(240);
    expect(uniformValue('u_intensity')).toBeCloseTo(0.3, 6);
  });
});

describe('defaultGlScanlinesEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlScanlinesEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      { count: 13, kind: 'ScanlinesEffect' } as ScanlinesEffect,
    );

    expect(uniformValue('u_count')).toBe(13);
  });
});

describe('registerGlScanlinesEffect', () => {
  it('makes the runner resolvable for the ScanlinesEffect kind', () => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );

    expect(getGlRenderEffectRunner(state, 'ScanlinesEffect')).toBeNull();
    registerGlScanlinesEffect(state);
    expect(getGlRenderEffectRunner(state, 'ScanlinesEffect')).toBe(defaultGlScanlinesEffectRunner);
  });
});
