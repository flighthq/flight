import { canvasBloomEffectRunner, registerCanvasBloomEffect } from './canvasBloomEffect';
import { canvasBlurEffectRunner, registerCanvasBlurEffect } from './canvasBlurEffect';
import { canvasDropShadowEffectRunner, registerCanvasDropShadowEffect } from './canvasDropShadowEffect';
import { getCanvasEffectRunner } from './canvasEffectRegistry';
import { createCanvasRenderState } from './canvasEffectTestSupport';
import { canvasFilmGrainEffectRunner, registerCanvasFilmGrainEffect } from './canvasFilmGrainEffect';
import { canvasOuterGlowEffectRunner, registerCanvasOuterGlowEffect } from './canvasOuterGlowEffect';
import { canvasPixelateEffectRunner, registerCanvasPixelateEffect } from './canvasPixelateEffect';
import { canvasScanlinesEffectRunner, registerCanvasScanlinesEffect } from './canvasScanlinesEffect';
import { canvasVignetteEffectRunner, registerCanvasVignetteEffect } from './canvasVignetteEffect';

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
