//! Per-state registry mapping an effect type string to its WGPU runner.
//!
//! Registration is opt-in — import a runner only to register it — and dispatch
//! is a `HashMap` lookup, so there is no monolithic match and unused effect
//! recipes tree-shake away.  Register an alternative runner under the same key
//! to swap algorithms.  The WGPU mirror of `flighthq-effects-gl`'s
//! `render_effect_registry`; the same agnostic `&[RenderEffect]` drives both
//! backends through their registries.
//!
//! Mirrors the TS `renderEffectRegistry` from `effects-webgpu`.

use std::cell::RefCell;
use std::collections::HashMap;

use flighthq_effects::RenderEffect;
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};
use flighthq_render_wgpu::render_target_pool::WgpuRenderTargetPool;

/// The per-backend realization registered against an effect type.
///
/// A single function over WGPU render targets — not a multi-method per-node
/// renderer.  The built-ins are re-exported as `DEFAULT_WGPU_*_EFFECT_RUNNER`
/// constants; register an alternative under the same key to swap algorithms.
///
/// The context is passed by mutable reference because every runner draws,
/// which mutates the render state (uploads uniforms, encodes a pass).
pub type WgpuRenderEffectRunner = fn(ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect);

/// What a WGPU effect runner is handed: the state, the input target it reads,
/// the output target it writes, the pool it borrows intermediate targets from,
/// and the optional scene G-buffer attachments.  `source` and `dest` are
/// distinct targets the pipeline ping-pongs between stages.
///
/// `source`/`dest`/`pool` are raw pointers into targets the pipeline owns for
/// the duration of the call: a runner needs `&mut state` to draw while also
/// reading `source` and `dest`, which alias fields the pipeline holds
/// separately, so the borrow split is expressed with pointers the runner
/// dereferences. The pipeline guarantees they outlive the call and do not
/// alias `state`.
pub struct WgpuRenderEffectContext<'a> {
    pub state: &'a mut WgpuRenderState,
    pub source: *const WgpuRenderTarget,
    pub dest: *const WgpuRenderTarget,
    pub pool: *mut WgpuRenderTargetPool,
    /// Sampleable depth texture from the scene target, or `None` when the
    /// scene did not produce a depth attachment.  Depth-dependent recipes read
    /// it when present and fall back to a color-only path when `None`.
    pub scene_depth_texture: Option<wgpu::TextureView>,
    /// Per-pixel velocity texture from a preceding velocity pass, or `None`.
    pub scene_velocity_texture: Option<wgpu::TextureView>,
}

impl WgpuRenderEffectContext<'_> {
    /// Borrows the read-only source target.
    ///
    /// # Safety
    /// The pipeline guarantees `source` points at a live target distinct from
    /// any field reachable through `state` for the duration of the runner call.
    pub fn source(&self) -> &WgpuRenderTarget {
        // SAFETY: see the field-level doc; the pipeline upholds the contract.
        unsafe { &*self.source }
    }

    /// Borrows the write target.
    ///
    /// # Safety
    /// As [`source`](Self::source): the pipeline guarantees liveness and
    /// non-aliasing with `state`.
    pub fn dest(&self) -> &WgpuRenderTarget {
        // SAFETY: see the field-level doc; the pipeline upholds the contract.
        unsafe { &*self.dest }
    }

    /// Borrows the intermediate-target pool.
    ///
    /// # Safety
    /// As [`source`](Self::source): the pipeline guarantees liveness and
    /// non-aliasing with `state`.
    pub fn pool(&mut self) -> &mut WgpuRenderTargetPool {
        // SAFETY: see the field-level doc; the pipeline upholds the contract.
        unsafe { &mut *self.pool }
    }
}

/// Drops every effect runner registered for `state`.
///
/// Like the pipeline cache, the registry is keyed by the state's pointer
/// identity, so a torn-down state should clear its entry before its memory is
/// reused by a later state at the same address. Runner entries are plain
/// function pointers (no device resources), so this is housekeeping rather than
/// a safety requirement, but it keeps a reused address from inheriting stale
/// registrations.
pub fn clear_wgpu_render_effect_registry(state: &WgpuRenderState) {
    let state_id = state as *const _ as usize;
    REGISTRIES.with(|registries| {
        registries.borrow_mut().remove(&state_id);
    });
}

/// Returns the WGPU runner registered for `effect_type` on `state`, or `None`.
pub fn get_wgpu_render_effect_runner(
    state: &WgpuRenderState,
    effect_type: &str,
) -> Option<WgpuRenderEffectRunner> {
    let state_id = state as *const _ as usize;
    REGISTRIES.with(|registries| {
        registries
            .borrow()
            .get(&state_id)
            .and_then(|registry| registry.get(effect_type).copied())
    })
}

/// Registers `runner` for `effect_type` on `state`, replacing any previous
/// registration.
pub fn register_wgpu_render_effect(
    state: &mut WgpuRenderState,
    effect_type: &str,
    runner: WgpuRenderEffectRunner,
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

/// Returns the stable registry key for a [`RenderEffect`] variant.
///
/// Mirrors the TS `effect.type` strings (`"fxaa"`, `"godRays"`, …) so the same
/// agnostic effect list keys the GL and WGPU registries identically.
pub fn wgpu_render_effect_type(effect: &RenderEffect) -> &'static str {
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

thread_local! {
    // Per-state registry keyed by state pointer identity (the Rust analog of
    // the TS WeakMap<WebGPURenderState, Map<...>>). Runner fn pointers are
    // Copy; thread-confined here alongside the matching pipeline cache.
    static REGISTRIES: RefCell<HashMap<usize, HashMap<String, WgpuRenderEffectRunner>>> =
        RefCell::new(HashMap::new());
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_effects::types::{BloomEffect, FxaaEffect};

    #[test]
    fn clear_wgpu_render_effect_registry_removes_state_entry() {
        // GPU-guarded: build a real state only when an adapter exists, so a
        // GPU-less box skips rather than fails. Registering then clearing must
        // drop the runner; a later lookup returns None.
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        register_wgpu_render_effect(&mut state, "grayscale", |_, _| {});
        assert!(get_wgpu_render_effect_runner(&state, "grayscale").is_some());
        clear_wgpu_render_effect_registry(&state);
        assert!(get_wgpu_render_effect_runner(&state, "grayscale").is_none());
    }

    #[test]
    fn wgpu_render_effect_type_maps_variants_to_ts_keys() {
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::Fxaa(FxaaEffect::default())),
            "fxaa"
        );
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::Bloom(BloomEffect::default())),
            "bloom"
        );
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::GodRays(Default::default())),
            "godRays"
        );
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::ScreenSpaceFog(Default::default())),
            "screenSpaceFog"
        );
    }
}
