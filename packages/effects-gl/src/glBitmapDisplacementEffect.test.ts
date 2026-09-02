import {
  createGlContextFromCanvasElement,
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlRenderState,
} from '@flighthq/render-gl/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import type { BitmapDisplacementEffect, GlRenderState, GlRenderTarget, Texture2D } from '@flighthq/types/contract';
import { ImageChannel } from '@flighthq/types/contract';

import {
  applyBitmapDisplacementEffectToGl,
  defaultGlBitmapDisplacementEffectRunner,
  isGlBitmapDisplacementEffectResolvable,
  registerGlBitmapDisplacementEffect,
} from './glBitmapDisplacementEffect';
import * as glEffectProgramCache from './glEffectProgramCache';
import { getGlRenderEffectRunner, isGlRenderEffectResolvable } from './glRenderEffectRegistry';
import { explainGlRenderEffectApplication } from './glRenderTextureEffect';

const sourceTexture = {} as WebGLTexture;
const mapTexture = {} as WebGLTexture;
const source = {
  colorSpace: 'srgb',
  height: 64,
  texture: sourceTexture,
  width: 128,
} as GlRenderTarget;
const dest = { ...source, texture: {} as WebGLTexture } as GlRenderTarget;
const map = {
  colorSpace: 'linear',
  dimension: '2d',
  source: {},
} as unknown as Texture2D;
const state = { gl: {} } as GlRenderState;
const draw = vi.fn();
const program = vi.fn((_state: unknown, key: string, fragmentSource: string) => ({
  fragmentSource,
  key,
  program: {},
}));
const gl = {
  getUniformLocation: vi.fn((_program: unknown, name: string) => name),
  uniform1i: vi.fn(),
  uniform2f: vi.fn(),
};

beforeEach(() => {
  draw.mockReset();
  program.mockClear();
  gl.getUniformLocation.mockClear();
  gl.uniform1i.mockClear();
  gl.uniform2f.mockClear();
  vi.spyOn(renderGlContract, 'resolveGlTexture').mockReturnValue(mapTexture);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation(((
    _state: unknown,
    effectProgram: unknown,
    inputs: unknown,
    output: unknown,
    set: (gl: never, program: never) => void,
  ) => {
    draw(effectProgram, inputs, output);
    set(gl as never, effectProgram as never);
  }) as never);
  vi.spyOn(glEffectProgramCache, 'getGlEffectProgram').mockImplementation(program as never);
  vi.spyOn(glEffectProgramCache, 'getGlEffectUniformLocation').mockImplementation(
    ((_state: unknown, _program: unknown, name: string) => name) as never,
  );
});

afterEach(() => vi.restoreAllMocks());

function effect(overrides: Readonly<Partial<BitmapDisplacementEffect>> = {}): BitmapDisplacementEffect {
  return { kind: 'BitmapDisplacementEffect', map, ...overrides } as BitmapDisplacementEffect;
}

function uniform1i(name: string): number {
  const call = gl.uniform1i.mock.calls.find((candidate) => candidate[0] === name);
  if (call === undefined) throw new Error(`missing ${name}`);
  return call[1] as number;
}

function uniform2f(name: string): readonly [number, number] {
  const call = gl.uniform2f.mock.calls.find((candidate) => candidate[0] === name);
  if (call === undefined) throw new Error(`missing ${name}`);
  return [call[1] as number, call[2] as number];
}

