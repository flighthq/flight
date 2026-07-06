//! Per-state registry mapping an effect type string to its GL runner.
//!
//! Registration is opt-in — import a runner only to register it — and dispatch
//! is a `HashMap` lookup, so there is no monolithic match and unused effect
//! recipes tree-shake away.  Register an alternative runner under the same key
//! to swap algorithms.  The GL mirror of `flighthq-effects-wgpu`'s
//! `render_effect_registry`; the same agnostic `&[RenderEffect]` drives both
//! backends through their registries.
//!
//! Mirrors the TS `renderEffectRegistry` from `effects-webgl`.

use std::cell::RefCell;
use std::collections::HashMap;

use flighthq_effects::RenderEffect;
use flighthq_render_gl::render_state::GlRenderState;

/// The per-backend realization registered against an effect type.
///
/// A single function over GL render targets — not a multi-method per-node
/// renderer.  The built-ins are re-exported as `DEFAULT_GL_*_EFFECT_RUNNER`
/// constants; register an alternative under the same key to swap algorithms.
pub type GlRenderEffectRunner = fn(ctx: &GlRenderEffectContext, effect: &RenderEffect);

/// What a GL effect runner is handed: the state, the input target it reads,
/// the output target it writes, the pool it borrows intermediate targets from,
/// and the optional scene G-buffer attachments.  `source` and `dest` are
/// distinct targets the pipeline ping-pongs between stages.
pub struct GlRenderEffectContext<'a> {
    pub state: &'a mut GlRenderState,
    pub source: &'a flighthq_render_gl::render_state::GlRenderTarget,
    pub dest: &'a flighthq_render_gl::render_state::GlRenderTarget,
    pub pool: &'a mut flighthq_render_gl::render_target_pool::GlRenderTargetPool,
    /// Sampleable depth texture from the scene target, or `None` when the
    /// scene did not produce a depth attachment.
    pub scene_depth_texture: Option<glow::Texture>,
    /// Per-pixel velocity texture from a preceding velocity pass, or `None`.
    pub scene_velocity_texture: Option<glow::Texture>,
}

/// Returns the GL runner registered for `effect_type` on `state`, or `None`.
pub fn get_gl_render_effect_runner(
    state: &GlRenderState,
    effect_type: &str,
) -> Option<GlRenderEffectRunner> {
    let state_id = state as *const _ as usize;
    REGISTRIES.with(|registries| {
        registries
            .borrow()
            .get(&state_id)
            .and_then(|registry| registry.get(effect_type).copied())
    })
}

/// Returns `true` if a runner is registered for `effect_type` on `state`.
///
/// Use to validate an effect chain before dispatching — the pipeline silently
/// skips unregistered kinds; check up front to apply your own policy (warn,
/// throw, filter) rather than relying on silent no-ops.
pub fn has_gl_render_effect_runner(state: &GlRenderState, effect_type: &str) -> bool {
    let state_id = state as *const _ as usize;
    REGISTRIES.with(|registries| {
        registries
            .borrow()
            .get(&state_id)
            .is_some_and(|registry| registry.contains_key(effect_type))
    })
}

