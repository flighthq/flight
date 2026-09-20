import { getCanvasEffectRunner } from './canvasEffectRegistry';
import { createCanvasRenderState } from './canvasEffectTestSupport';
import * as contractEffects from './contract';
import * as publicEffects from './index';

describe('Canvas effect registration', () => {
  it.each([
    ['BlendEffect', 'registerCanvasBlendEffect', 'defaultCanvasBlendEffectRunner'],
    ['BloomEffect', 'registerCanvasBloomEffect', 'defaultCanvasBloomEffectRunner'],
    ['BlurEffect', 'registerCanvasBlurEffect', 'defaultCanvasBlurEffectRunner'],
    ['DropShadowEffect', 'registerCanvasDropShadowEffect', 'defaultCanvasDropShadowEffectRunner'],
    ['FilmGrainEffect', 'registerCanvasFilmGrainEffect', 'defaultCanvasFilmGrainEffectRunner'],
    ['OuterGlowEffect', 'registerCanvasOuterGlowEffect', 'defaultCanvasOuterGlowEffectRunner'],
    ['PixelateEffect', 'registerCanvasPixelateEffect', 'defaultCanvasPixelateEffectRunner'],
    ['ScanlinesEffect', 'registerCanvasScanlinesEffect', 'defaultCanvasScanlinesEffectRunner'],
    ['VignetteEffect', 'registerCanvasVignetteEffect', 'defaultCanvasVignetteEffectRunner'],
  ] as const)('registers the public %s runner on only the supplied state', (kind, registerName, runnerName) => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const other = createCanvasRenderState(document.createElement('canvas'));

    publicEffects[registerName](state);

    expect(getCanvasEffectRunner(state, kind)).toBe(contractEffects[runnerName]);
    expect(getCanvasEffectRunner(other, kind)).toBeNull();
  });
});
