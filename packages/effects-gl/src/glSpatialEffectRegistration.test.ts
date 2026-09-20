import { createWebGlContext } from '@flighthq/host-web/contract';
import { allocateEmptyGlRenderRegistries, createGlRenderState } from '@flighthq/render-gl/contract';

import * as contractEffects from './contract';
import { getGlEffectRunner } from './glEffectRegistry';
import * as publicEffects from './index';

describe('GL effect registration', () => {
  it.each([
    ['BevelEffect', 'registerGlBevelEffect', 'glBevelEffectRunner'],
    ['BitmapDisplacementEffect', 'registerGlBitmapDisplacementEffect', 'glBitmapDisplacementEffectRunner'],
    ['BlendEffect', 'registerGlBlendEffect', 'glBlendEffectRunner'],
    ['BloomEffect', 'registerGlBloomEffect', 'glBloomEffectRunner'],
    ['BlurEffect', 'registerGlBlurEffect', 'glBlurEffectRunner'],
    ['BokehDepthOfFieldEffect', 'registerGlBokehDepthOfFieldEffect', 'glBokehDepthOfFieldEffectRunner'],
    ['CameraMotionBlurEffect', 'registerGlCameraMotionBlurEffect', 'glCameraMotionBlurEffectRunner'],
    ['ChromaticAberrationEffect', 'registerGlChromaticAberrationEffect', 'glChromaticAberrationEffectRunner'],
    ['CompositeEffect', 'registerGlCompositeEffect', 'glCompositeEffectRunner'],
    ['ContactShadowsEffect', 'registerGlContactShadowsEffect', 'glContactShadowsEffectRunner'],
    ['ConvolutionEffect', 'registerGlConvolutionEffect', 'glConvolutionEffectRunner'],
    ['CrtEffect', 'registerGlCrtEffect', 'glCrtEffectRunner'],
    ['CustomShaderEffect', 'registerGlCustomShaderEffect', 'glCustomShaderEffectRunner'],
    ['DirectionalBlurEffect', 'registerGlDirectionalBlurEffect', 'glDirectionalBlurEffectRunner'],
    ['DisplacementEffect', 'registerGlDisplacementEffect', 'glDisplacementEffectRunner'],
    ['DitherEffect', 'registerGlDitherEffect', 'glDitherEffectRunner'],
    ['DropShadowEffect', 'registerGlDropShadowEffect', 'glDropShadowEffectRunner'],
    ['FilmGrainEffect', 'registerGlFilmGrainEffect', 'glFilmGrainEffectRunner'],
    ['FxaaEffect', 'registerGlFxaaEffect', 'glFxaaEffectRunner'],
    ['GlitchEffect', 'registerGlGlitchEffect', 'glGlitchEffectRunner'],
    ['GodRaysEffect', 'registerGlGodRaysEffect', 'glGodRaysEffectRunner'],
    ['GradientBevelEffect', 'registerGlGradientBevelEffect', 'glGradientBevelEffectRunner'],
    ['GradientGlowEffect', 'registerGlGradientGlowEffect', 'glGradientGlowEffectRunner'],
    ['HalftoneEffect', 'registerGlHalftoneEffect', 'glHalftoneEffectRunner'],
    ['InnerGlowEffect', 'registerGlInnerGlowEffect', 'glInnerGlowEffectRunner'],
    ['InnerShadowEffect', 'registerGlInnerShadowEffect', 'glInnerShadowEffectRunner'],
    ['KuwaharaEffect', 'registerGlKuwaharaEffect', 'glKuwaharaEffectRunner'],
    ['LensDirtEffect', 'registerGlLensDirtEffect', 'glLensDirtEffectRunner'],
    ['LensDistortionEffect', 'registerGlLensDistortionEffect', 'glLensDistortionEffectRunner'],
    ['LensFlareEffect', 'registerGlLensFlareEffect', 'glLensFlareEffectRunner'],
    ['MedianEffect', 'registerGlMedianEffect', 'glMedianEffectRunner'],
    ['MotionBlurEffect', 'registerGlMotionBlurEffect', 'glMotionBlurEffectRunner'],
    ['OuterGlowEffect', 'registerGlOuterGlowEffect', 'glOuterGlowEffectRunner'],
    ['OutlineEffect', 'registerGlOutlineEffect', 'glOutlineEffectRunner'],
    ['PixelateEffect', 'registerGlPixelateEffect', 'glPixelateEffectRunner'],
    ['PosterizeEffect', 'registerGlPosterizeEffect', 'glPosterizeEffectRunner'],
    ['RadialBlurEffect', 'registerGlRadialBlurEffect', 'glRadialBlurEffectRunner'],
    ['ScanlinesEffect', 'registerGlScanlinesEffect', 'glScanlinesEffectRunner'],
    ['ScreenSpaceFogEffect', 'registerGlScreenSpaceFogEffect', 'glScreenSpaceFogEffectRunner'],
    ['SharpenEffect', 'registerGlSharpenEffect', 'glSharpenEffectRunner'],
    ['SketchEffect', 'registerGlSketchEffect', 'glSketchEffectRunner'],
    ['SmaaEffect', 'registerGlSmaaEffect', 'glSmaaEffectRunner'],
    ['SsaoEffect', 'registerGlSsaoEffect', 'glSsaoEffectRunner'],
    ['TiltShiftEffect', 'registerGlTiltShiftEffect', 'glTiltShiftEffectRunner'],
    ['ToneMapEffect', 'registerGlToneMapEffect', 'glToneMapEffectRunner'],
    ['VignetteEffect', 'registerGlVignetteEffect', 'glVignetteEffectRunner'],
    ['WhiteBalanceEffect', 'registerGlWhiteBalanceEffect', 'glWhiteBalanceEffectRunner'],
  ] as const)('registers the public %s runner on only the supplied state', (kind, registerName, runnerName) => {
    const state = createGlRenderState(
      createWebGlContext(document.createElement('canvas')),
      allocateEmptyGlRenderRegistries(),
    );
    const other = createGlRenderState(
      createWebGlContext(document.createElement('canvas')),
      allocateEmptyGlRenderRegistries(),
    );

    publicEffects[registerName](state);

    expect(getGlEffectRunner(state, kind)).toBe(contractEffects[runnerName]);
    expect(getGlEffectRunner(other, kind)).toBeNull();
  });
});