/// Returns the stable registry key for a [`RenderEffect`] variant.
///
/// Returns the canonical PascalCase effect kind (`effect.kind` in TS, e.g.
/// `"FxaaEffect"`, `"GodRaysEffect"`) — the same string the render-effect
/// registrars register under, so pipeline dispatch matches registration.
pub fn gl_render_effect_type(effect: &RenderEffect) -> &'static str {
    match effect {
        RenderEffect::Fxaa(_) => "FxaaEffect",
        RenderEffect::Smaa(_) => "SmaaEffect",
        RenderEffect::Taa(_) => "TaaEffect",
        RenderEffect::Bloom(_) => "BloomEffect",
        RenderEffect::Exposure(_) => "ExposureEffect",
        RenderEffect::ToneMap(_) => "ToneMapEffect",
        RenderEffect::BrightnessContrast(_) => "BrightnessContrastEffect",
        RenderEffect::ChannelMixer(_) => "ChannelMixerEffect",
        RenderEffect::ColorGrade(_) => "ColorGradeEffect",
        RenderEffect::Grayscale(_) => "GrayscaleEffect",
        RenderEffect::HueSaturation(_) => "HueSaturationEffect",
        RenderEffect::Invert(_) => "InvertEffect",
        RenderEffect::LiftGammaGain(_) => "LiftGammaGainEffect",
        RenderEffect::LookupTableGrade(_) => "LookupTableGradeEffect",
        RenderEffect::Posterize(_) => "PosterizeEffect",
        RenderEffect::Sepia(_) => "SepiaEffect",
        RenderEffect::WhiteBalance(_) => "WhiteBalanceEffect",
        RenderEffect::BokehDepthOfField(_) => "BokehDepthOfFieldEffect",
        RenderEffect::ChromaticAberration(_) => "ChromaticAberrationEffect",
        RenderEffect::Displacement(_) => "DisplacementEffect",
        RenderEffect::LensDirt(_) => "LensDirtEffect",
        RenderEffect::LensDistortion(_) => "LensDistortionEffect",
        RenderEffect::LensFlare(_) => "LensFlareEffect",
        RenderEffect::TiltShift(_) => "TiltShiftEffect",
        RenderEffect::Vignette(_) => "VignetteEffect",
        RenderEffect::CameraMotionBlur(_) => "CameraMotionBlurEffect",
        RenderEffect::DirectionalBlur(_) => "DirectionalBlurEffect",
        RenderEffect::MotionBlur(_) => "MotionBlurEffect",
        RenderEffect::RadialBlur(_) => "RadialBlurEffect",
        RenderEffect::GodRays(_) => "GodRaysEffect",
        RenderEffect::ScreenSpaceFog(_) => "ScreenSpaceFogEffect",
        RenderEffect::Ssao(_) => "SsaoEffect",
        RenderEffect::Ssr(_) => "SsrEffect",
        RenderEffect::Crt(_) => "CrtEffect",
        RenderEffect::Dither(_) => "DitherEffect",
        RenderEffect::FilmGrain(_) => "FilmGrainEffect",
        RenderEffect::Glitch(_) => "GlitchEffect",
        RenderEffect::Halftone(_) => "HalftoneEffect",
        RenderEffect::Kuwahara(_) => "KuwaharaEffect",
        RenderEffect::Outline(_) => "OutlineEffect",
        RenderEffect::Pixelate(_) => "PixelateEffect",
        RenderEffect::Scanlines(_) => "ScanlinesEffect",
        RenderEffect::Sharpen(_) => "SharpenEffect",
        RenderEffect::Sketch(_) => "SketchEffect",
    }
}

/// Registers `runner` for `effect_type` on `state`, replacing any previous
/// registration.
pub fn register_gl_render_effect(
    state: &mut GlRenderState,
    effect_type: &str,
    runner: GlRenderEffectRunner,
) {
    let state_id = state as *const _ as usize;
    REGISTRIES.with(|registries| {
        registries
            .borrow_mut()
            .entry(state_id)
            .or_default()
            .insert(effect_type.to_string(), runner);
    });
}

thread_local! {
    // Per-state registry keyed by state pointer identity (the Rust analog of
    // the TS WeakMap<WebGLRenderState, Map<...>>). Runner fn pointers are Copy;
    // thread-confined here alongside the matching program cache.
    static REGISTRIES: RefCell<HashMap<usize, HashMap<String, GlRenderEffectRunner>>> =
        RefCell::new(HashMap::new());
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_effects::types::{BloomEffect, FxaaEffect};

    // gl_render_effect_type

    #[test]
    fn gl_render_effect_type_returns_pascal_case_kind() {
        assert_eq!(
            gl_render_effect_type(&RenderEffect::Fxaa(FxaaEffect::default())),
            "FxaaEffect"
        );
        assert_eq!(
            gl_render_effect_type(&RenderEffect::Bloom(BloomEffect::default())),
            "BloomEffect"
        );
        assert_eq!(
            gl_render_effect_type(&RenderEffect::GodRays(Default::default())),
            "GodRaysEffect"
        );
        assert_eq!(
            gl_render_effect_type(&RenderEffect::ScreenSpaceFog(Default::default())),
            "ScreenSpaceFogEffect"
        );
    }
}
