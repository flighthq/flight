// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
// flight-lint: allow-file(contract-vocabulary, file-structure, sugar-delegates) D17 native wgpu binding: the backend's contract types hold host-supplied wgpu resources, and the render-state trait implementations are required plumbing
//! The WebGPU backend contract types (TS `types/src/Wgpu*.ts` owned by render-wgpu). Native GPU
//! objects are the host-supplied `wgpu` resources (D17); the device tier is shared by every render
//! state built on one device, and per-state frame scaffolding lives in the state's runtime.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock, Weak};

use flight_entity::{Entity, EntityRuntimeSlot, Kind, Ref, UnknownValue};
use flight_host::{HostImageSource, HostSpawnCapability, WgpuDevice, WgpuSurfaceContext};
use flight_materials::{BlendMode, ColorScaleBias, Material2D, MaterialData};
use flight_platform::PlatformEndianness;
use flight_registry::KindMap;
use flight_render::{
    RenderRegistries, RenderState, RenderStateBackend, RenderStateFields, RenderStateRuntime,
    RenderTexture,
};
use flight_signals::Signal;
use flight_stream::SharedFuture;
use flight_surface::WgpuPresentationSurface;
use flight_texture::{RenderTargetColorSpace, Sampler, TextureColorSpace, TextureVariant};
use flight_texture_formats::TextureContainerFormat;

use flight_image::CompressedImageResource;

use crate::wgpu_canvas_context::{WgpuCanvasConfiguration, WgpuCanvasFrame};

/// The native payload of a `flight_host::WgpuDevice` handle (D26 Q1: a native device carries its
/// queue). A host provider wraps exactly this value in the handle it supplies, built with
/// `create_wgpu_native_device`. `lost` is the device's stored loss promise (TS `GPUDevice.lost`,
/// D20): registered when the payload is constructed, before any loss can occur, it resolves once
/// and every clone of the payload shares it.
#[derive(Clone)]
pub struct WgpuNativeDevice {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub(crate) lost: SharedFuture<WgpuDeviceLostInfo>,
    // The host's spawn capability (D5, D15/D20): device-loss continuations run on it.
    pub(crate) host_spawn: HostSpawnCapability,
    pub(crate) command_observer:
        Arc<RwLock<Option<crate::wgpu_command_observer::WgpuCommandObserver>>>,
}

/// The construction-time hook that settles a device's stored loss promise (D20, Principal
/// cafc5d6b): resolving it settles `lost` once for every awaiter. Tests inject a loss through this
/// same hook.
#[derive(Clone)]
pub struct WgpuDeviceLossHook {
    pub(crate) inner: Arc<Mutex<WgpuDeviceLossHookState>>,
}

pub(crate) struct WgpuDeviceLossHookState {
    pub(crate) resolved: Option<WgpuDeviceLostInfo>,
    pub(crate) sender: Option<futures::channel::oneshot::Sender<WgpuDeviceLostInfo>>,
}

/// Why a device was lost (TS `GPUDeviceLostReason`): `Destroyed` is Flight's own orderly release.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuDeviceLostReason {
    Destroyed,
    Unknown,
}

/// The device's own loss report, carried through unchanged (TS `GPUDeviceLostInfo`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuDeviceLostInfo {
    pub message: String,
    pub reason: WgpuDeviceLostReason,
}

/// Loss notification for one physical device (TS `WgpuDeviceSignals`). Emits at most once, and
/// only for an unexpected loss.
#[derive(Clone)]
pub struct WgpuDeviceSignals {
    pub on_device_lost: Signal<WgpuDeviceLostInfo>,
}

/// Device-native objects allocated together on first rendering use (TS
/// `WgpuDeviceRuntimeResources`).
#[derive(Clone, Debug)]
pub struct WgpuDeviceRuntimeResources {
    pub linear_sampler: wgpu::Sampler,
    pub nearest_sampler: wgpu::Sampler,
    pub texture_bind_group_layout: wgpu::BindGroupLayout,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
}

/// One cached mip-chain downsample pipeline and its texture+sampler layout.
#[derive(Clone, Debug)]
pub struct WgpuMipmapPipeline {
    pub bind_group_layout: wgpu::BindGroupLayout,
    pub pipeline: wgpu::RenderPipeline,
}

/// One device-tier teardown (TS `(device: GPUDevice) => void`).
pub type WgpuDeviceTeardown = Arc<dyn Fn(&WgpuNativeDevice) + Send + Sync>;

