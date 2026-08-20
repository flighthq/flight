import type { GlRenderState, GlRenderTarget, DirectionalBlurEffect } from '@flighthq/types/contract';

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
  applyDirectionalBlurEffectToGl,
  defaultGlDirectionalBlurEffectRunner,
  registerGlDirectionalBlurEffect,
} from './glDirectionalBlurEffect';

const SOURCE = readShaderSource();

/** The fragment source this effect would compile, captured from its call into the program cache. */
function readShaderSource(): string {
  const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;
  applyDirectionalBlurEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'DirectionalBlurEffect',
  } as DirectionalBlurEffect);
  return programMock.getGlEffectProgram.mock.calls[0]![2] as string;
}

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
