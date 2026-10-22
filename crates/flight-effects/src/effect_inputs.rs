use crate::contract::{EffectInput, EffectRef};

pub static EFFECT_KINDS: &[&str] = &[
    "AutoExposureEffect",
    "BarrelDistortionEffect",
    "BevelEffect",
    "BitmapDisplacementEffect",
    "BlendEffect",
    "BloomEffect",
    "BlurEffect",
    "BokehDepthOfFieldEffect",
    "CameraMotionBlurEffect",
    "ChromaticAberrationEffect",
    "ContactShadowsEffect",
    "ConvolutionEffect",
    "CrtEffect",
    "CustomShaderEffect",
    "DirectionalBlurEffect",
    "DisplacementEffect",
    "DitherEffect",
    "DropShadowEffect",
    "FilmEmulationEffect",
    "FilmGrainEffect",
    "FxaaEffect",
    "GlitchEffect",
    "GodRaysEffect",
    "GradientBevelEffect",
    "GradientGlowEffect",
    "HalftoneEffect",
    "InnerGlowEffect",
    "InnerShadowEffect",
    "KuwaharaEffect",
    "LensDirtEffect",
    "LensDistortionEffect",
    "LensFlareEffect",
    "MedianEffect",
    "MotionBlurEffect",
    "OuterGlowEffect",
    "OutlineEffect",
    "PanniniProjectionEffect",
    "PixelateEffect",
    "PosterizeEffect",
    "RadialBlurEffect",
    "ScanlinesEffect",
    "ScreenSpaceFogEffect",
    "SharpenEffect",
    "SketchEffect",
    "SmaaEffect",
    "SsaoEffect",
    "SsrEffect",
    "TaaEffect",
    "TiltShiftEffect",
    "ToneMapEffect",
    "VignetteEffect",
    "VolumetricLightEffect",
    "WhiteBalanceEffect",
];

pub fn get_effect_inputs(effect: &EffectRef) -> &'static [EffectInput] {
    let kind = effect.read().unwrap().effect_fields().kind.clone();
    return match kind.as_str() {
        "AutoExposureEffect" | "BloomEffect" | "ToneMapEffect" => &[EffectInput::Hdr],
        "BokehDepthOfFieldEffect"
        | "ContactShadowsEffect"
        | "ScreenSpaceFogEffect"
        | "SsaoEffect"
        | "SsrEffect"
        | "TiltShiftEffect"
        | "VolumetricLightEffect" => &[EffectInput::Depth],
        "CameraMotionBlurEffect" | "MotionBlurEffect" => &[EffectInput::Motion],
        "TaaEffect" => &[EffectInput::Temporal],
        _ => &[],
    };
}

pub fn get_effect_kinds() -> &'static [&'static str] {
    return EFFECT_KINDS;
}