/// The device tier shared by every state on one device (TS `WgpuDeviceRuntime`): the loss fact,
/// immutable pipelines/layouts/samplers, and uploaded-texture realizations. TS WeakMaps keyed by an
/// entity are keyed by its numeric entity id (D12); the raw host-image cache keeps the exact
/// `HostImageSource` identity.
pub struct WgpuDeviceRuntime {
    pub native: WgpuNativeDevice,
    pub references: u32,
    pub teardowns: Vec<WgpuDeviceTeardown>,
    pub lost: Option<WgpuDeviceLostInfo>,
    pub signals: Option<WgpuDeviceSignals>,
    pub resources: Option<WgpuDeviceRuntimeResources>,
    pub pipeline_cache: HashMap<String, wgpu::RenderPipeline>,
    pub sampler_cache: HashMap<u32, wgpu::Sampler>,
    pub mipmap_pipeline_cache: HashMap<wgpu::TextureFormat, WgpuMipmapPipeline>,
    pub texture_cache: Vec<(Weak<HostImageSource>, Ref<WgpuTextureEntry>)>,
    pub texture_source_premultiplied_texture_cache: HashMap<u64, Ref<WgpuTextureEntry>>,
    pub texture_source_premultiplied_srgb_texture_cache: HashMap<u64, Ref<WgpuTextureEntry>>,
    pub texture_source_straight_texture_cache: HashMap<u64, Ref<WgpuTextureEntry>>,
    pub texture_source_straight_srgb_texture_cache: HashMap<u64, Ref<WgpuTextureEntry>>,
    pub video_texture_cache: Option<HashMap<u64, Ref<WgpuTextureEntry>>>,
    pub video_srgb_texture_cache: Option<HashMap<u64, Ref<WgpuTextureEntry>>>,
    pub wgpu_external_texture_cache: Option<HashMap<u64, Ref<WgpuTextureEntry>>>,
    pub wgpu_render_texture_cache: Option<HashMap<u64, WgpuRenderTextureEntry>>,
    pub scene_mesh_upload_cache: Option<HashMap<u64, UnknownValue>>,
    pub standard_material_module: Option<wgpu::ShaderModule>,
    pub color_scale_bias_module: Option<wgpu::ShaderModule>,
    pub packed_tint_module: Option<wgpu::ShaderModule>,
    pub color_matrix_module: Option<wgpu::ShaderModule>,
    pub shape_mesh_color_scale_bias_pipelines: Option<HashMap<String, WgpuShapeMeshPipeline>>,
    pub particle_resources: Option<WgpuParticleResources>,
    pub quad_batch_resources: Option<WgpuQuadBatchResources>,
}

/// Shared handle to one device tier.
pub type WgpuDeviceRuntimeRef = Ref<WgpuDeviceRuntime>;

/// A device a render state can be built on (TS `WgpuDeviceState`). The device tier lives behind the
/// entity, shared by every state derived from it.
#[derive(Clone)]
pub struct WgpuDeviceState {
    pub(crate) runtime: EntityRuntimeSlot,
    pub device: WgpuDevice,
    pub(crate) context: Option<WgpuDeviceRuntimeRef>,
}

/// The per-state blend hook (TS `applyBlendMode`).
pub type WgpuApplyBlendMode = fn(&mut WgpuRenderState, Option<&BlendMode>);

/// The shared cell holding a state's blend hook. Derived offscreen states resolve their parent's
/// cell at the draw seam, so support enabled after derivation is visible to them.
pub type WgpuApplyBlendModeSlot = Arc<RwLock<Option<WgpuApplyBlendMode>>>;

/// A derived state's link to the state it was derived from (TS `applyBlendModeParent`): the
/// parent's hook cell and the parent's own link. Both are shared cells, so a hook installed or a
/// parent re-linked after derivation is visible through the whole chain.
#[derive(Clone)]
pub struct WgpuApplyBlendModeParent {
    pub apply_blend_mode: WgpuApplyBlendModeSlot,
    pub parent: WgpuApplyBlendModeParentSlot,
}

/// The shared cell holding a state's derivation link; `None` for a root state.
pub type WgpuApplyBlendModeParentSlot = Arc<RwLock<Option<WgpuApplyBlendModeParent>>>;

/// One state-tier teardown (TS `(state: WgpuRenderState) => void`).
pub type WgpuRenderStateTeardown = Arc<dyn Fn(&mut WgpuRenderState) + Send + Sync>;

/// The WebGPU render state (TS `WgpuRenderState extends RenderState`). `Send + Sync` (D17): every
/// native object it holds is a thread-safe `wgpu` handle.
pub struct WgpuRenderState {
    pub(crate) render: RenderStateFields,
    pub(crate) render_runtime: RenderStateRuntime<WgpuRenderState>,
    pub(crate) render_registries: RenderRegistries<WgpuRenderState>,
    pub apply_blend_mode: WgpuApplyBlendModeSlot,
    pub device_state: WgpuDeviceState,
    pub device: WgpuDevice,
    pub format: wgpu::TextureFormat,
    pub(crate) runtime: WgpuRenderStateRuntime,
}

/// The outcome of deriving an offscreen state from an existing one (TS
/// `WgpuOffscreenRenderStateResult`): a dead device is an expected outcome, reported rather than
/// thrown.
pub enum WgpuOffscreenRenderStateResult {
    DeviceLost(WgpuOffscreenRenderStateDeviceLost),
    Ok(WgpuOffscreenRenderStateOk),
}

