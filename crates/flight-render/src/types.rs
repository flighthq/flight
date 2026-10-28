// flight-lint: allow-file(contract-vocabulary, enum-payload-named, file-structure, sugar-delegates) D12/D17 generic dispatch types, scalar-array unions, and required trait implementations form one backend-neutral contract module

use std::collections::HashMap;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use flight_entity::{Entity, EntityRuntimeSlot, Kind, Ref, UnknownValue};
use flight_geometry::{Aabb, Frustum, Matrix, Matrix4};
use flight_host::CanvasRenderingContext2D;
use flight_lighting::Scene3DLightBlock;
use flight_log::LogStateRef;
use flight_materials::{BlendMode, ColorScaleBias, Material2D, MaterialData};
use flight_node::contract::NodeRevisionState;
use flight_node::{NodeRef, RendererDataRef};
use flight_path::{Path, PathMesh, StrokeStyle};
use flight_registry::KindMap;
use flight_requirement::RequirementFacet;
use flight_shape::ShapeCommandToken;
use flight_signals::Signal;
use flight_surface::{CanvasSurface, HostCanvasCapability};
use flight_texture::{
    RenderTargetColorSpace, Sampler, Texture2D, TextureColorSpace, TextureSource,
    TextureSourceFields,
};

pub const RENDER_CACHE_KIND: &str = "RenderCache";
pub const EXTERNAL_TEXTURE_SOURCE_KIND: &str = "external";
pub const RENDER_TARGET_TEXTURE_SOURCE_KIND: &str = "renderTarget";

/// Geometry accumulator selected by a node renderer (TS `BatchFormat`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BatchFormat {
    Quad,
    VertexStream,
}

/// Whether prepare recomputes derived transforms or trusts invalidation (TS
/// `Scene3DGraphSyncPolicy`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Scene3DGraphSyncPolicy {
    #[default]
    RefreshDerivedState,
    RequiresInvalidation,
}

/// Shared public fields composed by every backend state. Backend resources never live here.
pub struct RenderStateFields {
    runtime: EntityRuntimeSlot,
    pub allow_smoothing: bool,
    pub current_clip_depth: u32,
    pub pixel_ratio: f32,
    pub render_alpha: f32,
    pub render_blend_mode: Option<BlendMode>,
    pub round_pixels: bool,
    pub scene_graph_sync_policy: Scene3DGraphSyncPolicy,
}

/// Common behavior required by generic backend-neutral render helpers.
pub trait RenderState: Entity + Sized + 'static {
    fn render_state(&self) -> &RenderStateFields;
    fn render_state_mut(&mut self) -> &mut RenderStateFields;
    fn render_runtime(&self) -> &RenderStateRuntime<Self>;
    fn render_runtime_mut(&mut self) -> &mut RenderStateRuntime<Self>;
    fn render_registries(&self) -> &RenderRegistries<Self>;
    fn render_registries_mut(&mut self) -> &mut RenderRegistries<Self>;

    /// Which backend family this state belongs to (TS: the structural `'gl' in state` /
    /// `'device' in state` / `'element' in state` probes). A state with none of those is Canvas.
    fn render_backend(&self) -> RenderStateBackend {
        return RenderStateBackend::Canvas;
    }
}

/// The backend family a render state belongs to, selecting backend-specific diagnostics (TS: the
/// structural checks on the state's `gl`, `device` or `element` member).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum RenderStateBackend {
    #[default]
    Canvas,
    Dom,
    Gl,
    Wgpu,
}

/// Concrete backend-free state returned by `create_render_state`.
pub struct BaseRenderState {
    pub render: RenderStateFields,
    pub runtime: RenderStateRuntime<BaseRenderState>,
    pub registries: RenderRegistries<BaseRenderState>,
}

pub type ColorAdjustmentResolver<S> = fn(&mut S, &mut RenderProxy<S>, Option<&RenderProxy<S>>);

