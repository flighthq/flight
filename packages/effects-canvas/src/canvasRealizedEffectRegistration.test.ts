import { defaultCanvasBloomEffectRunner, registerCanvasBloomEffect } from './canvasBloomEffect';
import { defaultCanvasBlurEffectRunner, registerCanvasBlurEffect } from './canvasBlurEffect';
import { defaultCanvasDropShadowEffectRunner, registerCanvasDropShadowEffect } from './canvasDropShadowEffect';
import { createCanvasRenderState } from './canvasEffectTestSupport';
import { defaultCanvasFilmGrainEffectRunner, registerCanvasFilmGrainEffect } from './canvasFilmGrainEffect';
import { defaultCanvasOuterGlowEffectRunner, registerCanvasOuterGlowEffect } from './canvasOuterGlowEffect';
import { defaultCanvasPixelateEffectRunner, registerCanvasPixelateEffect } from './canvasPixelateEffect';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';
import { defaultCanvasScanlinesEffectRunner, registerCanvasScanlinesEffect } from './canvasScanlinesEffect';
import { defaultCanvasVignetteEffectRunner, registerCanvasVignetteEffect } from './canvasVignetteEffect';

const CASES = [
  ['BloomEffect', registerCanvasBloomEffect, defaultCanvasBloomEffectRunner],
  ['BlurEffect', registerCanvasBlurEffect, defaultCanvasBlurEffectRunner],
  ['DropShadowEffect', registerCanvasDropShadowEffect, defaultCanvasDropShadowEffectRunner],
  ['FilmGrainEffect', registerCanvasFilmGrainEffect, defaultCanvasFilmGrainEffectRunner],
  ['OuterGlowEffect', registerCanvasOuterGlowEffect, defaultCanvasOuterGlowEffectRunner],
  ['PixelateEffect', registerCanvasPixelateEffect, defaultCanvasPixelateEffectRunner],
  ['ScanlinesEffect', registerCanvasScanlinesEffect, defaultCanvasScanlinesEffectRunner],
  ['VignetteEffect', registerCanvasVignetteEffect, defaultCanvasVignetteEffectRunner],
] as const;

describe('realized Canvas effect registration', () => {
  it.each(CASES)('maps %s to its leaf runner', (kind, register, runner) => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    register(state);
    expect(getCanvasRenderEffectRunner(state, kind)).toBe(runner);
  });
});