/// The `device-lost` arm: the device's own loss report.
pub struct WgpuOffscreenRenderStateDeviceLost {
    pub(crate) runtime: EntityRuntimeSlot,
    pub info: WgpuDeviceLostInfo,
}

/// The `ok` arm: the derived state.
pub struct WgpuOffscreenRenderStateOk {
    pub(crate) runtime: EntityRuntimeSlot,
    pub state: WgpuRenderState,
}

/// The color-adjustment value forms the quad paths accept (TS `ColorScaleBias | TintMaterialData |
/// readonly number[]`).
#[derive(Clone, Debug)]
pub enum WgpuColorScaleBiasInput {
    ColorScaleBias(ColorScaleBias),
    Values(WgpuColorScaleBiasValues),
}

/// Raw color-adjustment numbers (TS `readonly number[]`).
#[derive(Clone, Debug)]
pub struct WgpuColorScaleBiasValues {
    pub values: Vec<f32>,
}

/// The per-flush realization of a tinted batch (TS `WgpuColorAdjustmentFlush`).
#[derive(Clone, Debug)]
pub struct WgpuColorAdjustmentFlush {
    pub data: WgpuColorAdjustmentFlushData,
    pub floats: u32,
    pub module: wgpu::ShaderModule,
}

/// The per-instance storage data of one tinted flush (TS `Float32Array | Uint32Array`).
#[derive(Clone, Debug)]
pub enum WgpuColorAdjustmentFlushData {
    F32(WgpuColorAdjustmentFlushF32),
    U32(WgpuColorAdjustmentFlushU32),
}

/// Float per-instance storage (TS `Float32Array`).
#[derive(Clone, Debug)]
pub struct WgpuColorAdjustmentFlushF32 {
    pub data: Vec<f32>,
}

/// Integer per-instance storage (TS `Uint32Array`).
#[derive(Clone, Debug)]
pub struct WgpuColorAdjustmentFlushU32 {
    pub data: Vec<u32>,
}

/// Pure registration policy owned by one WebGPU render pipeline (TS `WgpuRenderRegistries`; the
/// backend-neutral tables live in the state's `RenderRegistries`). Tables are persistent snapshots
/// shared through `Arc`. Slots whose value types belong to backend packages that consume them
/// (scene2d-wgpu's color-adjustment feature, scene3d-wgpu's passes and mesh renderers, effects,
/// modifiers, skinning, velocity, the shape rasterizer) hold those packages' values opaquely.
#[derive(Clone)]
pub struct WgpuRenderRegistries {
    pub color_adjustment_feature: Option<UnknownValue>,
    pub color_adjustment_feature_guard: Option<UnknownValue>,
    pub compressed_texture_decoder: Option<WgpuCompressedTextureDecoder>,
    pub compressed_texture_upload: Option<WgpuCompressedTextureUploader>,
    pub custom_material_shaders: Arc<KindMap<WgpuCustomMaterialShaderSource>>,
    pub effects: Arc<KindMap<UnknownValue>>,
    pub gpu_skinning: Option<UnknownValue>,
    pub material_renderers: Arc<KindMap<WgpuMaterialRenderer>>,
    pub modifier_snippets: Arc<KindMap<UnknownValue>>,
    pub passes: Option<Arc<Vec<UnknownValue>>>,
    pub shape_rasterizer: Option<UnknownValue>,
    pub texture_resolvers: Arc<KindMap<WgpuTextureResolver>>,
    pub velocity_writers: Arc<KindMap<UnknownValue>>,
}

/// One material-renderer table entry (TS `WgpuMeshMaterialRenderer | WgpuQuadMaterialRenderer`): a
/// material kind is either 2D or 3D, never both.
#[derive(Clone)]
pub enum WgpuMaterialRenderer {
    Mesh(UnknownValue),
    Quad(WgpuQuadMaterialRenderer),
}

/// Per-backend behavior for a quad-batch material kind (TS `WgpuQuadMaterialRenderer`).
#[derive(Clone)]
pub struct WgpuQuadMaterialRenderer {
    pub instance_float_count: u32,
    pub get_shader_module: fn(&mut WgpuRenderState) -> wgpu::ShaderModule,
    pub pack_instance: Option<
        fn(
            &mut WgpuRenderState,
            Option<&Ref<dyn Material2D>>,
            Option<&Ref<dyn MaterialData>>,
            &mut [f32],
            usize,
        ),
    >,
}

/// Synchronously realizes a texture for one render state (TS `WgpuTextureResolver`); `None` is the
/// not-ready/unsupported sentinel.
pub type WgpuTextureResolver = fn(
    &mut WgpuRenderState,
    &dyn TextureVariant,
    bool,
    TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>>;

/// CPU fallback for a block-compressed family the device lacks (TS
/// `WgpuCompressedTextureDecoder`): tightly packed RGBA8 for one level, or `None`.
pub type WgpuCompressedTextureDecoder =
    Arc<dyn Fn(TextureContainerFormat, u32, u32, &[u8]) -> Option<Vec<u8>> + Send + Sync>;

/// Opt-in bridge from a compressed image to a sampleable entry (TS
/// `WgpuCompressedTextureUploader`).
pub type WgpuCompressedTextureUploader = fn(
    &mut WgpuRenderState,
    &CompressedImageResource,
    Option<&WgpuCompressedTextureDecoder>,
    Option<TextureColorSpace>,
) -> Option<Ref<WgpuTextureEntry>>;

/// A complete WGSL module registered for a custom shader material (TS
/// `WgpuCustomMaterialShaderSource`).
pub type WgpuCustomMaterialShaderSource = String;

/// Block-compression families enabled on a device (TS `WgpuCompressedTextureSupport`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WgpuCompressedTextureSupport {
    pub astc: bool,
    pub bc: bool,
    pub etc2: bool,
}

