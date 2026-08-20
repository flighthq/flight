import type { GlRenderState, GlRenderTarget, MotionBlurEffect } from '@flighthq/types/contract';

// ★ THE SHADER IS READ FROM THE ARGUMENT THE EFFECT HANDS THE PROGRAM CACHE, not from the source file on
// disk. Both reach the same text, but the disk route needs `node:fs` in a RENDER package's tests, which
// has no node types and should not gain them — it left effects-gl unable to typecheck at all. Capturing
// the argument also reads the exact string that would be compiled rather than a file that merely
// contains it.
const programMock = vi.hoisted(() => ({
  getGlEffectProgram: vi.fn((_state: unknown, _key: string, _source: string) => ({ program: {} })),
}));

vi.mock('./glEffectProgramCache', () => programMock);
vi.mock('@flighthq/render-gl/contract', () => ({ drawGlFullscreenPass: vi.fn() }));

import {
  applyMotionBlurEffectToGl,
  defaultGlMotionBlurEffectRunner,
  registerGlMotionBlurEffect,
} from './glMotionBlurEffect';

const SOURCE = readShaderSource();

/** The fragment source this effect would compile, captured from its call into the program cache. */
function readShaderSource(): string {
  const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;
  applyMotionBlurEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, null, {
    kind: 'MotionBlurEffect',
  } as MotionBlurEffect);
  return programMock.getGlEffectProgram.mock.calls[0]![2] as string;
}

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
