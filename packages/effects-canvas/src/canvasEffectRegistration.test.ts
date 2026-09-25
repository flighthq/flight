import { getCanvasEffectRunner } from './canvasEffectRegistry.ts';
import { createCanvasRenderState } from './canvasEffectTestSupport.ts';
import * as contractEffects from './contract.ts';
import * as publicEffects from './index.ts';

describe('Canvas effect registration', () => {
  it.each([
    ['BlendEffect', 'registerCanvasBlendEffect', 'canvasBlendEffectRunner'],
    ['BloomEffect', 'registerCanvasBloomEffect', 'canvasBloomEffectRunner'],
    ['BlurEffect', 'registerCanvasBlurEffect', 'canvasBlurEffectRunner'],
    ['DropShadowEffect', 'registerCanvasDropShadowEffect', 'canvasDropShadowEffectRunner'],
    ['FilmGrainEffect', 'registerCanvasFilmGrainEffect', 'canvasFilmGrainEffectRunner'],
    ['OuterGlowEffect', 'registerCanvasOuterGlowEffect', 'canvasOuterGlowEffectRunner'],
    ['PixelateEffect', 'registerCanvasPixelateEffect', 'canvasPixelateEffectRunner'],
    ['ScanlinesEffect', 'registerCanvasScanlinesEffect', 'canvasScanlinesEffectRunner'],
    ['VignetteEffect', 'registerCanvasVignetteEffect', 'canvasVignetteEffectRunner'],
  ] as const)('registers the public %s runner on only the supplied state', (kind, registerName, runnerName) => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const other = createCanvasRenderState(document.createElement('canvas'));

    publicEffects[registerName](state);

    expect(getCanvasEffectRunner(state, kind)).toBe(contractEffects[runnerName]);
    expect(getCanvasEffectRunner(other, kind)).toBeNull();
  });
});
