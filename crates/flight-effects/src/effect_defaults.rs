use std::collections::HashMap;
use std::sync::Arc;

use crate::contract::{Effect, EffectRef, EffectValue};

pub type EffectDefaults = HashMap<String, EffectValue>;

fn apply_defaults(source: &dyn Effect, mut target: Option<&mut dyn Effect>, kind: &str) {
    let mut defaults = EffectDefaults::new();
    get_effect_defaults(&mut defaults, kind);
    if let Some(target) = target.as_deref_mut() {
        for (key, value) in defaults {
            if source.get_effect_field(&key).is_none() {
                target.set_effect_field(&key, value);
            }
        }
    }
}

fn apply_defaults_in_place(target: &mut dyn Effect, kind: &str) {
    let mut defaults = EffectDefaults::new();
    get_effect_defaults(&mut defaults, kind);
    for (key, value) in defaults {
        if target.get_effect_field(&key).is_none() {
            target.set_effect_field(&key, value);
        }
    }
}

fn color(value: u32) -> EffectValue {
    return EffectValue::Color(value);
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_effect_defaults(out: &mut EffectDefaults, kind: &str) {
    out.clear();
    macro_rules! defaults {
        ($($key:literal => $value:expr),* $(,)?) => {{
            $(out.insert($key.to_string(), $value);)*
        }};
    }
    match kind {
        "AutoExposureEffect" => {
            defaults!("adaptationSpeed" => number(1.0), "exposureCompensation" => number(0.0), "maxExposure" => number(2.0), "minExposure" => number(-2.0))
        }
        "BarrelDistortionEffect" => defaults!("amount" => number(0.5), "scale" => number(0.9)),
        "BevelEffect" => {
            defaults!("angle" => number(45.0), "bevelType" => text("inner"), "blurX" => number(4.0), "blurY" => number(4.0), "distance" => number(4.0), "highlightAlpha" => number(1.0), "highlightColor" => color(0xffffffff), "quality" => number(1.0), "shadowAlpha" => number(1.0), "shadowColor" => color(0x000000ff), "sourceMode" => text("draw"), "strength" => number(1.0))
        }
        "BitmapDisplacementEffect" => {
            defaults!("componentX" => number(0.0), "componentY" => number(1.0), "edgeMode" => text("wrap"), "scaleX" => number(0.0), "scaleY" => number(0.0))
        }
        "BlendEffect" => defaults!("opacity" => number(1.0)),
        "BloomEffect" => {
            defaults!("brightness" => number(1.0), "mipCount" => number(0.0), "passes" => number(1.0), "radius" => number(8.0), "threshold" => number(0.8), "thresholdKnee" => number(0.5))
        }
        "BlurEffect" => defaults!("blurX" => number(4.0), "blurY" => number(4.0)),
        "BokehDepthOfFieldEffect" => {
            defaults!("apertureBlades" => number(6.0), "maxBlurRadius" => number(16.0), "samples" => number(16.0))
        }
        "CameraMotionBlurEffect" => defaults!("samples" => number(8.0)),
        "ChromaticAberrationEffect" => {
            defaults!("fringeStrength" => number(0.01), "radial" => EffectValue::Boolean(true), "samples" => number(3.0))
        }
        "ContactShadowsEffect" => {
            defaults!("distance" => number(0.5), "opacity" => number(0.6), "samples" => number(16.0), "smoothness" => number(0.5))
        }
        "ConvolutionEffect" => {
            defaults!("bias" => number(0.0), "clamp" => EffectValue::Boolean(true), "preserveAlpha" => EffectValue::Boolean(true))
        }
        "CrtEffect" => {
            defaults!("curvature" => number(0.1), "scanlineIntensity" => number(0.5), "vignette" => number(0.4), "aberration" => number(0.0))
        }
        "DirectionalBlurEffect" => defaults!("angle" => number(0.0), "samples" => number(8.0)),
        "DisplacementEffect" => defaults!("frequency" => number(12.0), "intensity" => number(8.0)),
        "DitherEffect" => defaults!("levels" => number(16.0)),
        "DropShadowEffect" => {
            defaults!("alpha" => number(1.0), "angle" => number(45.0), "blurX" => number(4.0), "blurY" => number(4.0), "distance" => number(4.0), "quality" => number(1.0), "sourceMode" => text("draw"), "strength" => number(1.0))
        }
        "FilmEmulationEffect" => {
            defaults!("gateWeave" => number(0.0), "grainIntensity" => number(0.1), "halationRadius" => number(4.0), "halationStrength" => number(0.3))
        }
        "FilmGrainEffect" => {
            defaults!("intensity" => number(0.2), "size" => number(1.0), "seed" => number(0.0))
        }
        "FxaaEffect" => defaults!("edgeThreshold" => number(0.0312), "subpixel" => number(0.75)),
        "GlitchEffect" => {
            defaults!("blockSize" => number(24.0), "colorShift" => number(8.0), "intensity" => number(0.5), "seed" => number(0.0))
        }
        "GodRaysEffect" => {
            defaults!("centerX" => number(0.5), "centerY" => number(0.5), "decay" => number(0.96), "density" => number(0.96), "exposure" => number(0.1), "samples" => number(100.0), "weight" => number(0.4))
        }
        "GradientBevelEffect" => {
            defaults!("angle" => number(45.0), "bevelType" => text("inner"), "blurX" => number(4.0), "blurY" => number(4.0), "distance" => number(4.0), "quality" => number(1.0), "sourceMode" => text("draw"), "strength" => number(1.0))
        }
        "GradientGlowEffect" => {
            defaults!("blurX" => number(6.0), "blurY" => number(6.0), "quality" => number(1.0), "sourceMode" => text("draw"), "strength" => number(1.0))
        }
        "HalftoneEffect" => defaults!("angle" => number(45.0), "scale" => number(8.0)),
        "InnerGlowEffect" => {
            defaults!("alpha" => number(1.0), "blurX" => number(6.0), "blurY" => number(6.0), "color" => color(0xff0000ff), "quality" => number(1.0), "sourceMode" => text("draw"), "strength" => number(1.0))
        }
        "InnerShadowEffect" => {
            defaults!("alpha" => number(1.0), "angle" => number(45.0), "blurX" => number(4.0), "blurY" => number(4.0), "distance" => number(4.0), "quality" => number(1.0), "sourceMode" => text("draw"), "strength" => number(1.0))
        }
        "KuwaharaEffect" => defaults!("radius" => number(3.0)),
        "LensDirtEffect" => defaults!("intensity" => number(1.0), "threshold" => number(0.55)),
        "LensDistortionEffect" => defaults!("amount" => number(0.5), "scale" => number(0.9)),
        "LensFlareEffect" => {
            defaults!("ghosts" => number(4.0), "halo" => number(0.5), "intensity" => number(1.0), "threshold" => number(0.9))
        }
        "MedianEffect" => defaults!("radius" => number(1.0)),
        "MotionBlurEffect" => {
            defaults!("intensity" => number(1.0), "samples" => number(8.0), "shutterAngle" => number(180.0), "target" => text("both"))
        }
        "OuterGlowEffect" => {
            defaults!("alpha" => number(1.0), "blurX" => number(6.0), "blurY" => number(6.0), "color" => color(0xff0000ff), "quality" => number(1.0), "sourceMode" => text("draw"), "strength" => number(1.0))
        }
        "OutlineEffect" => {
            defaults!("color" => color(0x000000ff), "thickness" => number(1.0), "threshold" => number(0.1))
        }
        "PanniniProjectionEffect" => defaults!("compression" => number(0.5), "crop" => number(0.0)),
        "PixelateEffect" => defaults!("size" => number(8.0)),
        "PosterizeEffect" => defaults!("levels" => number(8.0)),
        "RadialBlurEffect" => {
            defaults!("centerX" => number(0.5), "centerY" => number(0.5), "samples" => number(8.0), "strength" => number(0.1))
        }
        "ScanlinesEffect" => defaults!("count" => number(480.0), "intensity" => number(0.25)),
        "ScreenSpaceFogEffect" => {
            defaults!("density" => number(0.5), "far" => number(1000.0), "near" => number(10.0))
        }
        "SharpenEffect" => defaults!("amount" => number(0.5)),
        "SketchEffect" => defaults!("strength" => number(1.0)),
        "SmaaEffect" => defaults!("threshold" => number(0.1)),
        "SsaoEffect" => {
            defaults!("bias" => number(0.025), "intensity" => number(1.0), "radius" => number(0.5), "samples" => number(16.0))
        }
        "SsrEffect" => {
            defaults!("maxDistance" => number(100.0), "maxSteps" => number(64.0), "resolution" => number(0.5), "steps" => number(64.0), "thickness" => number(0.1))
        }
        "TaaEffect" => defaults!("feedback" => number(0.9)),
        "TiltShiftEffect" => {
            defaults!("blur" => number(1.0), "center" => number(0.5), "width" => number(0.2))
        }
        "ToneMapEffect" => defaults!("exposure" => number(0.0), "operator" => text("aces")),
        "VignetteEffect" => {
            defaults!("color" => color(0x000000ff), "intensity" => number(0.5), "radius" => number(1.0), "softness" => number(0.5))
        }
        "VolumetricLightEffect" => {
            defaults!("density" => number(0.5), "lightColor" => color(0xffffffff), "lightX" => number(0.5), "lightY" => number(0.2), "samples" => number(32.0), "scattering" => number(0.7))
        }
        "WhiteBalanceEffect" => defaults!("temperature" => number(0.0), "tint" => number(0.0)),
        _ => {}
    }
}

fn has_defaults(kind: &str) -> bool {
    let mut defaults = EffectDefaults::new();
    get_effect_defaults(&mut defaults, kind);
    return !defaults.is_empty();
}

// flight-lint: allow(hashmap-iteration) Each distinct structural field is copied once into a plain
// field bag with no callback or order-observable side effect.
pub fn normalize_effect(effect: &EffectRef, out: &EffectRef) -> bool {
    let kind = effect.read().unwrap().effect_fields().kind.clone();
    if !has_defaults(&kind) {
        return false;
    }
    if Arc::ptr_eq(effect, out) {
        let mut target = out.write().unwrap();
        apply_defaults_in_place(&mut *target, &kind);
        return true;
    }
    let source = effect.read().unwrap();
    let mut target = out.write().unwrap();
    apply_defaults(&*source, Some(&mut *target), &kind);
    for key in source.effect_field_names() {
        if let Some(value) = source.get_effect_field(key) {
            target.set_effect_field(key, value);
        }
    }
    for (key, value) in &source.effect_fields().extra_fields {
        target.set_effect_field(key, value.clone());
    }
    return true;
}

fn number(value: f32) -> EffectValue {
    return EffectValue::Number(value);
}

fn text(value: &str) -> EffectValue {
    return EffectValue::Text(value.to_string());
}
