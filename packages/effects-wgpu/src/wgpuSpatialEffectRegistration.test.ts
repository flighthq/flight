import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import * as contractEffects from './contract';
import * as publicEffects from './index';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

beforeAll(() => {
  installWgpuMock();
});

describe('WGPU effect registration', () => {
  it.each([
    ['BevelEffect', 'registerWgpuBevelEffect', 'defaultWgpuBevelEffectRunner'],
    ['BitmapDisplacementEffect', 'registerWgpuBitmapDisplacementEffect', 'defaultWgpuBitmapDisplacementEffectRunner'],
    ['BlendEffect', 'registerWgpuBlendEffect', 'defaultWgpuBlendEffectRunner'],
    ['BloomEffect', 'registerWgpuBloomEffect', 'defaultWgpuBloomEffectRunner'],
    ['BlurEffect', 'registerWgpuBlurEffect', 'defaultWgpuBlurEffectRunner'],
    ['CameraMotionBlurEffect', 'registerWgpuCameraMotionBlurEffect', 'defaultWgpuCameraMotionBlurEffectRunner'],
    [
      'ChromaticAberrationEffect',
      'registerWgpuChromaticAberrationEffect',
      'defaultWgpuChromaticAberrationEffectRunner',
    ],
    ['CompositeEffect', 'registerWgpuCompositeEffect', 'defaultWgpuCompositeEffectRunner'],
    ['ContactShadowsEffect', 'registerWgpuContactShadowsEffect', 'defaultWgpuContactShadowsEffectRunner'],
    ['ConvolutionEffect', 'registerWgpuConvolutionEffect', 'defaultWgpuConvolutionEffectRunner'],
    ['CrtEffect', 'registerWgpuCrtEffect', 'defaultWgpuCrtEffectRunner'],
    ['DirectionalBlurEffect', 'registerWgpuDirectionalBlurEffect', 'defaultWgpuDirectionalBlurEffectRunner'],
    ['DisplacementEffect', 'registerWgpuDisplacementEffect', 'defaultWgpuDisplacementEffectRunner'],
    ['DitherEffect', 'registerWgpuDitherEffect', 'defaultWgpuDitherEffectRunner'],
    ['DropShadowEffect', 'registerWgpuDropShadowEffect', 'defaultWgpuDropShadowEffectRunner'],
    ['FilmGrainEffect', 'registerWgpuFilmGrainEffect', 'defaultWgpuFilmGrainEffectRunner'],
    ['FxaaEffect', 'registerWgpuFxaaEffect', 'defaultWgpuFxaaEffectRunner'],
    ['GlitchEffect', 'registerWgpuGlitchEffect', 'defaultWgpuGlitchEffectRunner'],
    ['GodRaysEffect', 'registerWgpuGodRaysEffect', 'defaultWgpuGodRaysEffectRunner'],
    ['GradientBevelEffect', 'registerWgpuGradientBevelEffect', 'defaultWgpuGradientBevelEffectRunner'],
    ['GradientGlowEffect', 'registerWgpuGradientGlowEffect', 'defaultWgpuGradientGlowEffectRunner'],
    ['HalftoneEffect', 'registerWgpuHalftoneEffect', 'defaultWgpuHalftoneEffectRunner'],
    ['InnerGlowEffect', 'registerWgpuInnerGlowEffect', 'defaultWgpuInnerGlowEffectRunner'],
    ['InnerShadowEffect', 'registerWgpuInnerShadowEffect', 'defaultWgpuInnerShadowEffectRunner'],
    ['KuwaharaEffect', 'registerWgpuKuwaharaEffect', 'defaultWgpuKuwaharaEffectRunner'],
    ['LensDirtEffect', 'registerWgpuLensDirtEffect', 'defaultWgpuLensDirtEffectRunner'],
    ['LensDistortionEffect', 'registerWgpuLensDistortionEffect', 'defaultWgpuLensDistortionEffectRunner'],
    ['LensFlareEffect', 'registerWgpuLensFlareEffect', 'defaultWgpuLensFlareEffectRunner'],
    ['MedianEffect', 'registerWgpuMedianEffect', 'defaultWgpuMedianEffectRunner'],
    ['MotionBlurEffect', 'registerWgpuMotionBlurEffect', 'defaultWgpuMotionBlurEffectRunner'],
    ['OuterGlowEffect', 'registerWgpuOuterGlowEffect', 'defaultWgpuOuterGlowEffectRunner'],
    ['OutlineEffect', 'registerWgpuOutlineEffect', 'defaultWgpuOutlineEffectRunner'],
    ['PixelateEffect', 'registerWgpuPixelateEffect', 'defaultWgpuPixelateEffectRunner'],
    ['PosterizeEffect', 'registerWgpuPosterizeEffect', 'defaultWgpuPosterizeEffectRunner'],
    ['RadialBlurEffect', 'registerWgpuRadialBlurEffect', 'defaultWgpuRadialBlurEffectRunner'],
    ['ScanlinesEffect', 'registerWgpuScanlinesEffect', 'defaultWgpuScanlinesEffectRunner'],
    ['ScreenSpaceFogEffect', 'registerWgpuScreenSpaceFogEffect', 'defaultWgpuScreenSpaceFogEffectRunner'],
    ['SharpenEffect', 'registerWgpuSharpenEffect', 'defaultWgpuSharpenEffectRunner'],
    ['SketchEffect', 'registerWgpuSketchEffect', 'defaultWgpuSketchEffectRunner'],
    ['SmaaEffect', 'registerWgpuSmaaEffect', 'defaultWgpuSmaaEffectRunner'],
    ['SsaoEffect', 'registerWgpuSsaoEffect', 'defaultWgpuSsaoEffectRunner'],
    ['TiltShiftEffect', 'registerWgpuTiltShiftEffect', 'defaultWgpuTiltShiftEffectRunner'],
    ['ToneMapEffect', 'registerWgpuToneMapEffect', 'defaultWgpuToneMapEffectRunner'],
    ['VignetteEffect', 'registerWgpuVignetteEffect', 'defaultWgpuVignetteEffectRunner'],
    ['WhiteBalanceEffect', 'registerWgpuWhiteBalanceEffect', 'defaultWgpuWhiteBalanceEffectRunner'],
  ] as const)('registers the public %s runner on only the supplied state', async (kind, registerName, runnerName) => {
    const state = await createWgpuRenderStateForTest();
    const other = await createWgpuRenderStateForTest();

    publicEffects[registerName](state);

    expect(getWgpuRenderEffectRunner(state, kind)).toBe(contractEffects[runnerName]);
    expect(getWgpuRenderEffectRunner(other, kind)).toBeNull();
  });
});
