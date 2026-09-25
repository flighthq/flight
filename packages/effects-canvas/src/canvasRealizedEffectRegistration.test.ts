import { canvasBloomEffectRunner, registerCanvasBloomEffect } from './canvasBloomEffect.ts';
import { canvasBlurEffectRunner, registerCanvasBlurEffect } from './canvasBlurEffect.ts';
import { canvasDropShadowEffectRunner, registerCanvasDropShadowEffect } from './canvasDropShadowEffect.ts';
import { getCanvasEffectRunner } from './canvasEffectRegistry.ts';
import { createCanvasRenderState } from './canvasEffectTestSupport.ts';
import { canvasFilmGrainEffectRunner, registerCanvasFilmGrainEffect } from './canvasFilmGrainEffect.ts';
import { canvasOuterGlowEffectRunner, registerCanvasOuterGlowEffect } from './canvasOuterGlowEffect.ts';
import { canvasPixelateEffectRunner, registerCanvasPixelateEffect } from './canvasPixelateEffect.ts';
import { canvasScanlinesEffectRunner, registerCanvasScanlinesEffect } from './canvasScanlinesEffect.ts';
import { canvasVignetteEffectRunner, registerCanvasVignetteEffect } from './canvasVignetteEffect.ts';

const CASES = [
  ['BloomEffect', registerCanvasBloomEffect, canvasBloomEffectRunner],
  ['BlurEffect', registerCanvasBlurEffect, canvasBlurEffectRunner],
  ['DropShadowEffect', registerCanvasDropShadowEffect, canvasDropShadowEffectRunner],
  ['FilmGrainEffect', registerCanvasFilmGrainEffect, canvasFilmGrainEffectRunner],
  ['OuterGlowEffect', registerCanvasOuterGlowEffect, canvasOuterGlowEffectRunner],
  ['PixelateEffect', registerCanvasPixelateEffect, canvasPixelateEffectRunner],
  ['ScanlinesEffect', registerCanvasScanlinesEffect, canvasScanlinesEffectRunner],
  ['VignetteEffect', registerCanvasVignetteEffect, canvasVignetteEffectRunner],
] as const;

describe('realized Canvas effect registration', () => {
  it.each(CASES)('maps %s to its leaf runner', (kind, register, runner) => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    register(state);
    expect(getCanvasEffectRunner(state, kind)).toBe(runner);
  });
});