/// Adapter capabilities that gate format and feature paths (TS `WgpuAdapterCapabilities`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuAdapterCapabilities {
    pub max_sample_count: u32,
    pub max_texture_dimension_2d: u32,
    pub supports_float32_filterable: bool,
    pub supports_timestamp_query: bool,
}

/// Device-tier particle pipeline resources (TS `WgpuParticleResources`).
#[derive(Clone, Debug)]
pub struct WgpuParticleResources {
    pub instance_bind_group_layout: wgpu::BindGroupLayout,
    pub module: wgpu::ShaderModule,
    pub pipeline_layout: wgpu::PipelineLayout,
    pub pipelines: HashMap<wgpu::TextureFormat, wgpu::RenderPipeline>,
}

/// Device-tier quad-batch pipeline resources (TS `WgpuQuadBatchResources`). Pipelines are keyed by
/// the material's shader module, then by blend+stencil state.
#[derive(Clone, Debug)]
pub struct WgpuQuadBatchResources {
    pub instance_bind_group_layout: wgpu::BindGroupLayout,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub base_pipeline_layout: wgpu::PipelineLayout,
    pub material_pipeline_layout: wgpu::PipelineLayout,
    pub pipelines: HashMap<wgpu::ShaderModule, HashMap<String, wgpu::RenderPipeline>>,
}

/// The two shared 2D bind-group layouts (TS `WgpuBindGroupLayouts`).
pub struct WgpuBindGroupLayouts {
    pub(crate) runtime: EntityRuntimeSlot,
    pub texture_bind_group_layout: wgpu::BindGroupLayout,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
}

/// A bound bitmap shader: a pipeline plus a bind hook writing its per-draw uniforms (TS
/// `WgpuBitmapShader`).
#[derive(Clone)]
pub struct WgpuBitmapShader {
    pub pipeline: wgpu::RenderPipeline,
    pub bind: fn(&mut WgpuRenderState, f32),
}

/// One active contour clip's GPU resources (TS `WgpuClipContourEntry`).
#[derive(Clone, Debug)]
pub struct WgpuClipContourEntry {
    pub vertex_buffer: wgpu::Buffer,
    pub vertex_count: u32,
    pub uniform_buffer: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
    pub depth: u32,
}

/// Cached contour-clip stencil pipelines (TS `WgpuClipContourPipelines`).
#[derive(Clone, Debug)]
pub struct WgpuClipContourPipelines {
    pub write: wgpu::RenderPipeline,
    pub erase: wgpu::RenderPipeline,
    pub bind_group_layout: wgpu::BindGroupLayout,
}

/// A pixel-space scissor rectangle (TS `WgpuScissorRect`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuScissorRect {
    pub height: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

/// Per-shape reusable GPU buffer slots for the tessellated solid-fill path (TS
/// `WgpuShapeMeshBuffers`).
#[derive(Clone, Debug, Default)]
pub struct WgpuShapeMeshBuffers {
    pub vertex_buffers: Vec<wgpu::Buffer>,
    pub vertex_capacities: Vec<u64>,
    pub index_buffers: Vec<wgpu::Buffer>,
    pub index_capacities: Vec<u64>,
    pub uniform_buffers: Vec<wgpu::Buffer>,
    pub bind_groups: Vec<wgpu::BindGroup>,
    pub color_scale_bias_uniform_buffers: Vec<wgpu::Buffer>,
    pub color_scale_bias_bind_groups: Vec<wgpu::BindGroup>,
}

/// A cached flat-color tessellated-shape pipeline (TS `WgpuShapeMeshPipeline`).
#[derive(Clone, Debug)]
pub struct WgpuShapeMeshPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub bind_group_layout: wgpu::BindGroupLayout,
}

/// One quad-batch writer pool slot (TS `WgpuQuadBatchWriterBufferSlot`).
#[derive(Clone, Debug, Default)]
pub struct WgpuQuadBatchWriterBufferSlot {
    pub instance_buffer: Option<wgpu::Buffer>,
    pub instance_capacity: u64,
    pub material_buffer: Option<wgpu::Buffer>,
    pub material_capacity: u64,
}

/// One 3D instanced-draw pool slot (TS `WgpuMeshInstanceBufferSlot`).
#[derive(Clone, Debug, Default)]
pub struct WgpuMeshInstanceBufferSlot {
    pub buffer: Option<wgpu::Buffer>,
    pub capacity: u64,
}

