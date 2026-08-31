import * as renderGlContract from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget, MotionBlurEffect } from '@flighthq/types/contract';

import * as glEffectProgramCache from './glEffectProgramCache';
import {
  applyMotionBlurEffectToGl,
  defaultGlMotionBlurEffectRunner,
  registerGlMotionBlurEffect,
} from './glMotionBlurEffect';

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
  applyMotionBlurEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, null, {
    kind: 'MotionBlurEffect',
  } as MotionBlurEffect);
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

describe('applyMotionBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToGl).toBe('function');
  });

  it('negates velocityPixels.y for GL UV bottom-left origin', () => {
    expect(SOURCE).toContain('vec2(velocityPixels.x, -velocityPixels.y)');
  });
});

describe('defaultGlMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlMotionBlurEffectRunner).toBe('function');
  });
});

describe('registerGlMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlMotionBlurEffect).toBeTypeOf('function');
  });
});
