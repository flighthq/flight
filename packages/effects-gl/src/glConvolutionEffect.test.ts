// The edge color is the one part of this runner with a channel ORDER to get wrong, and it carried a
// packing — 0xAARRGGBB, alpha in the high byte — that no other color in the SDK used. The uniform
// assertion below is what makes the order a fact rather than a reading of four shift expressions.
import * as renderGlContract from '@flighthq/render-gl/contract';

import {
  applyConvolutionEffectToGl,
  defaultGlConvolutionEffectRunner,
  registerGlConvolutionEffect,
} from './glConvolutionEffect';
import * as glEffectProgramCache from './glEffectProgramCache';

const glMock = {
  getUniformLocation: vi.fn((_program: unknown, name: string) => name),
  uniform1f: vi.fn(),
  uniform1fv: vi.fn(),
  uniform1i: vi.fn(),
  uniform2f: vi.fn(),
  uniform4f: vi.fn(),
};

beforeEach(() => {
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation(((
    _state: never,
    _program: never,
    _textures: never,
    _dest: never,
    setUniforms: (gl: never, program: never) => void,
  ) => {
    setUniforms(glMock as never, { program: {} } as never);
  }) as never);
  vi.spyOn(glEffectProgramCache, 'getGlEffectProgram').mockImplementation((() => ({ program: {} })) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const target = { height: 4, texture: {}, width: 4 } as never;

describe('applyConvolutionEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyConvolutionEffectToGl).toBe('function');
  });

  it('binds the edge color as packed RGBA, not as the ARGB it once carried', () => {
    glMock.uniform4f.mockClear();
    applyConvolutionEffectToGl({} as never, target, target, {
      color: 0x44ffee80,
      kind: 'ConvolutionEffect',
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    });

    // 0x44 0xff 0xee 0x80 read in that order. The previous packing produced (1, 0.933, 0.502, 0.267)
    // from this same value — every channel shifted one place, and still a valid-looking color.
    const [, red, green, blue, alpha] = glMock.uniform4f.mock.calls.find((call) => call[0] === 'u_edgeColor')!;
    expect(red).toBeCloseTo(0x44 / 255, 5);
    expect(green).toBeCloseTo(1, 5);
    expect(blue).toBeCloseTo(0xee / 255, 5);
    expect(alpha).toBeCloseTo(0x80 / 255, 5);
  });

  it('defaults the edge color to transparent black when the effect omits it', () => {
    glMock.uniform4f.mockClear();
    applyConvolutionEffectToGl({} as never, target, target, {
      kind: 'ConvolutionEffect',
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    });

    const call = glMock.uniform4f.mock.calls.find((entry) => entry[0] === 'u_edgeColor')!;
    expect(call.slice(1)).toEqual([0, 0, 0, 0]);
  });
});

describe('defaultGlConvolutionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlConvolutionEffectRunner).toBe('function');
  });
});

describe('registerGlConvolutionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlConvolutionEffect).toBeTypeOf('function');
  });
});
