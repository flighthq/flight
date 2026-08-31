import * as renderGlContract from '@flighthq/render-gl/contract';
import type { DirectionalBlurEffect, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import {
  applyDirectionalBlurEffectToGl,
  defaultGlDirectionalBlurEffectRunner,
  registerGlDirectionalBlurEffect,
} from './glDirectionalBlurEffect';
import * as glEffectProgramCache from './glEffectProgramCache';

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
  applyDirectionalBlurEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'DirectionalBlurEffect',
  } as DirectionalBlurEffect);
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

describe('applyDirectionalBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToGl).toBe('function');
  });

  it('negates sin(u_angle) for GL UV bottom-left origin', () => {
    expect(SOURCE).toContain('vec2(cos(u_angle), -sin(u_angle))');
  });
});

describe('defaultGlDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('registerGlDirectionalBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDirectionalBlurEffect).toBeTypeOf('function');
  });
});
