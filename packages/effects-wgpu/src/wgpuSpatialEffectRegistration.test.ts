import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import * as contractEffects from './contract.ts';
import * as publicEffects from './index.ts';
import { getWgpuEffectRunner } from './wgpuEffectRegistry.ts';

beforeAll(() => {
  installWgpuMock();
});

describe('WGPU effect registration', () => {
  it.each([
    ['BevelEffect', 'registerWgpuBevelEffect', 'wgpuBevelEffectRunner'],
    ['BitmapDisplacementEffect', 'registerWgpuBitmapDisplacementEffect', 'wgpuBitmapDisplacementEffectRunner'],
    ['BlendEffect', 'registerWgpuBlendEffect', 'wgpuBlendEffectRunner'],
    ['BloomEffect', 'registerWgpuBloomEffect', 'wgpuBloomEffectRunner'],
    ['BlurEffect', 'registerWgpuBlurEffect', 'wgpuBlurEffectRunner'],
    ['CameraMotionBlurEffect', 'registerWgpuCameraMotionBlurEffect', 'wgpuCameraMotionBlurEffectRunner'],
    ['ChromaticAberrationEffect', 'registerWgpuChromaticAberrationEffect', 'wgpuChromaticAberrationEffectRunner'],
    ['CompositeEffect', 'registerWgpuCompositeEffect', 'wgpuCompositeEffectRunner'],
    ['ContactShadowsEffect', 'registerWgpuContactShadowsEffect', 'wgpuContactShadowsEffectRunner'],
    ['ConvolutionEffect', 'registerWgpuConvolutionEffect', 'wgpuConvolutionEffectRunner'],
    ['CrtEffect', 'registerWgpuCrtEffect', 'wgpuCrtEffectRunner'],
    ['DirectionalBlurEffect', 'registerWgpuDirectionalBlurEffect', 'wgpuDirectionalBlurEffectRunner'],
    ['DisplacementEffect', 'registerWgpuDisplacementEffect', 'wgpuDisplacementEffectRunner'],
    ['DitherEffect', 'registerWgpuDitherEffect', 'wgpuDitherEffectRunner'],
    ['DropShadowEffect', 'registerWgpuDropShadowEffect', 'wgpuDropShadowEffectRunner'],
    ['FilmGrainEffect', 'registerWgpuFilmGrainEffect', 'wgpuFilmGrainEffectRunner'],
    ['FxaaEffect', 'registerWgpuFxaaEffect', 'wgpuFxaaEffectRunner'],
    ['GlitchEffect', 'registerWgpuGlitchEffect', 'wgpuGlitchEffectRunner'],
    ['GodRaysEffect', 'registerWgpuGodRaysEffect', 'wgpuGodRaysEffectRunner'],
    ['GradientBevelEffect', 'registerWgpuGradientBevelEffect', 'wgpuGradientBevelEffectRunner'],
    ['GradientGlowEffect', 'registerWgpuGradientGlowEffect', 'wgpuGradientGlowEffectRunner'],
    ['HalftoneEffect', 'registerWgpuHalftoneEffect', 'wgpuHalftoneEffectRunner'],
    ['InnerGlowEffect', 'registerWgpuInnerGlowEffect', 'wgpuInnerGlowEffectRunner'],
    ['InnerShadowEffect', 'registerWgpuInnerShadowEffect', 'wgpuInnerShadowEffectRunner'],
    ['KuwaharaEffect', 'registerWgpuKuwaharaEffect', 'wgpuKuwaharaEffectRunner'],
    ['LensDirtEffect', 'registerWgpuLensDirtEffect', 'wgpuLensDirtEffectRunner'],
    ['LensDistortionEffect', 'registerWgpuLensDistortionEffect', 'wgpuLensDistortionEffectRunner'],
    ['LensFlareEffect', 'registerWgpuLensFlareEffect', 'wgpuLensFlareEffectRunner'],
    ['MedianEffect', 'registerWgpuMedianEffect', 'wgpuMedianEffectRunner'],
    ['MotionBlurEffect', 'registerWgpuMotionBlurEffect', 'wgpuMotionBlurEffectRunner'],
    ['OuterGlowEffect', 'registerWgpuOuterGlowEffect', 'wgpuOuterGlowEffectRunner'],
    ['OutlineEffect', 'registerWgpuOutlineEffect', 'wgpuOutlineEffectRunner'],
    ['PixelateEffect', 'registerWgpuPixelateEffect', 'wgpuPixelateEffectRunner'],
    ['PosterizeEffect', 'registerWgpuPosterizeEffect', 'wgpuPosterizeEffectRunner'],
    ['RadialBlurEffect', 'registerWgpuRadialBlurEffect', 'wgpuRadialBlurEffectRunner'],
    ['ScanlinesEffect', 'registerWgpuScanlinesEffect', 'wgpuScanlinesEffectRunner'],
    ['ScreenSpaceFogEffect', 'registerWgpuScreenSpaceFogEffect', 'wgpuScreenSpaceFogEffectRunner'],
    ['SharpenEffect', 'registerWgpuSharpenEffect', 'wgpuSharpenEffectRunner'],
    ['SketchEffect', 'registerWgpuSketchEffect', 'wgpuSketchEffectRunner'],
    ['SmaaEffect', 'registerWgpuSmaaEffect', 'wgpuSmaaEffectRunner'],
    ['SsaoEffect', 'registerWgpuSsaoEffect', 'wgpuSsaoEffectRunner'],
    ['TiltShiftEffect', 'registerWgpuTiltShiftEffect', 'wgpuTiltShiftEffectRunner'],
    ['ToneMapEffect', 'registerWgpuToneMapEffect', 'wgpuToneMapEffectRunner'],
    ['VignetteEffect', 'registerWgpuVignetteEffect', 'wgpuVignetteEffectRunner'],
    ['WhiteBalanceEffect', 'registerWgpuWhiteBalanceEffect', 'wgpuWhiteBalanceEffectRunner'],
  ] as const)('registers the public %s runner on only the supplied state', async (kind, registerName, runnerName) => {
    const state = await createWgpuRenderStateForTest();
    const other = await createWgpuRenderStateForTest();

    publicEffects[registerName](state);

    expect(getWgpuEffectRunner(state, kind)).toBe(contractEffects[runnerName]);
    expect(getWgpuEffectRunner(other, kind)).toBeNull();
  });
});
