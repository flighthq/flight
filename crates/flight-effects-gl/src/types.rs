// flight-lint: allow-file(contract-vocabulary, enum-payload-named) D17 native GL effect contracts carry borrowed glow targets, native texture names, Result diagnostics and the open Effect/Adjustment family references

use std::sync::Arc;

use flight_adjustments::{Adjustment, ColorLut, ColorLutCache};
use flight_effects::{Effect, EffectRef, EffectStateOptions};
use flight_entity::{Kind, Ref};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool};
use glow::NativeTexture;

/// What a GL effect runner is handed: the state, the input it reads, the output it writes, the pool
/// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
/// distinct targets the pipeline ping-pongs between stages. `scene_depth_texture` /
/// `scene_velocity_texture` are the scene target's depth and per-pixel velocity attachments, or
/// `None` when the scene did not produce them.
pub struct GlEffectContext<'a> {
    pub state: &'a mut GlRenderState,
    pub source: &'a GlTextureRenderTarget,
    pub dest: &'a GlTextureRenderTarget,
    pub pool: &'a mut GlTextureRenderTargetPool,
    pub scene_depth_texture: Option<NativeTexture>,
    pub scene_velocity_texture: Option<NativeTexture>,
}

/// The per-backend realization registered against an effect `kind`: a single function over
/// targets. Built-ins are exported as `gl_<name>_effect_runner`; register an alternative under the
/// same key to swap algorithms.
pub type GlEffectRunner = fn(&mut GlEffectContext<'_>, &dyn Effect) -> Result<(), String>;

/// Whether this effect INSTANCE can resolve into a real pass, given whatever else its runner needs
/// (a registered shader source, a loaded map). Registered beside the runner.
pub type GlEffectResolver = fn(&mut GlRenderState, &dyn Effect) -> bool;

/// What one registered kind holds. The resolver rides with the runner rather than in a parallel
/// map, so there is no state in which a runner exists and its resolver was never installed.
#[derive(Clone, Copy, Debug)]
pub struct GlEffectRegistration {
    pub is_resolvable: Option<GlEffectResolver>,
    pub runner: GlEffectRunner,
}

/// Why an `apply_gl_effects_to_render_texture` call would not write its destination (TS
/// `GlEffectApplicationStatus`; strings via `get_gl_effect_application_status_string`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlEffectApplicationStatus {
    Complete,
    NoEffects,
    PartialRegistration,
    PartialResolution,
    SourceUnavailable,
    StaleDestination,
    UnregisteredEffects,
    UnresolvedEffects,
}

/// Plain-data explanation of one effect application. `unresolved_indexes` are positions in the
/// submitted chain, never kinds: resolution is per effect instance.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlEffectApplicationExplanation {
    pub registered_count: usize,
    pub requested_count: usize,
    pub status: GlEffectApplicationStatus,
    pub unregistered_kinds: Vec<Kind>,
    pub unresolved_indexes: Vec<usize>,
}

/// Called when a custom shader source is re-registered under a shaderKey that already carries a
/// DIFFERENT source: `(state, shader_key, previous_source, next_source)`.
pub type GlCustomShaderSourceGuard = Arc<dyn Fn(&GlRenderState, &str, &str, &str) + Send + Sync>;

/// Observed when a pipeline pass drops an effect because its kind has no registered runner.
pub type GlEffectStateSkipGuard = Arc<dyn Fn(&GlRenderState, &str) + Send + Sync>;

/// Observed when a render-texture application ends in one of the sentinel statuses.
pub type GlEffectApplicationGuard =
    Arc<dyn Fn(&GlRenderState, &GlEffectApplicationExplanation) + Send + Sync>;

/// GPU-upload memo for the fused color LUT: the uploaded `size³` 3D texture and the ColorLut last
/// written into it (both `None` before the first upload). `texture` is a GPU resource; destroy it
/// on pipeline teardown.
#[derive(Clone, Debug, Default)]
pub struct GlColorLutTextureCache {
    pub texture: Option<NativeTexture>,
    pub lut: Option<ColorLut>,
}

/// Retains the GPU resources an effect pass needs across frames: the scene target the pipeline
/// renders into and the intermediate-target pool. The per-frame effect list is data passed to
/// `end_gl_effect_pass`, not retained here.
pub struct GlEffectState {
    pub options: EffectStateOptions,
    pub scene_target: Option<GlTextureRenderTarget>,
    pub pool: GlTextureRenderTargetPool,
    pub lut_cache: ColorLutCache,
    pub lut_texture: GlColorLutTextureCache,
    pub velocity_texture: Option<NativeTexture>,
}

/// One member of a pass's operation list (TS `Effect | Adjustment`): consecutive pointwise
/// adjustments fuse into one color pass; effects run through the registry.
#[derive(Clone)]
pub enum EffectOperation {
    Adjustment(Ref<dyn Adjustment>),
    Effect(EffectRef),
}

/// Options for the separable Gaussian blur primitive (TS inline `{ blurX?, blurY? }`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GlGaussianBlurOptions {
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
}

/// Options for the iterative box blur primitive (TS inline options of `applyGlEffectBoxBlur`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GlEffectBoxBlurOptions {
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub passes: Option<f32>,
    pub edge_color: Option<[f32; 4]>,
}
