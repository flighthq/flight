import { createGlContextFromCanvasElement, createGlRenderState } from '@flighthq/render-gl/contract';
import type { DisplacementEffect, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

const programMock = vi.hoisted(() => ({
  getGlEffectProgram: vi.fn((_state: unknown, _key: string, _source: string) => ({ program: {} })),
}));
const glMock = vi.hoisted(() => ({
  uniform1f: vi.fn((_location: unknown, _value: number) => {}),
  uniform2f: vi.fn((_location: unknown, _x: number, _y: number) => {}),
}));

vi.mock('./glEffectProgramCache', () => programMock);

vi.mock('@flighthq/render-gl/contract', async () => {
  const actual = (await vi.importActual('@flighthq/render-gl/contract')) as Record<string, unknown>;
  return {
    ...actual,
    drawGlFullscreenPass: vi.fn((_state, _program, _textures, _dest, setUniforms) => {
      setUniforms({ ...glMock, getUniformLocation: (_program: unknown, name: string) => name }, { program: {} });
    }),
  };
});

import {
  applyDisplacementEffectToGl,
  defaultGlDisplacementEffectRunner,
  registerGlDisplacementEffect,
} from './glDisplacementEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

const SOURCE_WIDTH = 128;
const SOURCE_HEIGHT = 64;

beforeEach(() => {
  programMock.getGlEffectProgram.mockClear();
  glMock.uniform1f.mockClear();
  glMock.uniform2f.mockClear();
});

function apply(effect: Readonly<Partial<DisplacementEffect>> = {}): void {
  const target = { height: SOURCE_HEIGHT, texture: {}, width: SOURCE_WIDTH } as unknown as GlRenderTarget;
  applyDisplacementEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'DisplacementEffect',
    ...effect,
  } as DisplacementEffect);
}

function shaderSource(): string {
  apply();
  return programMock.getGlEffectProgram.mock.calls[0]![2] as string;
}

function uniformValue(name: string): number {
  const call = glMock.uniform1f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform1f call for ${name}`);
  return call[1] as number;
}

describe('applyDisplacementEffectToGl', () => {
  // The defect repaired in 1d71634fc used the bottom-left texcoord directly for this phase. The test
  // evaluates the shader's own image-row and wave expressions, so restoring that line either loses the
  // required imageY binding or produces the opposite row's phase.
  it('drives the horizontal warp from top-left image space', () => {
    const source = shaderSource();
    const imageY = evaluateGlslScalarExpression(extractGlslExpression(source, /float imageY = ([^;]+);/), {
      'v_texCoord.y': 0.8,
    });
    const warpX = evaluateGlslScalarExpression(extractGlslExpression(source, /vec2 warp = vec2\(\s*([^,]+),/s), {
      f: 2.5,
      imageY,
      u_seed: 0.3,
    });
    const expected = Math.sin(0.2 * 2.5 + 0.3) + Math.sin(0.2 * 2.5 * 2.3 + 0.3 * 1.7) * 0.5;

    expect(imageY).toBeCloseTo(0.2, 10);
    expect(warpX).toBeCloseTo(expected, 10);
  });

  it('negates a vertical image-space offset on the way back to bottom-left texcoords', () => {
    const expression = extractGlslExpression(shaderSource(), /vec2 displaced = vec2\([^,]+,\s*([^)]+)\);/);
    const displacedY = evaluateGlslScalarExpression(expression, {
      'offset.y': 0.1,
      'v_texCoord.y': 0.4,
    });

    expect(displacedY).toBeCloseTo(0.3, 10);
  });

  it('passes the descriptor and source dimensions through to the shader uniforms', () => {
    apply({ frequency: 7, intensity: 3, seed: 0.25 });

    expect(uniformValue('u_intensity')).toBe(3);
    expect(uniformValue('u_frequency')).toBe(7);
    expect(uniformValue('u_seed')).toBeCloseTo(0.25, 6);
    expect(glMock.uniform2f).toHaveBeenCalledWith('u_resolution', SOURCE_WIDTH, SOURCE_HEIGHT);
  });

  it('uses the documented displacement defaults', () => {
    apply();

    expect(uniformValue('u_intensity')).toBe(8);
    expect(uniformValue('u_frequency')).toBe(12);
    expect(uniformValue('u_seed')).toBe(0);
  });
});

describe('defaultGlDisplacementEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlDisplacementEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      { intensity: 4, kind: 'DisplacementEffect' } as DisplacementEffect,
    );

    expect(uniformValue('u_intensity')).toBe(4);
  });
});

describe('registerGlDisplacementEffect', () => {
  it('makes the runner resolvable for the DisplacementEffect kind', () => {
    const state = createGlRenderState(createGlContextFromCanvasElement(document.createElement('canvas')));

    expect(getGlRenderEffectRunner(state, 'DisplacementEffect')).toBeNull();
    registerGlDisplacementEffect(state);
    expect(getGlRenderEffectRunner(state, 'DisplacementEffect')).toBe(defaultGlDisplacementEffectRunner);
  });
});