/// The group(1) bind groups over one resource's view, one per sampler (TS `WgpuTextureBindings`).
pub type WgpuTextureBindings = HashMap<wgpu::Sampler, wgpu::BindGroup>;

/// An uploaded GPU texture plus the per-sampler bind groups derived from it (TS `WgpuTextureEntry`,
/// with `WgpuTextureResource`'s allocation axes). The source-version (`version`) and video
/// (`width`/`height`/`uploaded_version`) arms of the TS subtypes are carried here, unset where the
/// entry has no such source.
pub struct WgpuTextureEntry {
    pub(crate) runtime: EntityRuntimeSlot,
    pub bindings: WgpuTextureBindings,
    pub mip_level_count: u32,
    pub sampler: Option<wgpu::Sampler>,
    pub straight_alpha: Option<bool>,
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub version: Option<u32>,
    pub video: Option<WgpuVideoTextureState>,
}

/// The dynamic-video arm of a texture entry (TS `WgpuVideoTextureEntry`'s own fields).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuVideoTextureState {
    pub height: u32,
    pub uploaded_version: i64,
    pub width: u32,
}

/// What a render pass binds and clears (TS `WgpuRenderTarget`): a screen target presenting into a
/// swap chain, or a texture target owning sampleable storage.
#[derive(Clone)]
pub enum WgpuRenderTarget {
    Screen(Ref<WgpuScreenRenderTarget>),
    Texture(Ref<WgpuTextureRenderTarget>),
}

/// The swap-chain surface as a render target (TS `WgpuScreenRenderTarget`). It has no sampleable
/// texture: a fresh presentation texture is acquired each frame. Antialiasing and capture are data
/// here, realized through the slots their opt-in modules install.
pub struct WgpuScreenRenderTarget {
    pub(crate) runtime: EntityRuntimeSlot,
    pub antialias: bool,
    pub antialias_resolve_bind_group: Option<wgpu::BindGroup>,
    pub antialias_texture: Option<wgpu::Texture>,
    pub antialias_view: Option<wgpu::TextureView>,
    pub acquire_antialias_view:
        Option<fn(&mut WgpuRenderState, &mut WgpuScreenRenderTarget) -> wgpu::TextureView>,
    pub encode_antialias_resolve:
        Option<fn(&WgpuRenderState, &WgpuScreenRenderTarget, &mut wgpu::CommandEncoder)>,
    pub capture_buffer: Option<wgpu::Buffer>,
    pub capture_bytes_per_row: u32,
    pub capture_enabled: bool,
    pub capture_height: u32,
    pub capture_texture: Option<wgpu::Texture>,
    pub capture_width: u32,
    pub acquire_capture_texture: Option<fn(&mut WgpuScreenRenderTarget) -> wgpu::Texture>,
    pub encode_capture: Option<fn(&mut WgpuScreenRenderTarget, &mut wgpu::CommandEncoder)>,
    pub color_attachments: u32,
    pub color_space: RenderTargetColorSpace,
    pub context: WgpuSurfaceContext,
    pub depth_stencil_texture: wgpu::Texture,
    pub depth_stencil_view: wgpu::TextureView,
    pub device: WgpuNativeDevice,
    pub format: wgpu::TextureFormat,
    pub height: u32,
    pub presentation_view: Option<wgpu::TextureView>,
    pub sample_count: u32,
    pub surface: WgpuPresentationSurface,
    pub width: u32,
    pub(crate) configuration: WgpuCanvasConfiguration,
    pub(crate) frame: Option<WgpuCanvasFrame>,
    pub(crate) reconfigure_pending: bool,
    pub(crate) skipped_frame_texture: Option<wgpu::Texture>,
    pub(crate) capture_map_pending: bool,
}

/// Options for a screen target (TS `WgpuScreenRenderTargetOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuScreenRenderTargetOptions {
    pub alpha_mode: Option<flight_surface::GpuCanvasAlphaMode>,
    pub color_space: Option<RenderTargetColorSpace>,
    pub format: Option<wgpu::TextureFormat>,
}

/// Offscreen, sampleable render storage (TS `WgpuTextureRenderTarget`).
pub struct WgpuTextureRenderTarget {
    pub(crate) runtime: EntityRuntimeSlot,
    pub bindings: WgpuTextureBindings,
    pub color_attachments: u32,
    pub color_space: RenderTargetColorSpace,
    pub depth_stencil_texture: wgpu::Texture,
    pub depth_stencil_view: wgpu::TextureView,
    pub format: wgpu::TextureFormat,
    pub height: u32,
    pub mip_level_count: u32,
    pub sample_count: u32,
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub width: u32,
}

/// A free-list of reusable texture targets (TS `WgpuRenderTargetPool`).
pub struct WgpuRenderTargetPool {
    pub(crate) runtime: EntityRuntimeSlot,
    pub free: Vec<Ref<WgpuTextureRenderTarget>>,
}

