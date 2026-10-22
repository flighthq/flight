// flight-lint: allow-file(contract-vocabulary, enum-payload-named) D17 native wgpu effect contracts carry host-supplied wgpu resources, Rust callback forms of the TS closure types, and the open Effect/Adjustment family references
//! The WebGPU effect contract types (TS `types/src/WgpuEffect*.ts` and
//! `WgpuColorLutTextureCache.ts` owned by effects-wgpu). The runner seam itself
//! (`WgpuEffectContext`, `WgpuEffectRunner`, `WgpuEffectResolver`, `WgpuEffectRegistration`) is owned
//! by render-wgpu, whose registries name it (D8).

use std::collections::HashMap;
use std::sync::Arc;

use flight_adjustments::{Adjustment, ColorLut, ColorLutCache};
use flight_effects::{EffectRef, EffectStateOptions};
use flight_entity::{EntityRuntimeSlot, Kind, Ref};
use flight_render_wgpu::{WgpuRenderState, WgpuRenderTargetPool, WgpuTextureRenderTarget};

/// How an effect pipeline composites into its destination (TS `WgpuEffectBlendMode`; strings via
/// `get_wgpu_effect_blend_mode_string`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum WgpuEffectBlendMode {
    /// Destination-out: `dst *= 1 - src.a`.
    Erase,
    /// Premultiplied source-over (`ONE`, `ONE_MINUS_SRC_ALPHA`).
    #[default]
    Premul,
    /// Writes the effect result without compositing.
    Replace,
}

/// Compiles a variant of a pipeline whose color target is `format` (TS
/// `WgpuEffectPipeline.compileForFormat`).
pub type WgpuEffectPipelineCompiler =
    Arc<dyn Fn(wgpu::TextureFormat) -> wgpu::RenderPipeline + Send + Sync>;

/// A compiled fullscreen effect pipeline (TS `WgpuEffectPipeline`). `pipeline` is the default
/// variant, compiled for the state's format; `compile_for_format` / `variants` let the draw path
/// realize and cache a variant per destination format (an HDR `rgba16float` effect target needs its
/// own, because a render pipeline bakes its color target format). Both are optional, so a pipeline
/// built around an existing `wgpu::RenderPipeline` (`initialize_wgpu_effect_pipeline`) still types.
pub struct WgpuEffectPipeline {
    pub(crate) runtime: EntityRuntimeSlot,
    pub pipeline: wgpu::RenderPipeline,
    pub blend_mode: WgpuEffectBlendMode,
    pub compile_for_format: Option<WgpuEffectPipelineCompiler>,
    pub variants: Option<HashMap<wgpu::TextureFormat, wgpu::RenderPipeline>>,
}

/// A pipeline reading two sources, at @group(1) and @group(2) (TS `WgpuDualSourceEffectPipeline`).
pub type WgpuDualSourceEffectPipeline = WgpuEffectPipeline;

/// The GPU-upload memo for the fused color LUT (TS `WgpuColorLutTextureCache`): the uploaded
/// `size³` 3D texture, the axis size it was created at, and the LUT last written into it (all
/// empty before the first upload). `texture` is a GPU resource destroyed by
/// `destroy_wgpu_effect_state`.
#[derive(Clone, Debug, Default)]
pub struct WgpuColorLutTextureCache {
    pub texture: Option<wgpu::Texture>,
    pub size: u32,
    pub lut: Option<ColorLut>,
}

/// The GPU resources an effect pass retains across frames (TS `WgpuEffectState`): the scene target
/// the pipeline renders into, the intermediate-target pool, the LUT bake and upload memos, and the
/// optional per-frame velocity G-buffer. The per-frame effect list is data passed to
/// `end_wgpu_effect_pass`, not retained here.
pub struct WgpuEffectState {
    pub options: EffectStateOptions,
    pub scene_target: Option<Ref<WgpuTextureRenderTarget>>,
    pub pool: WgpuRenderTargetPool,
    pub lut_cache: ColorLutCache,
    pub lut_texture: WgpuColorLutTextureCache,
    pub velocity_texture: Option<wgpu::Texture>,
}

