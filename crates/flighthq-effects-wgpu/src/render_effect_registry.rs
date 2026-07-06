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

/// Returns `true` if a runner is registered for `effect_type` on `state`.
///
/// Symmetric with `has_gl_render_effect_runner`. Use to validate an effect
/// chain before dispatching — the pipeline silently skips unregistered kinds;
/// check up front to apply your own policy (warn, filter) rather than relying on
/// silent no-ops.
pub fn has_wgpu_render_effect_runner(state: &WgpuRenderState, effect_type: &str) -> bool {
    let state_id = state as *const _ as usize;
    REGISTRIES.with(|registries| {
        registries
            .borrow()
            .get(&state_id)
            .is_some_and(|registry| registry.contains_key(effect_type))
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
/// Returns the canonical PascalCase effect kind (`effect.kind` in TS, e.g.
/// `"FxaaEffect"`, `"GodRaysEffect"`) — the same string the render-effect
/// registrars register under, so pipeline dispatch matches registration.
pub fn wgpu_render_effect_type(effect: &RenderEffect) -> &'static str {
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
        register_wgpu_render_effect(&mut state, "GrayscaleEffect", |_, _| {});
        assert!(get_wgpu_render_effect_runner(&state, "GrayscaleEffect").is_some());
        clear_wgpu_render_effect_registry(&state);
        assert!(get_wgpu_render_effect_runner(&state, "GrayscaleEffect").is_none());
    }

    #[test]
    fn wgpu_render_effect_type_returns_pascal_case_kind() {
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::Fxaa(FxaaEffect::default())),
            "FxaaEffect"
        );
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::Bloom(BloomEffect::default())),
            "BloomEffect"
        );
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::GodRays(Default::default())),
            "GodRaysEffect"
        );
        assert_eq!(
            wgpu_render_effect_type(&RenderEffect::ScreenSpaceFog(Default::default())),
            "ScreenSpaceFogEffect"
        );
    }
}