/// The logical extent of a pass (TS `WgpuRenderPassViewport`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuRenderPassViewport {
    pub height: f32,
    pub width: f32,
}

/// One clip's unwind form (TS `'rect' | 'contour'`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuClipForm {
    Contour,
    Rect,
}

/// The enclosing pass state one begin/end bracket saves and restores (TS `WgpuSavedPassState`).
#[derive(Clone)]
pub struct WgpuSavedPassState {
    pub clip_forms: Vec<WgpuClipForm>,
    pub color_format: Option<wgpu::TextureFormat>,
    pub current_mask_depth: u32,
    pub current_scissor_rect: Option<WgpuScissorRect>,
    pub mask_write_mode: bool,
    pub render_target: Option<WgpuRenderTarget>,
    pub render_target_viewport: Option<WgpuRenderPassViewport>,
    pub scissor_stack: Vec<WgpuScissorRect>,
}

/// One open pass on a state's pass stack (TS `WgpuRenderPass`'s data). Rust splits the TS pass
/// handle: this record lives in the state's runtime, and the caller holds a `WgpuRenderPass` that
/// borrows the state, so a nested pass reborrows its enclosing pass and brackets close in order.
#[derive(Clone)]
pub struct WgpuRenderPassRecord {
    pub(crate) runtime: EntityRuntimeSlot,
    pub color_view: wgpu::TextureView,
    pub has_encoder: bool,
    pub owns_frame: bool,
    pub saved: WgpuSavedPassState,
    pub target: WgpuRenderTarget,
    pub viewport: WgpuRenderPassViewport,
}

/// The drawing bracket a draw entry point takes (TS `WgpuRenderPass`): the state it draws through
/// and the pass it is bound to.
pub struct WgpuRenderPass<'a> {
    pub state: &'a mut WgpuRenderState,
    pub(crate) index: usize,
}

// flight-lint: allow(f64) clear colors are wgpu::Color doubles
/// Clear values for a pass (TS `RenderTargetClear`): omitted aspects load.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RenderTargetClear {
    pub color: Option<[f64; 4]>,
    pub colors: Option<Vec<[f64; 4]>>,
    pub depth: Option<f32>,
    pub stencil: Option<u32>,
}

/// A render texture's realization status (TS `WgpuRenderTextureStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuRenderTextureStatus {
    Ready,
    Released,
    Unrendered,
    Writing,
}

/// A render texture's diagnostic (TS `WgpuRenderTextureExplanation`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuRenderTextureExplanation {
    pub height: u32,
    pub status: WgpuRenderTextureStatus,
    pub width: u32,
}

/// The runtime-owned realization of one render texture (TS `WgpuRenderTextureEntry`).
#[derive(Clone)]
pub struct WgpuRenderTextureEntry {
    pub status: WgpuRenderTextureStatus,
    pub target: Ref<WgpuTextureRenderTarget>,
    // The sampleable view of `target` the texture resolvers return (TS: the target is itself a
    // WgpuTextureEntry); rebuilt whenever the target's storage changes.
    pub(crate) sampled: Option<Ref<WgpuTextureEntry>>,
}

/// An app-level render-texture lease pool (TS `WgpuRenderTexturePool`), locked to the first device
/// that uses it.
pub struct WgpuRenderTexturePool {
    pub(crate) runtime: EntityRuntimeSlot,
    pub device: Option<WgpuDevice>,
    pub destroyed: bool,
    pub effect_targets: WgpuRenderTargetPool,
    pub free: Vec<Ref<RenderTexture>>,
    pub leased: Vec<Ref<RenderTexture>>,
}

/// Observes a render texture read while unrendered or being written (TS
/// `WgpuRenderTextureGuard`).
pub type WgpuRenderTextureGuard = Arc<
    dyn Fn(&mut WgpuRenderState, &dyn TextureVariant, &WgpuRenderTextureExplanation) + Send + Sync,
>;

/// A fullscreen-pass pipeline (TS `WgpuFullscreenPipeline`).
pub struct WgpuFullscreenPipeline {
    pub(crate) runtime: EntityRuntimeSlot,
    pub pipeline: wgpu::RenderPipeline,
    pub pipeline_layout: wgpu::PipelineLayout,
    // The zeroed group bound at @group(0) when a pass has no uniforms (WebGPU requires every group
    // the layout declares to be set), built once with the pipeline.
    pub(crate) placeholder_uniform_bind_group: wgpu::BindGroup,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
    pub texture_bind_group_layouts: Vec<wgpu::BindGroupLayout>,
}

/// Whether the uniform byte layout is validated on this host (TS `WgpuUniformEndiannessStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuUniformEndiannessStatus {
    Unvalidated,
    Validated,
}

/// The uniform-endianness diagnostic (TS `WgpuUniformEndiannessExplanation`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuUniformEndiannessExplanation {
    pub endianness: PlatformEndianness,
    pub status: WgpuUniformEndiannessStatus,
}

/// Whether a texture's source kind can be resolved (TS `TextureResolutionStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextureResolutionStatus {
    MissingKind,
    MissingResolver,
    Registered,
}