pub type ColorAdjustmentUnsupportedGuard<S> = fn(&mut S, &NodeRef);

pub type RenderRootGuard<S> = fn(&mut S, &NodeRef);

pub type StrokeTessellator = fn(&Path, &StrokeStyle, Option<f32>) -> Option<PathMesh>;

pub type EffectPaddingResolver = fn(&UnknownValue) -> EffectPadding;

/// Backend-specific renderer callbacks, statically typed to the state they can receive.
pub struct NodeRenderer<S: RenderState> {
    pub format: Option<BatchFormat>,
    pub create_data: fn(&mut S, &NodeRef) -> Option<RendererDataRef>,
    pub destroy_data: Option<fn(&mut S, RendererDataRef)>,
    pub is_dirty: Option<fn(&S, &NodeRef, Option<&RendererDataRef>) -> bool>,
    pub submit: fn(&mut S, &RenderProxy2D<S>),
}

/// Backend clip callbacks copied with renderer policy but kept out of common public state fields.
pub struct Scene2DClipHooks<S: RenderState> {
    pub finalize: fn(&mut S),
    pub pop_clip: fn(&mut S, &RenderProxy2D<S>, &NodeRef),
    pub push_clip: fn(&mut S, &RenderProxy2D<S>, &NodeRef),
}

/// Persistent backend-neutral registration policy. Tables are immutable snapshots shared through
/// `Arc`; registration uses `Arc::make_mut` and therefore copies only after derivation.
pub struct RenderRegistries<S: RenderState> {
    pub canvas_shape_commands: Option<Arc<KindMap<UnknownValue>>>,
    pub clip_hooks: Option<&'static Scene2DClipHooks<S>>,
    pub color_adjustments: Option<ColorAdjustmentResolver<S>>,
    pub color_adjustment_unsupported_guard: Option<ColorAdjustmentUnsupportedGuard<S>>,
    pub effect_padding_resolvers: Option<Arc<KindMap<EffectPaddingResolver>>>,
    pub node_renderers: Arc<KindMap<&'static NodeRenderer<S>>>,
    pub render_root_guard: Option<RenderRootGuard<S>>,
    pub skinned_mesh_bounds_guard: Option<fn(&mut S, &flight_scene3d::Mesh)>,
    pub stroke_tessellator: Option<StrokeTessellator>,
}

/// Fragments composed by `merge_render_options` and applied by backend factories.
pub struct RenderStateOptions<S: RenderState> {
    pub canvas_shape_commands: Option<KindMap<UnknownValue>>,
    pub clip_hooks: Option<&'static Scene2DClipHooks<S>>,
    pub color_adjustments: Option<Option<ColorAdjustmentResolver<S>>>,
    pub color_adjustment_unsupported_guard: Option<Option<ColorAdjustmentUnsupportedGuard<S>>>,
    pub effect_padding_resolvers: Option<KindMap<EffectPaddingResolver>>,
    pub node_renderers: Option<KindMap<&'static NodeRenderer<S>>>,
    pub render_root_guard: Option<Option<RenderRootGuard<S>>>,
    pub stroke_tessellator: Option<Option<StrokeTessellator>>,
}

/// Package-private state machinery. It contains no backend handles.
pub struct RenderStateRuntime<S: RenderState> {
    pub current_frame_id: u32,
    pub render_adapt_hook: Option<fn(&mut S, &NodeRef, &mut RenderProxy2D<S>)>,
    pub render_proxy_adapter_map: HashMap<u64, Ref<RenderProxyAdapter<S>>>,
    pub registry_signals: Option<RenderRegistrySignals>,
    pub registry_guard_enabled: bool,
    pub registry_misses: Ref<Vec<RenderRegistriesMiss>>,
    // Each guard family owns its log destination; a None enable silences only that family.
    // Shared with the installed miss listener, which reads the current destination at event time.
    pub registry_guard_log: Ref<Option<LogStateRef>>,
    pub color_adjustment_guard_log: Option<LogStateRef>,
    pub scene_render_guard_log: Option<LogStateRef>,
    pub renderer_map_id: u32,
    pub node_revisions: NodeRevisionState,
    pub prepared_scene3d: Option<PreparedScene3D>,
}

