import { createCanvasRenderState } from '@flighthq/scene2d-canvas/contract';

import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';
import * as contractEffects from './contract';
import * as publicEffects from './index';

describe('Canvas effect registration', () => {
  it.each([
    ['BloomEffect', 'registerCanvasBloomEffect', 'defaultCanvasBloomEffectRunner'],
    ['BlurEffect', 'registerCanvasBlurEffect', 'defaultCanvasBlurEffectRunner'],
    ['BokehDepthOfFieldEffect', 'registerCanvasBokehDepthOfFieldEffect', 'defaultCanvasBokehDepthOfFieldEffectRunner'],
    ['CameraMotionBlurEffect', 'registerCanvasCameraMotionBlurEffect', 'defaultCanvasCameraMotionBlurEffectRunner'],
    [
      'ChromaticAberrationEffect',
      'registerCanvasChromaticAberrationEffect',
      'defaultCanvasChromaticAberrationEffectRunner',
    ],
    ['ConvolutionEffect', 'registerCanvasConvolutionEffect', 'defaultCanvasConvolutionEffectRunner'],
    ['CrtEffect', 'registerCanvasCrtEffect', 'defaultCanvasCrtEffectRunner'],
    ['DirectionalBlurEffect', 'registerCanvasDirectionalBlurEffect', 'defaultCanvasDirectionalBlurEffectRunner'],
    ['DisplacementEffect', 'registerCanvasDisplacementEffect', 'defaultCanvasDisplacementEffectRunner'],
    ['DitherEffect', 'registerCanvasDitherEffect', 'defaultCanvasDitherEffectRunner'],
    ['DropShadowEffect', 'registerCanvasDropShadowEffect', 'defaultCanvasDropShadowEffectRunner'],
    ['FilmGrainEffect', 'registerCanvasFilmGrainEffect', 'defaultCanvasFilmGrainEffectRunner'],
    ['FxaaEffect', 'registerCanvasFxaaEffect', 'defaultCanvasFxaaEffectRunner'],
    ['GlitchEffect', 'registerCanvasGlitchEffect', 'defaultCanvasGlitchEffectRunner'],
    ['GodRaysEffect', 'registerCanvasGodRaysEffect', 'defaultCanvasGodRaysEffectRunner'],
    ['HalftoneEffect', 'registerCanvasHalftoneEffect', 'defaultCanvasHalftoneEffectRunner'],
    ['KuwaharaEffect', 'registerCanvasKuwaharaEffect', 'defaultCanvasKuwaharaEffectRunner'],
    ['LensDirtEffect', 'registerCanvasLensDirtEffect', 'defaultCanvasLensDirtEffectRunner'],
    ['LensDistortionEffect', 'registerCanvasLensDistortionEffect', 'defaultCanvasLensDistortionEffectRunner'],
    ['LensFlareEffect', 'registerCanvasLensFlareEffect', 'defaultCanvasLensFlareEffectRunner'],
    ['MedianEffect', 'registerCanvasMedianEffect', 'defaultCanvasMedianEffectRunner'],
    ['MotionBlurEffect', 'registerCanvasMotionBlurEffect', 'defaultCanvasMotionBlurEffectRunner'],
    ['OuterGlowEffect', 'registerCanvasOuterGlowEffect', 'defaultCanvasOuterGlowEffectRunner'],
    ['OutlineEffect', 'registerCanvasOutlineEffect', 'defaultCanvasOutlineEffectRunner'],
    ['PixelateEffect', 'registerCanvasPixelateEffect', 'defaultCanvasPixelateEffectRunner'],
    ['PosterizeEffect', 'registerCanvasPosterizeEffect', 'defaultCanvasPosterizeEffectRunner'],
    ['RadialBlurEffect', 'registerCanvasRadialBlurEffect', 'defaultCanvasRadialBlurEffectRunner'],
    ['ScanlinesEffect', 'registerCanvasScanlinesEffect', 'defaultCanvasScanlinesEffectRunner'],
    ['ScreenSpaceFogEffect', 'registerCanvasScreenSpaceFogEffect', 'defaultCanvasScreenSpaceFogEffectRunner'],
    ['SharpenEffect', 'registerCanvasSharpenEffect', 'defaultCanvasSharpenEffectRunner'],
    ['SketchEffect', 'registerCanvasSketchEffect', 'defaultCanvasSketchEffectRunner'],
    ['SmaaEffect', 'registerCanvasSmaaEffect', 'defaultCanvasSmaaEffectRunner'],
    ['SsaoEffect', 'registerCanvasSsaoEffect', 'defaultCanvasSsaoEffectRunner'],
    ['SsrEffect', 'registerCanvasSsrEffect', 'defaultCanvasSsrEffectRunner'],
    ['TaaEffect', 'registerCanvasTaaEffect', 'defaultCanvasTaaEffectRunner'],
    ['TiltShiftEffect', 'registerCanvasTiltShiftEffect', 'defaultCanvasTiltShiftEffectRunner'],
    ['ToneMapEffect', 'registerCanvasToneMapEffect', 'defaultCanvasToneMapEffectRunner'],
    ['VignetteEffect', 'registerCanvasVignetteEffect', 'defaultCanvasVignetteEffectRunner'],
    ['WhiteBalanceEffect', 'registerCanvasWhiteBalanceEffect', 'defaultCanvasWhiteBalanceEffectRunner'],
  ] as const)('registers the public %s runner on only the supplied state', (kind, registerName, runnerName) => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const other = createCanvasRenderState(document.createElement('canvas'));

    publicEffects[registerName](state);

    expect(getCanvasRenderEffectRunner(state, kind)).toBe(contractEffects[runnerName]);
    expect(getCanvasRenderEffectRunner(other, kind)).toBeNull();
  });
});