/// A texture-resolution diagnostic (TS `TextureResolutionExplanation`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureResolutionExplanation {
    pub kind: Option<Kind>,
    pub status: TextureResolutionStatus,
}

/// Options for creating a render state (TS `WgpuRenderStateOptions`: the render options plus the
/// WGPU registries). `None` keeps each default.
#[derive(Clone, Default)]
pub struct WgpuRenderStateOptions {
    pub color_adjustment_feature: Option<UnknownValue>,
    pub color_adjustment_feature_guard: Option<UnknownValue>,
    pub compressed_texture_decoder: Option<WgpuCompressedTextureDecoder>,
    pub compressed_texture_upload: Option<WgpuCompressedTextureUploader>,
    pub custom_material_shaders: Option<KindMap<WgpuCustomMaterialShaderSource>>,
    pub effects: Option<KindMap<UnknownValue>>,
    pub format: Option<wgpu::TextureFormat>,
    pub gpu_skinning: Option<UnknownValue>,
    pub image_smoothing_enabled: Option<bool>,
    pub material_renderers: Option<KindMap<WgpuMaterialRenderer>>,
    pub modifier_snippets: Option<KindMap<UnknownValue>>,
    pub passes: Option<Vec<UnknownValue>>,
    pub pixel_ratio: Option<f32>,
    pub round_pixels: Option<bool>,
    pub scene_graph_sync_policy: Option<flight_render::Scene3DGraphSyncPolicy>,
    pub shape_rasterizer: Option<UnknownValue>,
    pub texture_resolvers: Option<KindMap<WgpuTextureResolver>>,
    pub velocity_writers: Option<KindMap<UnknownValue>>,
}

/// The texture-sampling descriptor the quad-batch writer resolves per flush (TS `SamplerLike`).
pub type WgpuSamplerLike = Sampler;

/// Package-private GPU state of one render state (TS `WgpuRenderStateRuntime`). Fields the source
/// declares only for packages that consume this runtime (clips, shapes, particles, quad-batch and
/// mesh instancing) are kept so those backends share one record.
pub struct WgpuRenderStateRuntime {
    pub context: WgpuDeviceRuntimeRef,
    pub registries: WgpuRenderRegistries,
    pub modifier_snippet_revision: u32,
    pub apply_blend_mode_parent: WgpuApplyBlendModeParentSlot,
    pub current_blend_mode: Option<BlendMode>,
    pub teardowns: Vec<WgpuRenderStateTeardown>,
    pub borrowed_surface_extent: Option<WgpuRenderPassViewport>,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_data: Vec<f32>,
    pub uniform_offset: u32,
    pub uniform_stride: u32,
    pub uniform_bind_group: wgpu::BindGroup,
    pub matrix_array: [f32; 9],
    pub mipmap_degraded_guard: Option<WgpuMipmapDegradedGuard>,
    pub mipmap_generator: Option<WgpuMipmapGenerator>,
    pub wgpu_render_texture_guard: Option<WgpuRenderTextureGuard>,
    pub default_bitmap_shader: Option<WgpuBitmapShader>,
    pub webgpu_shader_binding_resolver:
        Option<fn(&WgpuRenderState, u64) -> Option<WgpuBitmapShader>>,
    pub shader_bindings: HashMap<u64, WgpuBitmapShader>,
    pub particle_instance_buffer: Option<wgpu::Buffer>,
    pub particle_instance_data: Option<Vec<f32>>,
    pub particle_instance_capacity: u32,
    pub quad_batch_writer_blend_mode: Option<BlendMode>,
    pub quad_batch_writer_material: Option<Ref<dyn Material2D>>,
    pub quad_batch_writer_material_renderer: Option<WgpuQuadMaterialRenderer>,
    pub quad_batch_writer_material_floats: u32,
    pub quad_batch_writer_count: u32,
    pub quad_batch_writer_instance_data: Vec<f32>,
    pub quad_batch_writer_material_data: Vec<f32>,
    pub quad_batch_writer_texture: Option<Ref<WgpuTextureEntry>>,
    pub quad_batch_writer_sampler: Option<WgpuSamplerLike>,
    pub quad_batch_writer_smoothing: Option<bool>,
    pub quad_batch_writer_color_scale_bias_mode: Option<u32>,
    pub quad_batch_writer_uniform_color_scale_bias: Option<WgpuColorScaleBiasInput>,
    pub quad_batch_writer_color_scale_bias_data: Option<Vec<f32>>,
    pub quad_batch_writer_color_matrix_data: Option<Vec<f32>>,
    pub quad_batch_writer_color_tint_data: Option<Vec<u32>>,
    pub quad_batch_writer_buffer_pool: Vec<WgpuQuadBatchWriterBufferSlot>,
    pub quad_batch_writer_buffer_cursor: u32,
    pub mesh_instance_buffer_pool: Vec<WgpuMeshInstanceBufferSlot>,
    pub mesh_instance_buffer_cursor: u32,
    pub command_encoder: Option<wgpu::CommandEncoder>,
    pub render_pass: Option<wgpu::RenderPass<'static>>,
    pub frame_screen_target: Option<Ref<WgpuScreenRenderTarget>>,
    pub surface_antialias_resolve_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub surface_antialias_resolve_pipeline: Option<wgpu::RenderPipeline>,
    pub clip_forms: Vec<WgpuClipForm>,
    pub current_mask_depth: u32,
    pub mask_write_mode: bool,
    pub clip_contour_pipelines: Option<HashMap<wgpu::TextureFormat, WgpuClipContourPipelines>>,
    pub clip_contour_stack: Vec<WgpuClipContourEntry>,
    pub retired_buffers: Option<Vec<wgpu::Buffer>>,
    pub retired_textures: Option<Vec<wgpu::Texture>>,
    pub shape_mesh_pipelines: Option<HashMap<String, WgpuShapeMeshPipeline>>,
    pub scissor_stack: Vec<WgpuScissorRect>,
    pub current_scissor_rect: Option<WgpuScissorRect>,
    pub render_target_viewport: Option<WgpuRenderPassViewport>,
    pub current_color_format: Option<wgpu::TextureFormat>,
    pub current_render_target: Option<WgpuRenderTarget>,
    pub pass_stack: Vec<WgpuRenderPassRecord>,
    pub destroyed: bool,
}