/// One prepared render object. It retains the source and backend-typed renderer identity.
pub struct RenderProxy<S: RenderState> {
    pub(crate) runtime: EntityRuntimeSlot,
    pub source: NodeRef,
    pub kind: Kind,
    pub next: Option<u64>,
    pub alpha: f32,
    pub appearance_frame_id: i64,
    pub blend_mode: Option<BlendMode>,
    pub color_scale_bias: Option<ColorScaleBias>,
    pub color_matrix: Option<[f32; 20]>,
    pub material: Option<Ref<dyn Material2D>>,
    pub material_data: Option<Ref<dyn MaterialData>>,
    pub last_appearance_id: i64,
    pub last_children_id: i64,
    pub last_local_content_id: i64,
    pub last_local_transform_id: i64,
    pub last_parent_reference_id: i64,
    pub name: Option<String>,
    pub renderer: Option<&'static NodeRenderer<S>>,
    pub renderer_data: Option<RendererDataRef>,
    pub renderer_data_source_id: u64,
    pub renderer_map_id: u32,
    pub transform_frame_id: i64,
    pub visible: bool,
}

/// The unified 2D render proxy shared by every 2D node kind.
pub struct RenderProxy2D<S: RenderState> {
    pub proxy: RenderProxy<S>,
    pub transform_2d: Matrix,
    pub traverse_children: bool,
    pub clip_depth: u32,
}

/// Explicit caller-owned replacement for TS's state-internal WeakMap.
pub struct RenderProxies2D<S: RenderState> {
    pub entries: Vec<Option<RenderProxy2D<S>>>,
    pub by_uid: HashMap<u64, usize>,
    pub temp_stack: Vec<NodeRef>,
}

pub type RenderProxyVisit<S> =
    fn(&mut S, &NodeRef, &mut RenderProxy2D<S>, Option<&RenderProxy2D<S>>);

/// Per-source adapter entity. Passing itself to `adapt` preserves the cache adapter's mutable public
/// fields without a closure cycle.
pub struct RenderProxyAdapter<S: RenderState> {
    pub(crate) runtime: EntityRuntimeSlot,
    pub adapt:
        fn(&mut RenderProxyAdapter<S>, &mut S, &NodeRef, &mut RenderProxy2D<S>) -> Option<bool>,
    pub cache: Option<Ref<RenderCache>>,
    pub signals: Option<RenderCacheAdapterSignals>,
    pub is_cache_adapter: bool,
}

#[derive(Clone)]
pub struct RenderCacheAdapterSignals {
    pub on_prepare: Signal<()>,
}

pub struct RenderCache {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub transform: Matrix,
}

pub type RenderSortKey = i32;

/// Options for re-baking a render cache (TS `RenderCacheRefreshOptions`): `padding` is the extra
/// transparent margin, in source pixels, baked around the content on every side (room for effects
/// such as blur to bleed without clipping at the target edge), and `min_width` / `min_height` the
/// minimum target size.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderCacheRefreshOptions {
    pub padding: Option<f32>,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
}

/// Replays a shape's command stream into a 2D context, for a backend that cannot express every fill
/// as GPU geometry (TS `ShapeRasterizer`). The backend owns the canvas, the upload and the caching; a
/// rasterizer owns only the replay, and with it the texture-resolution registry the fills resolve
/// through. `state` is the backend's own render state (`S`), passed through for registry-miss
/// reporting only.
pub type ShapeRasterizer<S> =
    Arc<dyn Fn(&CanvasRenderingContext2D, &[ShapeCommandToken], &mut S) + Send + Sync>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderQueueEntry {
    pub proxy: u64,
    pub sort_key: RenderSortKey,
}