describe('applyBitmapDisplacementEffectToGl', () => {
  it('binds the source and resolved map in one fullscreen pass', () => {
    applyBitmapDisplacementEffectToGl(state, source, dest, effect());

    expect(renderGlContract.resolveGlTexture).toHaveBeenCalledWith(state, map, false, source.colorSpace);
    expect(draw).toHaveBeenCalledWith(expect.anything(), [sourceTexture, mapTexture], dest);
    expect(program).toHaveBeenCalledWith(state, 'spatial.bitmapDisplacement', expect.any(String));
  });

  it('maps selected channels and preserves signed scale uniforms', () => {
    applyBitmapDisplacementEffectToGl(
      state,
      source,
      dest,
      effect({
        componentX: ImageChannel.Alpha,
        componentY: ImageChannel.Blue,
        scaleX: -14,
        scaleY: 9,
      }),
    );

    expect(uniform1i('u_componentX')).toBe(ImageChannel.Alpha);
    expect(uniform1i('u_componentY')).toBe(ImageChannel.Blue);
    expect(uniform2f('u_scale')).toEqual([-14, 9]);
    expect(uniform2f('u_resolution')).toEqual([source.width, source.height]);
  });

  it.each([
    ['clamp', 0],
    ['wrap', 1],
  ] as const)('maps %s edge mode to shader branch %s', (edgeMode, expected) => {
    applyBitmapDisplacementEffectToGl(state, source, dest, effect({ edgeMode }));
    expect(uniform1i('u_edgeMode')).toBe(expected);
  });

  it('ships map-channel, centred offset, wrap, clamp, and GL vertical-offset shader branches', () => {
    applyBitmapDisplacementEffectToGl(state, source, dest, effect());
    const shader = program.mock.calls[0]![2];

    expect(shader).toContain('sampleChannel(mapSample, u_componentX)');
    expect(shader).toContain('sampleChannel(mapSample, u_componentY)');
    expect(shader).toContain('(mapped - vec2(0.5)) * u_scale');
    expect(shader).toContain('fract(displaced)');
    expect(shader).toContain('clamp(displaced, vec2(0.0), vec2(1.0))');
    expect(shader).toContain('v_texCoord.y - displacement.y');
  });

  it('copies through when the map is absent or unresolved', () => {
    vi.mocked(renderGlContract.resolveGlTexture).mockReturnValue(null);
    applyBitmapDisplacementEffectToGl(state, source, dest, effect());
    applyBitmapDisplacementEffectToGl(state, source, dest, effect({ map: null }));

    expect(draw).toHaveBeenNthCalledWith(1, expect.anything(), [sourceTexture], dest);
    expect(draw).toHaveBeenNthCalledWith(2, expect.anything(), [sourceTexture], dest);
  });
});

describe('defaultGlBitmapDisplacementEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    defaultGlBitmapDisplacementEffectRunner(
      { dest, pool: { free: [] }, source, state } as never,
      effect({ scaleX: 3, scaleY: 4 }),
    );
    expect(uniform2f('u_scale')).toEqual([3, 4]);
  });
});

describe('isGlBitmapDisplacementEffectResolvable', () => {
  it('exposes the missing-map sentinel', () => {
    expect(isGlBitmapDisplacementEffectResolvable(state, effect())).toBe(true);
    expect(isGlBitmapDisplacementEffectResolvable(state, effect({ map: null }))).toBe(false);
    vi.mocked(renderGlContract.resolveGlTexture).mockReturnValue(null);
    expect(isGlBitmapDisplacementEffectResolvable(state, effect())).toBe(false);
  });
});

describe('registerGlBitmapDisplacementEffect', () => {
  it('registers both the runner and per-instance map resolver', () => {
    const registeredState = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );

    expect(getGlRenderEffectRunner(registeredState, 'BitmapDisplacementEffect')).toBeNull();
    registerGlBitmapDisplacementEffect(registeredState);
    expect(getGlRenderEffectRunner(registeredState, 'BitmapDisplacementEffect')).toBe(
      defaultGlBitmapDisplacementEffectRunner,
    );
    expect(isGlRenderEffectResolvable(registeredState, effect({ map: null }))).toBe(false);
    expect(explainGlRenderEffectApplication(registeredState, [effect({ map: null })], true)).toMatchObject({
      status: 'unresolved-effects',
      unresolvedIndexes: [0],
    });
  });
});
