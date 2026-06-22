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

/// Returns the stable registry key for a [`RenderEffect`] variant.
///
/// Mirrors the TS `effect.type` strings (`"fxaa"`, `"godRays"`, …) so the same
/// agnostic effect list keys the GL and WGPU registries identically.
pub fn gl_render_effect_type(effect: &RenderEffect) -> &'static str {
    match effect {
        RenderEffect::Fxaa(_) => "fxaa",
        RenderEffect::Smaa(_) => "smaa",
        RenderEffect::Taa(_) => "taa",
        RenderEffect::Bloom(_) => "bloom",
        RenderEffect::Exposure(_) => "exposure",
        RenderEffect::ToneMap(_) => "toneMap",
        RenderEffect::BrightnessContrast(_) => "brightnessContrast",
        RenderEffect::ChannelMixer(_) => "channelMixer",
        RenderEffect::ColorGrade(_) => "colorGrade",
        RenderEffect::Grayscale(_) => "grayscale",
        RenderEffect::HueSaturation(_) => "hueSaturation",
        RenderEffect::Invert(_) => "invert",
        RenderEffect::LiftGammaGain(_) => "liftGammaGain",
        RenderEffect::LookupTableGrade(_) => "lookupTableGrade",
        RenderEffect::Posterize(_) => "posterize",
        RenderEffect::Sepia(_) => "sepia",
        RenderEffect::WhiteBalance(_) => "whiteBalance",
        RenderEffect::BokehDepthOfField(_) => "bokehDepthOfField",
        RenderEffect::ChromaticAberration(_) => "chromaticAberration",
        RenderEffect::Displacement(_) => "displacement",
        RenderEffect::LensDirt(_) => "lensDirt",
        RenderEffect::LensDistortion(_) => "lensDistortion",
        RenderEffect::LensFlare(_) => "lensFlare",
        RenderEffect::TiltShift(_) => "tiltShift",
        RenderEffect::Vignette(_) => "vignette",
        RenderEffect::CameraMotionBlur(_) => "cameraMotionBlur",
        RenderEffect::DirectionalBlur(_) => "directionalBlur",
        RenderEffect::MotionBlur(_) => "motionBlur",
        RenderEffect::RadialBlur(_) => "radialBlur",
        RenderEffect::GodRays(_) => "godRays",
        RenderEffect::ScreenSpaceFog(_) => "screenSpaceFog",
        RenderEffect::Ssao(_) => "ssao",
        RenderEffect::Ssr(_) => "ssr",
        RenderEffect::Crt(_) => "crt",
        RenderEffect::Dither(_) => "dither",
        RenderEffect::FilmGrain(_) => "filmGrain",
        RenderEffect::Glitch(_) => "glitch",
        RenderEffect::Halftone(_) => "halftone",
        RenderEffect::Kuwahara(_) => "kuwahara",
        RenderEffect::Outline(_) => "outline",
        RenderEffect::Pixelate(_) => "pixelate",
        RenderEffect::Scanlines(_) => "scanlines",
        RenderEffect::Sharpen(_) => "sharpen",
        RenderEffect::Sketch(_) => "sketch",
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
    fn gl_render_effect_type_maps_variants_to_ts_keys() {
        assert_eq!(
            gl_render_effect_type(&RenderEffect::Fxaa(FxaaEffect::default())),
            "fxaa"
        );
        assert_eq!(
            gl_render_effect_type(&RenderEffect::Bloom(BloomEffect::default())),
            "bloom"
        );
        assert_eq!(
            gl_render_effect_type(&RenderEffect::GodRays(Default::default())),
            "godRays"
        );
        assert_eq!(
            gl_render_effect_type(&RenderEffect::ScreenSpaceFog(Default::default())),
            "screenSpaceFog"
        );
    }
}