/// One member of a pass's operation list (TS `Effect | Adjustment`): consecutive pointwise
/// adjustments fuse into one color pass; effects run through the per-state registry.
#[derive(Clone)]
pub enum WgpuEffectOperation {
    Adjustment(Ref<dyn Adjustment>),
    Effect(EffectRef),
}

/// Why an application of a WebGPU effect chain to a render texture did not do what the caller
/// asked (TS `WgpuEffectApplicationStatus`; strings via `get_wgpu_effect_application_status_string`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuEffectApplicationStatus {
    Complete,
    NoEffects,
    PartialRegistration,
    PartialResolution,
    SourceUnavailable,
    StaleDestination,
    UnregisteredEffects,
    UnresolvedEffects,
}

/// Plain-data explanation of one effect application (TS `WgpuEffectApplicationExplanation`).
/// `unresolved_indexes` are positions in the submitted chain: resolution is per effect instance.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuEffectApplicationExplanation {
    pub registered_count: usize,
    pub requested_count: usize,
    pub status: WgpuEffectApplicationStatus,
    pub unregistered_kinds: Vec<Kind>,
    pub unresolved_indexes: Vec<usize>,
}

/// Observed when a pipeline pass drops an effect whose kind has no registered runner (TS
/// `WgpuEffectStateSkipGuard`).
pub type WgpuEffectStateSkipGuard = Arc<dyn Fn(&WgpuRenderState, &str) + Send + Sync>;

/// Observed when the effect pipeline substitutes a supported sample count for the requested one:
/// `(state, requested_sample_count, applied_sample_count)` (TS `WgpuEffectStateSampleCountGuard`).
pub type WgpuEffectStateSampleCountGuard =
    Arc<dyn Fn(&WgpuRenderState, f32, f32) + Send + Sync>;

/// Observed when a render-texture application ends in a sentinel status (TS
/// `WgpuEffectApplicationGuard`).
pub type WgpuEffectApplicationGuard =
    Arc<dyn Fn(&WgpuRenderState, &WgpuEffectApplicationExplanation) + Send + Sync>;

/// The logical extent an effect measures descriptor distances against (TS's inline
/// `WgpuEffectLogicalResolution`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuEffectLogicalResolution {
    pub height: f32,
    pub texels_per_logical_pixel: f32,
    pub width: f32,
}

/// Writes one pass's uniforms into its ring-buffer slot: a float view and an int view of the same
/// 256-byte slot (TS `(f32: Float32Array, i32: Int32Array) => void`). A slot is written through
/// exactly one view per element.
pub type WgpuEffectUniformWriter<'a> = &'a mut dyn FnMut(&mut [f32], &mut [i32]);

/// The shared effect-pass resources a custom-texture recipe binds against (TS
/// `getWgpuEffectPassState`'s record). The TS closures captured the state; these stateless members
/// take it as their first argument (D9d).
#[derive(Clone)]
pub struct WgpuEffectPassStateView {
    pub uniform_bind_group: wgpu::BindGroup,
    pub texture_bind_group_layout: wgpu::BindGroupLayout,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
    pub sampler: wgpu::Sampler,
    pub acquire_slot: fn(&mut WgpuRenderState) -> u32,
    pub write_slot: fn(&mut WgpuRenderState, u32, &mut dyn FnMut(&mut [f32], &mut [i32])),
    pub begin_pass: fn(
        &mut WgpuRenderState,
        Option<&WgpuTextureRenderTarget>,
        wgpu::LoadOp<wgpu::Color>,
    ) -> wgpu::RenderPass<'static>,
}

/// Options for the iterative box blur primitive (TS inline options of `applyWgpuEffectBoxBlur`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuEffectBoxBlurOptions {
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub passes: Option<f32>,
    pub edge_color: Option<[f32; 4]>,
}

/// Options for the separable Gaussian blur primitive (TS inline `{ blurX?, blurY? }`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuGaussianBlurOptions {
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
}

flight_entity::impl_entity!(WgpuEffectPipeline);