/// Reports a mipmapped upload degraded to one level (TS `mipmapDegradedGuard`).
pub type WgpuMipmapDegradedGuard = Arc<dyn Fn(&WgpuRenderState) + Send + Sync>;

/// A registered mip-chain generator (TS `mipmapGenerator`).
pub type WgpuMipmapGenerator =
    fn(&mut WgpuRenderState, &wgpu::Texture, u32, u32, wgpu::TextureFormat);

impl WgpuBindGroupLayouts {
    pub(crate) fn with_layouts(
        texture_bind_group_layout: wgpu::BindGroupLayout,
        uniform_bind_group_layout: wgpu::BindGroupLayout,
    ) -> Self {
        return WgpuBindGroupLayouts {
            runtime: EntityRuntimeSlot::default(),
            texture_bind_group_layout,
            uniform_bind_group_layout,
        };
    }
}

impl WgpuOffscreenRenderStateDeviceLost {
    pub(crate) fn with_info(info: WgpuDeviceLostInfo) -> Self {
        return WgpuOffscreenRenderStateDeviceLost {
            runtime: EntityRuntimeSlot::default(),
            info,
        };
    }
}

impl WgpuOffscreenRenderStateOk {
    pub(crate) fn with_state(state: WgpuRenderState) -> Self {
        return WgpuOffscreenRenderStateOk {
            runtime: EntityRuntimeSlot::default(),
            state,
        };
    }
}

impl WgpuDeviceState {
    pub(crate) fn with_context(device: WgpuDevice, context: WgpuDeviceRuntimeRef) -> Self {
        return WgpuDeviceState {
            runtime: EntityRuntimeSlot::default(),
            device,
            context: Some(context),
        };
    }
}

flight_entity::impl_entity!(WgpuDeviceState);
flight_entity::impl_entity!(WgpuOffscreenRenderStateDeviceLost);
flight_entity::impl_entity!(WgpuOffscreenRenderStateOk);
flight_entity::impl_entity!(WgpuBindGroupLayouts);
flight_entity::impl_entity!(WgpuTextureEntry);
flight_entity::impl_entity!(WgpuTextureRenderTarget);
flight_entity::impl_entity!(WgpuScreenRenderTarget);
flight_entity::impl_entity!(WgpuRenderTargetPool);
flight_entity::impl_entity!(WgpuRenderPassRecord);
flight_entity::impl_entity!(WgpuRenderTexturePool);
flight_entity::impl_entity!(WgpuFullscreenPipeline);

impl Entity for WgpuRenderState {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.render.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.render.entity_runtime_mut();
    }
}

impl RenderState for WgpuRenderState {
    fn render_backend(&self) -> RenderStateBackend {
        return RenderStateBackend::Wgpu;
    }

    fn render_registries(&self) -> &RenderRegistries<Self> {
        return &self.render_registries;
    }

    fn render_registries_mut(&mut self) -> &mut RenderRegistries<Self> {
        return &mut self.render_registries;
    }

    fn render_runtime(&self) -> &RenderStateRuntime<Self> {
        return &self.render_runtime;
    }

    fn render_runtime_mut(&mut self) -> &mut RenderStateRuntime<Self> {
        return &mut self.render_runtime;
    }

    fn render_state(&self) -> &RenderStateFields {
        return &self.render;
    }

    fn render_state_mut(&mut self) -> &mut RenderStateFields {
        return &mut self.render;
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the stored loss future has no Debug form
impl std::fmt::Debug for WgpuNativeDevice {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return f
            .debug_struct("WgpuNativeDevice")
            .field("device", &self.device)
            .field("queue", &self.queue)
            .finish_non_exhaustive();
    }
}
