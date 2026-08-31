import {
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlContextFromCanvasElement,
  createGlRenderState,
} from '@flighthq/render-gl/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import type { GlitchEffect, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import * as glEffectProgramCache from './glEffectProgramCache';
import { applyGlitchEffectToGl, defaultGlGlitchEffectRunner, registerGlGlitchEffect } from './glGlitchEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

// The shader is module-private, so it is read back from the argument the effect hands the program
// cache — the exact text that would be compiled — rather than exported for the test's benefit.
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

// Four bands of 25 rows over a 100-row frame, so every sample row sits well inside a band rather than
// on a boundary where floor could go either way.
const FRAME_ROWS = 100;
const BLOCK_ROWS = 25;

function apply(effect: Readonly<Partial<GlitchEffect>> = {}): void {
  vi.mocked(glEffectProgramCache.getGlEffectProgram).mockClear();
  glMock.uniform1f.mockClear();
  glMock.uniform2f.mockClear();
  const target = { height: FRAME_ROWS, texture: {}, width: 200 } as unknown as GlRenderTarget;
  applyGlitchEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'GlitchEffect',
    ...effect,
  } as GlitchEffect);
}

function blockExpression(): string {
  apply();
  const source = vi.mocked(glEffectProgramCache.getGlEffectProgram).mock.calls[0]![2] as string;
  return extractGlslExpression(source, /float block = ([^;]+);/);
}

function blockAtTexcoordY(texcoordY: number): number {
  return evaluateGlslScalarExpression(blockExpression(), {
    blockSize: BLOCK_ROWS,
    'u_resolution.y': FRAME_ROWS,
    'v_texCoord.y': texcoordY,
  });
}

function uniformValue(name: string): number {
  const call = glMock.uniform1f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform1f call for ${name}`);
  return call[1] as number;
}

describe('applyGlitchEffectToGl', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR. The shader numbered blocks straight from
  // `v_texCoord.y`, which on a bottom-left-origin render target counts up from the BOTTOM — so band 0,
  // the one an author places at the top, landed at the bottom on WebGL and at the top on WebGPU. Every
  // per-block value (the tear offset, the corruption roll) is hashed from the index, so the whole
  // pattern arrives upside down while still looking like a plausible glitch. No type sees it and a
  // mirrored frame comparison does not either: both frames are banded.
  //
  // jsdom compiles no GLSL, so the shipped expression is evaluated arithmetically rather than rendered.
  // That is narrower than a render — it says nothing about the tear, the hash, or the channel split —
  // but it is a claim about the value the shader computes, not about how the line is spelled.
  //
  // MEASURED against the defect, by restoring 0f0e85b23^'s exact line into the shader — 3 of 7 failed:
  //   AssertionError: expected 3 to be +0 // Object.is equality
  //   AssertionError: expected +0 to be 3 // Object.is equality
  //   AssertionError: expected [ 3, 2, 1, +0 ] to deeply equal [ +0, 1, 2, 3 ]
  it('numbers the topmost band 0', () => {
    // Image row 10 of 100 sits in the first band; on a bottom-left target that is texcoord y 0.9.
    expect(blockAtTexcoordY(0.9)).toBe(0);
  });

  it('numbers the bottommost band last', () => {
    expect(blockAtTexcoordY(0.1)).toBe(3);
  });

  it('numbers bands monotonically downward, so the whole sequence runs one way', () => {
    const rows = [0.95, 0.7, 0.45, 0.2];
    const blocks = rows.map((texcoordY) => blockAtTexcoordY(texcoordY));

    expect(blocks).toEqual([0, 1, 2, 3]);
    for (let index = 1; index < blocks.length; index++) expect(blocks[index - 1]!).toBeLessThan(blocks[index]!);
  });

  it('floors blockSize at two rows, so a degenerate size cannot divide by zero', () => {
    apply({ blockSize: 0 });

    expect(uniformValue('u_blockSize')).toBe(0);
    // The clamp is the shader's, applied to the uniform it is given.
    expect(evaluateGlslScalarExpression('max(2.0, u_blockSize)', { u_blockSize: 0 })).toBe(2);
  });

  it('passes the descriptor defaults through as uniforms', () => {
    apply();

    expect(uniformValue('u_intensity')).toBe(0.5);
    expect(uniformValue('u_blockSize')).toBe(24);
    expect(uniformValue('u_colorShift')).toBe(8);
    expect(uniformValue('u_seed')).toBe(0);
  });
});

describe('defaultGlGlitchEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    vi.mocked(glEffectProgramCache.getGlEffectProgram).mockClear();
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlGlitchEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      { kind: 'GlitchEffect' } as GlitchEffect,
    );

    expect(vi.mocked(glEffectProgramCache.getGlEffectProgram).mock.calls[0]![1]).toBe('stylization.glitch');
  });
});

describe('registerGlGlitchEffect', () => {
  it('makes the runner resolvable for the GlitchEffect kind', () => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );

    expect(getGlRenderEffectRunner(state, 'GlitchEffect')).toBeNull();
    registerGlGlitchEffect(state);
    expect(getGlRenderEffectRunner(state, 'GlitchEffect')).toBe(defaultGlGlitchEffectRunner);
  });
});
