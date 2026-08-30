import {
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlContextFromCanvasElement,
  createGlRenderState,
} from '@flighthq/render-gl/contract';

import * as contractEffects from './contract';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import * as publicEffects from './index';

describe('GL effect registration', () => {
  it.each([
    ['BevelEffect', 'registerGlBevelEffect', 'defaultGlBevelEffectRunner'],
    ['BlendEffect', 'registerGlBlendEffect', 'defaultGlBlendEffectRunner'],
    ['BloomEffect', 'registerGlBloomEffect', 'defaultGlBloomEffectRunner'],
    ['BlurEffect', 'registerGlBlurEffect', 'defaultGlBlurEffectRunner'],
    ['BokehDepthOfFieldEffect', 'registerGlBokehDepthOfFieldEffect', 'defaultGlBokehDepthOfFieldEffectRunner'],
    ['CameraMotionBlurEffect', 'registerGlCameraMotionBlurEffect', 'defaultGlCameraMotionBlurEffectRunner'],
    ['ChromaticAberrationEffect', 'registerGlChromaticAberrationEffect', 'defaultGlChromaticAberrationEffectRunner'],
    ['CompositeEffect', 'registerGlCompositeEffect', 'defaultGlCompositeEffectRunner'],
    ['ContactShadowsEffect', 'registerGlContactShadowsEffect', 'defaultGlContactShadowsEffectRunner'],
    ['ConvolutionEffect', 'registerGlConvolutionEffect', 'defaultGlConvolutionEffectRunner'],
    ['CrtEffect', 'registerGlCrtEffect', 'defaultGlCrtEffectRunner'],
    ['CustomShaderEffect', 'registerGlCustomShaderEffect', 'defaultGlCustomShaderEffectRunner'],
    ['DirectionalBlurEffect', 'registerGlDirectionalBlurEffect', 'defaultGlDirectionalBlurEffectRunner'],
    ['DisplacementEffect', 'registerGlDisplacementEffect', 'defaultGlDisplacementEffectRunner'],
    ['DitherEffect', 'registerGlDitherEffect', 'defaultGlDitherEffectRunner'],
    ['DropShadowEffect', 'registerGlDropShadowEffect', 'defaultGlDropShadowEffectRunner'],
    ['FilmGrainEffect', 'registerGlFilmGrainEffect', 'defaultGlFilmGrainEffectRunner'],
    ['FxaaEffect', 'registerGlFxaaEffect', 'defaultGlFxaaEffectRunner'],
    ['GlitchEffect', 'registerGlGlitchEffect', 'defaultGlGlitchEffectRunner'],
    ['GodRaysEffect', 'registerGlGodRaysEffect', 'defaultGlGodRaysEffectRunner'],
    ['GradientBevelEffect', 'registerGlGradientBevelEffect', 'defaultGlGradientBevelEffectRunner'],
    ['GradientGlowEffect', 'registerGlGradientGlowEffect', 'defaultGlGradientGlowEffectRunner'],
    ['HalftoneEffect', 'registerGlHalftoneEffect', 'defaultGlHalftoneEffectRunner'],
    ['InnerGlowEffect', 'registerGlInnerGlowEffect', 'defaultGlInnerGlowEffectRunner'],
    ['InnerShadowEffect', 'registerGlInnerShadowEffect', 'defaultGlInnerShadowEffectRunner'],
    ['KuwaharaEffect', 'registerGlKuwaharaEffect', 'defaultGlKuwaharaEffectRunner'],
    ['LensDirtEffect', 'registerGlLensDirtEffect', 'defaultGlLensDirtEffectRunner'],
    ['LensDistortionEffect', 'registerGlLensDistortionEffect', 'defaultGlLensDistortionEffectRunner'],
    ['LensFlareEffect', 'registerGlLensFlareEffect', 'defaultGlLensFlareEffectRunner'],
    ['MedianEffect', 'registerGlMedianEffect', 'defaultGlMedianEffectRunner'],
    ['MotionBlurEffect', 'registerGlMotionBlurEffect', 'defaultGlMotionBlurEffectRunner'],
    ['OuterGlowEffect', 'registerGlOuterGlowEffect', 'defaultGlOuterGlowEffectRunner'],
    ['OutlineEffect', 'registerGlOutlineEffect', 'defaultGlOutlineEffectRunner'],
    ['PixelateEffect', 'registerGlPixelateEffect', 'defaultGlPixelateEffectRunner'],
    ['PosterizeEffect', 'registerGlPosterizeEffect', 'defaultGlPosterizeEffectRunner'],
    ['RadialBlurEffect', 'registerGlRadialBlurEffect', 'defaultGlRadialBlurEffectRunner'],
    ['ScanlinesEffect', 'registerGlScanlinesEffect', 'defaultGlScanlinesEffectRunner'],
    ['ScreenSpaceFogEffect', 'registerGlScreenSpaceFogEffect', 'defaultGlScreenSpaceFogEffectRunner'],
    ['SharpenEffect', 'registerGlSharpenEffect', 'defaultGlSharpenEffectRunner'],
    ['SketchEffect', 'registerGlSketchEffect', 'defaultGlSketchEffectRunner'],
    ['SmaaEffect', 'registerGlSmaaEffect', 'defaultGlSmaaEffectRunner'],
    ['SsaoEffect', 'registerGlSsaoEffect', 'defaultGlSsaoEffectRunner'],
    ['TiltShiftEffect', 'registerGlTiltShiftEffect', 'defaultGlTiltShiftEffectRunner'],
    ['ToneMapEffect', 'registerGlToneMapEffect', 'defaultGlToneMapEffectRunner'],
    ['VignetteEffect', 'registerGlVignetteEffect', 'defaultGlVignetteEffectRunner'],
    ['WhiteBalanceEffect', 'registerGlWhiteBalanceEffect', 'defaultGlWhiteBalanceEffectRunner'],
  ] as const)('registers the public %s runner on only the supplied state', (kind, registerName, runnerName) => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );
    const other = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );

    publicEffects[registerName](state);

    expect(getGlRenderEffectRunner(state, kind)).toBe(contractEffects[runnerName]);
    expect(getGlRenderEffectRunner(other, kind)).toBeNull();
  });
});