pub struct RenderQueue {
    runtime: EntityRuntimeSlot,
    pub entries: Vec<RenderQueueEntry>,
    pub entry_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum RenderRegistryTable {
    BlendRealization,
    EffectPaddingResolver,
    MaterialRenderer,
    MaterialTextureLister,
    ModifierSnippet,
    NodeRenderer,
    ShapeCommandHandler,
    ShapeRasterizer,
    TextureResolver,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderRegistriesMiss {
    pub kind: Kind,
    pub registry: RenderRegistryTable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderRegistriesMissStatus {
    Complete,
    MissesRecorded,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderRegistriesMissExplanation {
    pub misses: Vec<RenderRegistriesMiss>,
    pub status: RenderRegistriesMissStatus,
}

#[derive(Clone)]
pub struct RenderRegistrySignals {
    pub on_registry_miss: Signal<(RenderRegistryTable, Kind)>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EffectPadding {
    pub bottom: f32,
    pub left: f32,
    pub right: f32,
    pub top: f32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CatalogRegistration {
    pub module: String,
    pub registrar: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CatalogEntry {
    pub kind: Kind,
    pub registrations: Vec<CatalogRegistration>,
    pub registry: RenderRegistryTable,
}

pub type SceneCoverageCatalog = Vec<CatalogEntry>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SceneCoverage {
    FallbackRemediable,
    FallbackUnavailable,
    Satisfied,
    Unavailable,
    Unregistered,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SceneCoverageEntry {
    pub coverage: SceneCoverage,
    pub facet: RequirementFacet,
    pub kind: Kind,
    pub registry: RenderRegistryTable,
    pub module: Option<String>,
    pub registrar: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Scene2DPipelineCoverageExplanation {
    pub registered_kinds: Vec<Kind>,
    pub uncovered_kinds: Vec<Kind>,
    pub unused_registrations: Vec<Kind>,
    pub used_kinds: Vec<Kind>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Scene3DPipelineCoverageExplanation {
    pub registered_kinds: Vec<Kind>,
    pub registered_material_kinds: Vec<Kind>,
    pub uncovered_kinds: Vec<Kind>,
    pub uncovered_material_kinds: Vec<Kind>,
    pub unused_material_registrations: Vec<Kind>,
    pub unused_registrations: Vec<Kind>,
    pub used_kinds: Vec<Kind>,
    pub used_material_kinds: Vec<Kind>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene2DRenderBlankReason {
    NoRenderer,
    NotPrepared,
    NotVisible,
    ZeroAlpha,
    Ok,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene2DRenderExplanation {
    pub kind: Kind,
    pub has_renderer: bool,
    pub prepared: bool,
    pub visible: bool,
    pub effective_alpha: f32,
    pub reason: Scene2DRenderBlankReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderTargetFormat {
    Rgba8,
    Rgba16F,
    Rgba32F,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderTargetFormatPolicy {
    Preferred,
    Required,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderTargetDepth {
    None,
    DepthStencil,
    DepthStencilSampled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderTargetAxes {
    pub width: u32,
    pub height: u32,
    pub format: RenderTargetFormat,
    pub color_attachments: u32,
    pub color_formats: Vec<RenderTargetFormat>,
    pub sample_count: u32,
    pub depth: RenderTargetDepth,
    pub color_space: RenderTargetColorSpace,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderTargetAxis {
    Width,
    Height,
    Format,
    ColorAttachments,
    ColorFormats,
    SampleCount,
    Depth,
    ColorSpace,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RenderTargetAxisValue {
    Count(u32),
    Format(RenderTargetFormat),
    Formats(Vec<RenderTargetFormat>),
    Depth(RenderTargetDepth),
    ColorSpace(RenderTargetColorSpace),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderTargetAxisDifference {
    pub axis: RenderTargetAxis,
    pub effective: RenderTargetAxisValue,
    pub requested: RenderTargetAxisValue,
}

/// Explicit per-aspect clear values for a render target (TS `RenderTargetClear`); omitted aspects are
/// preserved. Color values are linear float RGBA. `color` broadcasts one value to every color
/// attachment; `colors` sets each attachment, where a `None` entry preserves that attachment. The
/// two are mutually exclusive. One definition shared by every backend (D8).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RenderTargetClear {
    pub color: Option<[f32; 4]>,
    pub colors: Option<Vec<Option<[f32; 4]>>>,
    pub depth: Option<f32>,
    pub stencil: Option<i32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderTargetDescriptor {
    pub width: f32,
    pub height: f32,
    pub format: Option<RenderTargetFormat>,
    pub color_attachments: Option<f32>,
    pub color_formats: Option<Vec<RenderTargetFormat>>,
    pub sample_count: Option<f32>,
    pub depth: Option<RenderTargetDepth>,
    pub color_space: Option<RenderTargetColorSpace>,
}

/// A backend-neutral, lazily realized render-target texture source. Native GPU handles remain in
/// the consuming backend's identity-keyed cache rather than in this shared descriptor.
#[derive(Clone, Debug)]
pub struct RenderTarget {
    fields: TextureSourceFields,
    pub color_attachments: Option<f32>,
    pub color_formats: Option<Vec<RenderTargetFormat>>,
    pub color_space: RenderTargetColorSpace,
    pub depth: Option<RenderTargetDepth>,
    pub format: Option<RenderTargetFormat>,
    pub sample_count: Option<f32>,
}

/// A foreign GPU texture source. Its native handle is borrowed and retained only by a backend.
#[derive(Clone, Debug)]
pub struct ExternalTexture {
    fields: TextureSourceFields,
}

/// TS `RenderTexture extends Texture2D`: the constructor guarantees a `RenderTarget` source while
/// the Rust texture family continues to use its canonical structural 2D representation.
pub type RenderTexture = Texture2D;

#[derive(Clone, Debug, Default)]
pub struct CreateRenderTextureOptions {
    pub color_space: Option<TextureColorSpace>,
    pub color_attachments: Option<f32>,
    pub color_formats: Option<Vec<RenderTargetFormat>>,
    pub depth: Option<RenderTargetDepth>,
    pub flip_x: Option<bool>,
    pub flip_y: Option<bool>,
    pub format: Option<RenderTargetFormat>,
    pub height: u32,
    pub sample_count: Option<f32>,
    pub sampler: Option<Sampler>,
    pub uv_offset: Option<flight_geometry::Vector2>,
    pub uv_rotation: Option<f32>,
    pub uv_scale: Option<flight_geometry::Vector2>,
    pub width: u32,
}

#[derive(Clone, Debug, Default)]
pub struct CreateExternalTextureOptions {
    pub color_space: Option<TextureColorSpace>,
    pub height: u32,
    pub sampler: Option<Sampler>,
    pub width: u32,
}

pub type ResolvedRenderTargetDescriptor = RenderTargetAxes;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RenderTargetPadding {
    Uniform(f32),
    Edges(EffectPadding),
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderTargetSize {
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RenderStateStats {
    pub draw_call_count: u32,
    pub flush_count: u32,
    pub proxy_visited_count: u32,
}

/// Caller-owned ownership table for host-created canvas surfaces (D5).
#[derive(Default)]
pub struct CanvasHostSurfaces {
    pub hosts: HashMap<u64, HostCanvasCapability>,
}

/// Reused backend-neutral 3D render frame.
pub struct Scene3DRenderList {
    pub instanced_mesh_count: usize,
    pub lights: Scene3DLightBlock,
    pub mesh_count: usize,
    pub view_projection: Matrix4,
    pub visible_instanced_meshes: Vec<NodeRef>,
    pub visible_meshes: Vec<NodeRef>,
}

/// The per-draw resolved record a backend's 3D draw hands one mesh-material renderer for a single
/// Mesh subset (TS `Scene3DRenderProxy`, plain data). A reused scratch record owned by the backend
/// draw, valid only for the duration of the draw call it is passed to. `joint_matrices` /
/// `normal_matrices` share the skinned mesh's skeleton palettes; `instance_*` carry the flattened
/// per-instance matrices (16 floats each) and linear colours (4 floats each) for an instanced draw.
pub struct Scene3DRenderProxy {
    pub alpha: Option<f32>,
    pub color_scale_bias: Option<ColorScaleBias>,
    pub color_matrix: Option<[f32; 20]>,
    pub instance_count: Option<usize>,
    pub instance_matrices: Option<Vec<f32>>,
    pub instance_colors: Option<Vec<f32>>,
    pub joint_matrices: Option<Ref<Box<flight_entity::Float32Array>>>,
    pub normal_matrices: Option<Ref<Box<flight_entity::Float32Array>>>,
    pub material: flight_materials::Material3DRef,
    pub normal_matrix: flight_geometry::Matrix3,
    pub subset: flight_meshgeometry::MeshSubset,
    pub world_matrix: Matrix4,
}

pub struct PreparedScene3D {
    pub frustum: Frustum,
    pub list: Scene3DRenderList,
    pub world_bounds: Aabb,
}

/// Helper for tests and hosts that need a surface plus its allocating capability.
pub struct CanvasHostSurfaceEntry {
    pub surface: Ref<CanvasSurface>,
    pub host: HostCanvasCapability,
}

/// A texture-resolution diagnostic (TS `TextureResolutionExplanation`): resolver availability only;
/// a registered resolver may still return its own null sentinel while a resource is not ready.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureResolutionExplanation {
    pub kind: Option<Kind>,
    pub status: TextureResolutionStatus,
}

impl Default for RenderTarget {
    fn default() -> Self {
        let mut fields = TextureSourceFields::default();
        fields.kind = RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string();
        return RenderTarget {
            fields,
            color_attachments: None,
            color_formats: None,
            color_space: RenderTargetColorSpace::default(),
            depth: None,
            format: None,
            sample_count: None,
        };
    }
}

impl Default for ExternalTexture {
    fn default() -> Self {
        let mut fields = TextureSourceFields::default();
        fields.kind = EXTERNAL_TEXTURE_SOURCE_KIND.to_string();
        return ExternalTexture { fields };
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl Deref for RenderTarget {
    type Target = TextureSourceFields;

    fn deref(&self) -> &TextureSourceFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl DerefMut for RenderTarget {
    fn deref_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D12 entity identity lives in composed source fields
impl Entity for RenderTarget {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

// flight-lint: allow(sugar-delegates) D16 open texture-source family uses composed fields
impl TextureSource for RenderTarget {
    fn texture_source_fields(&self) -> &TextureSourceFields {
        return &self.fields;
    }

    fn texture_source_fields_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl Deref for ExternalTexture {
    type Target = TextureSourceFields;

    fn deref(&self) -> &TextureSourceFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl DerefMut for ExternalTexture {
    fn deref_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D12 entity identity lives in composed source fields
impl Entity for ExternalTexture {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

// flight-lint: allow(sugar-delegates) D16 open texture-source family uses composed fields
impl TextureSource for ExternalTexture {
    fn texture_source_fields(&self) -> &TextureSourceFields {
        return &self.fields;
    }

    fn texture_source_fields_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

impl Default for RenderStateFields {
    fn default() -> Self {
        return RenderStateFields {
            runtime: EntityRuntimeSlot::default(),
            allow_smoothing: true,
            current_clip_depth: 0,
            pixel_ratio: 1.0,
            render_alpha: 1.0,
            render_blend_mode: Some(flight_materials::BLEND_MODE_NORMAL.to_string()),
            round_pixels: false,
            scene_graph_sync_policy: Scene3DGraphSyncPolicy::RefreshDerivedState,
        };
    }
}

flight_entity::impl_entity!(RenderStateFields);

impl Entity for BaseRenderState {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.render.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.render.entity_runtime_mut();
    }
}

impl RenderState for BaseRenderState {
    fn render_registries(&self) -> &RenderRegistries<Self> {
        return &self.registries;
    }

    fn render_registries_mut(&mut self) -> &mut RenderRegistries<Self> {
        return &mut self.registries;
    }

    fn render_runtime(&self) -> &RenderStateRuntime<Self> {
        return &self.runtime;
    }

    fn render_runtime_mut(&mut self) -> &mut RenderStateRuntime<Self> {
        return &mut self.runtime;
    }

    fn render_state(&self) -> &RenderStateFields {
        return &self.render;
    }

    fn render_state_mut(&mut self) -> &mut RenderStateFields {
        return &mut self.render;
    }
}

impl<S: RenderState> Default for RenderRegistries<S> {
    fn default() -> Self {
        return RenderRegistries {
            canvas_shape_commands: None,
            clip_hooks: None,
            color_adjustments: None,
            color_adjustment_unsupported_guard: None,
            effect_padding_resolvers: None,
            node_renderers: Arc::new(KindMap {
                entries: HashMap::new(),
                key_order: Vec::new(),
            }),
            render_root_guard: None,
            skinned_mesh_bounds_guard: None,
            stroke_tessellator: None,
        };
    }
}

impl<S: RenderState> Default for RenderStateOptions<S> {
    fn default() -> Self {
        return RenderStateOptions {
            canvas_shape_commands: None,
            clip_hooks: None,
            color_adjustments: None,
            color_adjustment_unsupported_guard: None,
            effect_padding_resolvers: None,
            node_renderers: None,
            render_root_guard: None,
            stroke_tessellator: None,
        };
    }
}

impl<S: RenderState> Default for RenderStateRuntime<S> {
    fn default() -> Self {
        return RenderStateRuntime {
            current_frame_id: 0,
            render_adapt_hook: None,
            render_proxy_adapter_map: HashMap::new(),
            registry_signals: None,
            registry_guard_enabled: false,
            registry_misses: Ref::default(),
            registry_guard_log: Ref::default(),
            color_adjustment_guard_log: None,
            scene_render_guard_log: None,
            renderer_map_id: 0,
            node_revisions: NodeRevisionState::default(),
            prepared_scene3d: None,
        };
    }
}

impl<S: RenderState> Entity for RenderProxy<S> {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return &self.runtime;
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return &mut self.runtime;
    }
}

impl<S: RenderState> std::ops::Deref for RenderProxy2D<S> {
    type Target = RenderProxy<S>;

    fn deref(&self) -> &Self::Target {
        return &self.proxy;
    }
}

impl<S: RenderState> std::ops::DerefMut for RenderProxy2D<S> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        return &mut self.proxy;
    }
}

impl<S: RenderState> Default for RenderProxies2D<S> {
    fn default() -> Self {
        return RenderProxies2D {
            entries: Vec::new(),
            by_uid: HashMap::new(),
            temp_stack: Vec::new(),
        };
    }
}

impl<S: RenderState> Entity for RenderProxyAdapter<S> {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return &self.runtime;
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return &mut self.runtime;
    }
}

impl Default for RenderCache {
    fn default() -> Self {
        return RenderCache {
            runtime: EntityRuntimeSlot::default(),
            kind: String::new(),
            transform: flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        };
    }
}

flight_entity::impl_entity!(RenderCache);

impl Default for RenderQueue {
    fn default() -> Self {
        return RenderQueue {
            runtime: EntityRuntimeSlot::default(),
            entries: Vec::new(),
            entry_count: 0,
        };
    }
}

flight_entity::impl_entity!(RenderQueue);

/// Whether a texture's source kind has a registered resolver (TS `TextureResolutionStatus`). One
/// definition shared by every backend (D8).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextureResolutionStatus {
    MissingKind,
    MissingResolver,
    Registered,
}
