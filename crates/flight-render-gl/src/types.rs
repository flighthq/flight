// flight-lint: allow-file(contract-vocabulary, enum-payload-named, file-structure, sugar-delegates) GL backend contracts mirror the pinned structural WebGL types and D17 ownership model

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::rc::{Rc, Weak};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use flight_camera::Camera3D;
use flight_entity::{AnySlot, Entity, EntityRuntimeSlot, Kind, Ref, UnknownValue};
use flight_image::{HostImageCapability, ImageResolverState};
use flight_lighting::{Scene3DLightBlock, Scene3DLightsLike};
use flight_log::LogStateRef;
use flight_materials::{BlendMode, Material2D, Material3D, MaterialData, PbrExtension, PbrUvSet};
use flight_meshgeometry::MeshGeometry;
use flight_node::NodeRef;
use flight_registry::KindMap;
use flight_render::{
    CanvasHostSurfaces, RenderProxies2D, RenderProxy2D, RenderRegistries, RenderState,
    RenderStateBackend, RenderStateFields, RenderStateOptions, RenderStateRuntime,
    RenderTargetAxes, RenderTargetAxisDifference, Scene3DRenderProxy, ShapeRasterizer,
};
use flight_shading::Modifier;
use flight_signals::Signal;
use flight_surface::HostCanvasCapability;
use flight_texture::{RenderTargetColorSpace, Texture, TextureColorSpace, TextureVariant};
use flight_texture_formats::TextureContainerFormat;
use flight_velocity::VelocityField;
use glow::{
    NativeBuffer, NativeFramebuffer, NativeProgram, NativeRenderbuffer, NativeShader,
    NativeTexture, NativeUniformLocation, NativeVertexArray,
};

/// A provider-reported snapshot used by diagnostics and target policy.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GlCapabilities {
    pub max_texture_size: u32,
    pub max_texture_units: u32,
    pub max_samples: u32,
    pub max_draw_buffers: u32,
    pub max_color_attachments: u32,
    pub max_renderbuffer_size: u32,
    pub supports_color_buffer_float: bool,
    pub supports_float_linear: bool,
    pub supports_srgb: bool,
    pub max_anisotropy: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlCullFaceKind {
    Back,
    Front,
    FrontAndBack,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlDepthFuncKind {
    Always,
    Equal,
    Greater,
    GreaterEqual,
    Less,
    LessEqual,
    Never,
    NotEqual,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlFramebufferStatusKind {
    Complete,
    IncompleteAttachment,
    IncompleteDimensions,
    IncompleteMissingAttachment,
    IncompleteMultisample,
    Unsupported,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlTextureFilterKind {
    Linear,
    LinearMipmapLinear,
    LinearMipmapNearest,
    Nearest,
    NearestMipmapLinear,
    NearestMipmapNearest,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlTextureWrapKind {
    ClampToEdge,
    MirroredRepeat,
    Repeat,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlTextureInternalFormat {
    R8,
    R16F,
    R32F,
    Rg8,
    Rg16F,
    Rgba8,
    Rgba16F,
    Rgba32F,
    Srgb8Alpha8,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct GlTextureDescriptor {
    pub wrap_s: Option<GlTextureWrapKind>,
    pub wrap_t: Option<GlTextureWrapKind>,
    pub min_filter: Option<GlTextureFilterKind>,
    pub mag_filter: Option<GlTextureFilterKind>,
    pub mipmaps: Option<bool>,
    pub anisotropy: Option<f32>,
    pub premultiply_alpha: Option<bool>,
    pub format: Option<GlTextureInternalFormat>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct GlCompressedTextureSupport {
    pub astc: bool,
    pub bptc: bool,
    pub etc: bool,
    pub pvrtc: bool,
    pub rgtc: bool,
    pub s3tc: bool,
}

pub type GlCompressedTextureDecoder =
    fn(TextureContainerFormat, u32, u32, &[u8]) -> Option<Vec<u8>>;

/// The opt-in inline color-adjustment fold for the GL sprite/quad batch (TS
/// `GlColorAdjustmentMaterialFeature`). Registered as persistent per-state policy by scene2d-gl's
/// `register_gl_color_adjustment_material_feature`; absent on a state that never opted in. The
/// shader chunks are the backend-authored pointwise color remap that material-family compilers
/// splice into promoted variants; `draw_shape_meshes` is the tessellated solid-fill hook; `record`
/// folds one instance's adjustment into the active batch; `flush` draws a folded batch, returning
/// `false` when the batch had no adjustment so the caller runs the lean material path.
pub struct GlColorAdjustmentMaterialFeature {
    pub fragment_shader_chunk: &'static str,
    pub matrix_fragment_shader_chunk: &'static str,
    pub draw_shape_meshes: fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>, &[GlShapeMesh]),
    pub flush: fn(&mut GlRenderState, usize) -> bool,
    pub record: fn(&mut GlRenderStateRuntime, Option<&GlColorAdjustmentData>, usize),
}
pub type GlColorAdjustmentMaterialFeatureGuard = fn(&mut GlRenderState, &GlColorAdjustmentData);

/// One tessellated solid-fill region of a Shape, ready for the flat-color mesh path (TS
/// `GlShapeMesh`): interleaved xy `vertices`, triangle `indices`, a packed `0xRRGGBBAA` fill
/// `color`, and the region `alpha`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GlShapeMesh {
    pub vertices: Vec<f32>,
    pub indices: Vec<u16>,
    pub color: u32,
    pub alpha: f32,
}

/// A color adjustment folded into the quad batch (TS `ColorScaleBias | TintMaterialData | readonly
/// number[]`). Plain values: the eight scale/bias floats in channel order, the packed `0xRRGGBBAA`
/// tint, or the 4x5 row-major color matrix.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GlColorAdjustmentData {
    ColorScaleBias([f32; 8]),
    TintMaterialData(u32),
    ColorMatrix([f32; 20]),
}

/// The per-pass context a velocity writer draws through (TS `GlVelocityContext`): the state, the
/// render-agnostic velocity field, the target size in device pixels and the pixel ratio.
pub struct GlVelocityContext<'a> {
    pub state: &'a mut GlRenderState,
    pub field: &'a VelocityField,
    pub width: f32,
    pub height: f32,
    pub pixel_ratio: f32,
}

/// Draws one renderable kind's velocity into the bound velocity target during the velocity pass (TS
/// `GlVelocityWriter`), registered per kind: the draw-time analog of a color renderer.
pub type GlVelocityWriter = fn(&mut GlVelocityContext<'_>, &NodeRef);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlQuadBatchShader {
    pub program: NativeProgram,
    pub loc_corner: u32,
    pub loc_mat_ab: u32,
    pub loc_mat_cd: u32,
    pub loc_mat_txty: u32,
    pub loc_uv_origin_axis_u: u32,
    pub loc_uv_axis_v: u32,
    pub loc_alpha: u32,
    pub loc_world_matrix: Option<NativeUniformLocation>,
    pub loc_texture: Option<NativeUniformLocation>,
    pub loc_straight_texture_alpha: Option<NativeUniformLocation>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlParticleShader {
    pub program: NativeProgram,
    pub loc_corner: u32,
    pub loc_pos: u32,
    pub loc_cos_scale: u32,
    pub loc_sin_scale: u32,
    pub loc_color: u32,
    pub loc_uv_rect: u32,
    pub loc_size: u32,
    pub loc_world_matrix: Option<NativeUniformLocation>,
    pub loc_texture: Option<NativeUniformLocation>,
    pub loc_straight_texture_alpha: Option<NativeUniformLocation>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlColorScaleBiasInstancedShader {
    pub program: NativeProgram,
    pub loc_corner: u32,
    pub loc_world_matrix: Option<NativeUniformLocation>,
    pub loc_texture: Option<NativeUniformLocation>,
    pub loc_straight_texture_alpha: Option<NativeUniformLocation>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlUniformColorScaleBiasShader {
    pub program: NativeProgram,
    pub loc_corner: u32,
    pub loc_world_matrix: Option<NativeUniformLocation>,
    pub loc_texture: Option<NativeUniformLocation>,
    pub loc_straight_texture_alpha: Option<NativeUniformLocation>,
    pub loc_color_scale: Option<NativeUniformLocation>,
    pub loc_color_bias: Option<NativeUniformLocation>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlShapeMeshColorScaleBiasShader {
    pub program: NativeProgram,
    pub position_location: u32,
    pub matrix_location: Option<NativeUniformLocation>,
    pub color_location: Option<NativeUniformLocation>,
    pub color_scale_location: Option<NativeUniformLocation>,
    pub color_bias_location: Option<NativeUniformLocation>,
    pub color_matrix_locations: Option<Vec<Option<NativeUniformLocation>>>,
}

/// The GL resources for one solid-fill mesh draw (TS `GlShapeMeshBinding`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlShapeMeshBinding {
    pub program: NativeProgram,
    pub vertex_buffer: NativeBuffer,
    pub index_buffer: NativeBuffer,
    pub position_location: u32,
    pub matrix_location: Option<NativeUniformLocation>,
    pub color_location: Option<NativeUniformLocation>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlColorAdjustmentResources {
    pub matrix_instanced_shader: GlColorScaleBiasInstancedShader,
    pub scale_bias_instanced_shader: GlColorScaleBiasInstancedShader,
    pub tint_instanced_shader: GlColorScaleBiasInstancedShader,
    pub uniform_scale_bias_shader: GlUniformColorScaleBiasShader,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlParticleResources {
    pub corner_buffer: NativeBuffer,
    pub instance_buffer: NativeBuffer,
    pub shader: GlParticleShader,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlQuadBatchResources {
    pub corner_buffer: NativeBuffer,
    pub shader: GlQuadBatchShader,
    pub writer_color_scale_bias_buffer: Option<NativeBuffer>,
    pub writer_instance_buffer: Option<NativeBuffer>,
    pub writer_material_buffer: Option<NativeBuffer>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlShapeMeshResources {
    pub binding: GlShapeMeshBinding,
    pub color_matrix_shader: Option<GlShapeMeshColorScaleBiasShader>,
    pub color_scale_bias_shader: Option<GlShapeMeshColorScaleBiasShader>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlBlendFactor {
    DstColor,
    One,
    OneMinusSrcAlpha,
    OneMinusSrcColor,
    Zero,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum GlBlendEquation {
    #[default]
    FuncAdd,
    FuncReverseSubtract,
    Max,
    Min,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlBlendRealization {
    pub src: GlBlendFactor,
    pub dst: GlBlendFactor,
    pub equation: Option<GlBlendEquation>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlBlendSignature {
    pub dst: u32,
    pub equation: u32,
    pub src: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlBoundShader {
    pub locations: Option<GlShaderLocations>,
    pub program: NativeProgram,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlShaderLocations {
    pub program: NativeProgram,
    pub loc_position: u32,
    pub loc_tex_coord: u32,
    pub loc_matrix: Option<NativeUniformLocation>,
    pub loc_alpha: Option<NativeUniformLocation>,
    pub loc_color_scale: Option<NativeUniformLocation>,
    pub loc_color_bias: Option<NativeUniformLocation>,
    pub loc_has_color_scale_bias: Option<NativeUniformLocation>,
    pub loc_texture: Option<NativeUniformLocation>,
}

pub type GlShaderBind =
    Arc<dyn Fn(&glow::Context, &mut GlRenderState, &flight_render::RenderProxy2D<GlRenderState>)>;

pub struct GlBitmapShader {
    pub(crate) runtime: EntityRuntimeSlot,
    pub locations: GlShaderLocations,
    pub program: NativeProgram,
    pub bind: GlShaderBind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlFullscreenProgram {
    pub program: NativeProgram,
    pub loc_position: u32,
    pub loc_tex_coord: u32,
    pub texture: Option<NativeUniformLocation>,
    pub textures: Vec<Option<NativeUniformLocation>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlFillProgram {
    pub fullscreen: GlFullscreenProgram,
    pub program: NativeProgram,
    pub loc_color: Option<NativeUniformLocation>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlTextureRealization {
    pub straight_alpha: bool,
    pub texture: NativeTexture,
}

pub type GlTextureResolver = fn(
    &mut GlRenderState,
    &dyn TextureVariant,
    bool,
    TextureColorSpace,
) -> Option<GlTextureRealization>;

pub trait GlQuadMaterialRenderer {
    fn instance_float_count(&self) -> usize;
    fn bind(&self, state: &mut GlRenderState, material: Option<&dyn Material2D>);
    fn pack_instance(
        &self,
        _state: &mut GlRenderState,
        _material_data: Option<&dyn MaterialData>,
        _out: &mut [f32],
        _offset: usize,
    ) {
    }
}

/// Per-backend 3D draw behavior for a mesh-material kind (TS `GlMeshMaterialRenderer`), registered
/// against the kind through scene3d-gl's `register_gl_mesh_material_renderer`. `bind` selects the
/// family program and uploads the per-run camera, light block and material state once per contiguous
/// run; `draw` uploads geometry lazily and issues one subset draw from the reused proxy. The light
/// block arrives as its shared handle: its identity keys the per-program upload cache (TS: the block
/// object), and a cache that keys by it also holds it, so the identity cannot be reused.
pub struct GlMeshMaterialRenderer {
    pub bind: fn(&mut GlRenderState, Option<&dyn Material3D>, &Rc<Scene3DLightBlock>, &Camera3D),
    pub draw: fn(&mut GlRenderState, &Scene3DRenderProxy, &MeshGeometry),
}

/// One `materialRenderers` table entry (TS `GlMeshMaterialRenderer | GlQuadMaterialRenderer`): a
/// material kind is either 2D or 3D, never both, so one table holds both without collision.
#[derive(Clone, Copy)]
pub enum GlMaterialRenderer {
    Mesh(&'static GlMeshMaterialRenderer),
    Quad(&'static dyn GlQuadMaterialRenderer),
}

/// The per-modifier binding context a ShadedMaterial renderer hands each snippet's `bind` (TS
/// `GlModifierBindContext`): the live state, the linked program, the modifier's stack `index` (the
/// uniform-name suffix) and a texture-unit allocator that returns -1 once exhausted.
pub struct GlModifierBindContext<'a> {
    pub acquire_modifier_texture_unit: &'a mut dyn FnMut() -> i32,
    pub index: usize,
    pub program: NativeProgram,
    pub state: &'a mut GlRenderState,
}

/// The GL registration record for one modifier kind (TS `GlModifierSnippet extends
/// ModifierDefinition`): the shading definition's kind/slot/define signature, the GLSL a ShadedMaterial
/// program injects for it (names suffixed by the stack index) and its optional per-draw uniform upload.
pub struct GlModifierSnippet {
    pub kind: &'static str,
    pub slot: &'static str,
    pub get_define_signature: Option<fn(&dyn Modifier) -> String>,
    pub bind: Option<fn(&dyn Modifier, &mut GlModifierBindContext<'_>)>,
    pub contribution: fn(&dyn Modifier, usize) -> String,
    pub declarations: Option<fn(&dyn Modifier, usize) -> String>,
}

/// Backend-safe operations exposed to a PBR extension binder (TS `GlPbrExtensionBindContext`).
/// Extensions name their own uniforms but never receive the private program record.
pub trait GlPbrExtensionBindContext {
    fn bind_transmission_scene_color(
        &mut self,
        sampler_uniform: &str,
        max_lod_uniform: &str,
    ) -> bool;
    fn bind_texture(
        &mut self,
        sampler_uniform: &str,
        uv_set_uniform: &str,
        uv_transform_uniform: &str,
        texture: Option<&Ref<Texture>>,
        uv_set: PbrUvSet,
    ) -> bool;
    fn set_linear_color(&mut self, uniform: &str, color: u32);
    fn set_float(&mut self, uniform: &str, value: f32);
}

/// Read-only facts available while a registered extension selects its shader contribution (TS
/// `GlPbrExtensionShaderContext`).
pub trait GlPbrExtensionShaderContext {
    fn has_transmission_scene_color(&self) -> bool;
    fn is_texture_ready(&self, texture: Option<&Ref<Texture>>) -> bool;
}

/// GLSL contributed by one registered PBR extension (TS `GlPbrExtensionShaderContribution`), composed
/// by the core PBR shader in descriptor order.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlPbrExtensionShaderContribution {
    pub apply_surface: String,
    pub contribute_ibl: String,
    pub contribute_punctual: String,
    pub finalize: String,
    pub fragment_declarations: String,
    pub fragment_functions: String,
    pub key: String,
    pub samples_transmission_scene_color: Option<bool>,
    pub texture_count: u32,
}

/// The GL realization of one open PbrExtension kind (TS `GlPbrExtensionRegistration`).
pub struct GlPbrExtensionRegistration {
    pub bind: fn(&mut dyn GlPbrExtensionBindContext, &PbrExtension),
    pub create_shader_contribution:
        fn(&dyn GlPbrExtensionShaderContext, &PbrExtension) -> GlPbrExtensionShaderContribution,
    pub is_supported: fn(&PbrExtension) -> bool,
}

/// A draw pass run after the 3D mesh passes (TS `GlScene3DPass`), installed by a register function
/// such as scene3d-gl's `register_gl_particle_emitter3d_pass`.
pub type GlScene3DPass = fn(&mut GlRenderState, &NodeRef, &Camera3D, &Scene3DLightsLike);

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlCustomMaterialShaderSource {
    pub fragment: String,
    pub vertex: String,
}

pub type GlCompressedTextureUploader = fn(
    &glow::Context,
    &flight_image::CompressedImageResource,
    Option<GlCompressedTextureDecoder>,
    TextureColorSpace,
) -> bool;

/// Backend-only persistent registration policy. Every table is an immutable `Arc` snapshot; a
/// register operation replaces exactly one table through `Arc::make_mut`.
#[derive(Clone)]
pub struct GlRenderRegistries {
    pub blend_realizations: Arc<KindMap<GlBlendRealization>>,
    pub color_adjustment_feature: Option<&'static GlColorAdjustmentMaterialFeature>,
    pub color_adjustment_feature_guard: Option<GlColorAdjustmentMaterialFeatureGuard>,
    pub compressed_texture_decoder: Option<GlCompressedTextureDecoder>,
    pub compressed_texture_upload: Option<GlCompressedTextureUploader>,
    pub custom_effect_shaders: Arc<KindMap<String>>,
    pub custom_material_shaders: Arc<KindMap<GlCustomMaterialShaderSource>>,
    /// TS `GlRenderRegistries.effects`: per-kind effect registrations owned by effects-gl. The value
    /// type belongs to that package, which depends on render-gl, so render-gl holds each
    /// registration opaquely by identity and never invokes it (D8 slot pattern).
    pub effects: Arc<KindMap<UnknownValue>>,
    pub material_renderers: Arc<KindMap<GlMaterialRenderer>>,
    pub modifier_snippets: Arc<KindMap<&'static GlModifierSnippet>>,
    pub passes: Option<Arc<Vec<GlScene3DPass>>>,
    pub pbr_extensions: Arc<KindMap<&'static GlPbrExtensionRegistration>>,
    pub shape_rasterizer: Option<ShapeRasterizer<GlRenderState>>,
    pub texture_resolvers: Arc<KindMap<GlTextureResolver>>,
    pub velocity_writers: Arc<KindMap<GlVelocityWriter>>,
}

pub struct GlRenderStateOptions {
    pub render_registries: RenderStateOptions<GlRenderState>,
    pub gl_registries: GlRenderRegistries,
    pub canvas_host: Option<HostCanvasCapability>,
    pub image_host: Option<HostImageCapability>,
    // The host image measurer invalidation re-measures surface images through (TS module-global
    // `registerHostImageDimensionResolver`; D5 caller-owned and shared). `None` keeps the size the
    // image host measured, as TS does with no resolver registered.
    pub image_resolver: Option<Ref<ImageResolverState>>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct GlScissorRect {
    pub height: i32,
    pub width: i32,
    pub x: i32,
    pub y: i32,
}

pub type GlViewportRect = GlScissorRect;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct GlRenderStats {
    pub draw_calls: u32,
    pub triangles: u32,
    pub texture_binds: u32,
    pub program_switches: u32,
    pub framebuffer_binds: u32,
    pub uniform_uploads: u32,
}

/// A deletion request contains no context owner. It is safe to enqueue from a resource destructor;
/// only `flush_gl_delete_queue` interprets it on the GL thread.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlDeletion {
    Buffer(NativeBuffer),
    Framebuffer(NativeFramebuffer),
    Program(NativeProgram),
    Renderbuffer(NativeRenderbuffer),
    Shader(NativeShader),
    Texture(NativeTexture),
    VertexArray(NativeVertexArray),
    TextureEntity(u64),
}

#[derive(Clone)]
pub struct GlDeleteQueue(pub Arc<Mutex<Vec<GlDeletion>>>, pub Arc<AtomicBool>);

#[derive(Default)]
pub struct GlTextureCaches {
    pub by_texture_entity: HashMap<(u64, bool, bool), GlTextureCacheEntry>,
    pub external_by_source_entity: HashMap<u64, NativeTexture>,
    pub mipmapped: HashSet<NativeTexture>,
    pub render_target_by_source_entity: HashMap<u64, Rc<RefCell<GlRenderTextureEntry>>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlTextureCacheEntry {
    pub texture: NativeTexture,
    pub version: u32,
    pub straight_alpha: bool,
}

pub struct GlContextRuntime {
    pub binding: Option<GlBoundShader>,
    pub current_blend_signature: Option<GlBlendSignature>,
    pub current_texture_realization: Option<GlTextureRealization>,
    pub quad_index_buffer: Option<NativeBuffer>,
    pub quad_vertex_buffer: Option<NativeBuffer>,
    pub references: usize,
    pub teardowns: Vec<Box<dyn FnOnce(&glow::Context)>>,
    pub texture_caches: GlTextureCaches,
    pub delete_queue: GlDeleteQueue,
    pub context_lost: bool,
    pub anisotropy_extension: Option<bool>,
    pub max_anisotropy: f32,
    /// Native OpenGL has no `UNPACK_PREMULTIPLY_ALPHA_WEBGL` parameter. Upload helpers apply the
    /// conversion to CPU pixels while this shadow preserves the renderer's bracket semantics.
    pub unpack_premultiply_alpha: bool,
    pub fill_program: Option<GlFillProgram>,
    pub fullscreen_programs: HashMap<String, GlFullscreenProgram>,
    pub quad_vertex_array: Option<NativeVertexArray>,
    pub color_adjustment_resources: Option<GlColorAdjustmentResources>,
    pub particle_resources: Option<GlParticleResources>,
    pub quad_batch_resources: Option<GlQuadBatchResources>,
    pub shape_mesh_resources: Option<GlShapeMeshResources>,
    /// Opaque per-context record of scene2d-gl (TS module WeakMaps keyed by `GlContext`, e.g. the
    /// clip-contour and velocity programs); render-gl only retains it.
    pub scene2d_context_runtime: Option<Box<dyn std::any::Any>>,
    /// Opaque per-context record of scene3d-gl (TS `GlContextRuntime.sceneMeshUploadCache`, the
    /// geometry upload cache derived states share); render-gl only retains it.
    pub scene3d_context_runtime: Option<Box<dyn std::any::Any>>,
    pub(crate) pass_handle_pool: Vec<GlRenderPass>,
    pub(crate) pass_stack: Vec<GlPassStackEntry>,
    pub state_runtimes: HashMap<u64, Weak<RefCell<GlRenderStateRuntime>>>,
    /// Per-context caches owned by effects-gl (TS module WeakMaps keyed by the GL context: compiled
    /// effect programs and uniform locations). Opaque here; only effects-gl reads it (D15 slot).
    pub effect_cache: AnySlot,
}

pub struct GlContextState {
    pub(crate) runtime: EntityRuntimeSlot,
    pub gl: Rc<glow::Context>,
    pub runtime_state: RefCell<GlContextRuntime>,
}

pub struct GlRenderStateRuntime {
    pub current_framebuffer: Option<NativeFramebuffer>,
    pub current_mask_depth: u32,
    pub current_scissor_rect: Option<GlScissorRect>,
    pub current_target_id: Option<u64>,
    pub render_target_viewport: Option<GlViewportRect>,
    pub scissor_stack: Vec<GlScissorRect>,
    pub clip_forms: Vec<GlClipForm>,
    pub(crate) cube_face_stack: Vec<SavedGlCubeFaceState>,
    pub(crate) render_state_stack: Vec<SavedGlRenderState>,
    pub matrix_array: [f32; 9],
    pub quad_vertex_data: [f32; 16],
    pub current_pass: Option<GlRenderPass>,
    pub current_target: Option<GlRenderTargetSnapshot>,
    pub default_bitmap_shader: Option<Arc<GlBitmapShader>>,
    pub material_bitmap_shader_map: HashMap<Kind, Arc<GlBitmapShader>>,
    pub shader_bindings: HashMap<u64, Arc<GlBitmapShader>>,
    pub render_texture_guard: Option<GlRenderTextureGuard>,
    pub binding_cache_guard: Option<fn(&GlRenderState, NativeProgram)>,
    pub guard_log: Option<LogStateRef>,
    pub first_render_root_id: Option<u64>,
    /// TS `GlRenderStateRuntime.pbrExtensionRevision`: bumped by scene3d-gl's `register_gl_pbr_extension`
    /// so the PBR program cache never reuses a variant compiled against a replaced registration.
    pub pbr_extension_revision: u32,
    /// TS `GlRenderStateRuntime.modifierSnippetRevision`: bumped by scene3d-gl's
    /// `register_gl_modifier_snippet` so the ShadedMaterial program cache never reuses a variant
    /// compiled against a replaced snippet.
    pub modifier_snippet_revision: u32,
    pub flush_pending_draws: Option<fn(&mut GlRenderState)>,
    pub destroyed: bool,
    pub stats: GlRenderStats,
    pub teardowns: Vec<fn(&mut GlRenderState)>,
    /// Per-state runtime owned by effects-gl (TS module WeakMaps keyed by the render state: effect
    /// guards and blend backdrops). Opaque here; only effects-gl reads it (D15 slot).
    pub effect_runtime: AnySlot,
    pub canvas_host_surfaces: CanvasHostSurfaces,
    pub particle_instance_data: Option<Vec<f32>>,
    pub quad_batch_writer_blend_mode: Option<BlendMode>,
    pub quad_batch_writer_material: Option<flight_entity::Ref<dyn Material2D>>,
    pub quad_batch_writer_material_renderer: Option<&'static dyn GlQuadMaterialRenderer>,
    pub quad_batch_writer_material_floats: usize,
    pub quad_batch_writer_material_data: Vec<f32>,
    pub quad_batch_writer_count: usize,
    pub quad_batch_writer_instance_data: Vec<f32>,
    pub quad_batch_writer_texture: Option<NativeTexture>,
    pub quad_batch_writer_sampler: Option<flight_texture::Sampler>,
    pub quad_batch_writer_straight_alpha: bool,
    pub quad_batch_writer_smoothing: Option<bool>,
    pub quad_batch_writer_color_scale_bias_mode: Option<u32>,
    pub quad_batch_writer_uniform_color_scale_bias: Option<GlColorAdjustmentData>,
    pub quad_batch_writer_color_scale_bias_data: Option<Vec<f32>>,
    pub quad_batch_writer_color_matrix_data: Option<Vec<f32>>,
    pub quad_batch_writer_color_tint_data: Option<Vec<u32>>,
    /// Opaque per-state record of scene2d-gl (TS module WeakMaps keyed by `GlRenderState`, e.g. the
    /// render-cache targets); render-gl only retains it.
    pub scene2d_runtime: Option<Box<dyn std::any::Any>>,
    /// Opaque per-state record of scene3d-gl (TS module WeakMap keyed by `GlRenderState`, the
    /// `GlScene3DRuntime`); render-gl only retains it.
    pub scene3d_runtime: Option<Box<dyn std::any::Any>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlClipForm {
    Rect,
    Contour,
}

pub struct GlRenderState {
    pub render: RenderStateFields,
    pub runtime: RenderStateRuntime<GlRenderState>,
    pub registries: RenderRegistries<GlRenderState>,
    pub gl: Rc<glow::Context>,
    pub context_state: Rc<GlContextState>,
    pub gl_runtime: Rc<RefCell<GlRenderStateRuntime>>,
    pub gl_registries: GlRenderRegistries,
    pub apply_blend_mode: Option<fn(&mut GlRenderState, Option<&BlendMode>)>,
    pub canvas_host: Option<HostCanvasCapability>,
    pub image_host: Option<HostImageCapability>,
    // The host image measurer invalidation re-measures surface images through (TS module-global
    // `registerHostImageDimensionResolver`; D5 caller-owned and shared). `None` keeps the size the
    // image host measured, as TS does with no resolver registered.
    pub image_resolver: Option<Ref<ImageResolverState>>,
}

pub struct GlContextLossSignals {
    pub on_gl_context_lost: Signal<()>,
    pub on_gl_context_restored: Signal<()>,
}

pub trait GlRenderTarget: Entity {
    fn gl(&self) -> &Rc<glow::Context>;
    fn framebuffer(&self) -> Option<NativeFramebuffer>;
    fn width(&self) -> u32;
    fn height(&self) -> u32;
    fn color_attachments(&self) -> u32;
    fn color_space(&self) -> RenderTargetColorSpace;
    fn set_color_space(&mut self, color_space: RenderTargetColorSpace);
    fn resolve_framebuffer(&self) -> Option<NativeFramebuffer> {
        return None;
    }
    fn sample_count(&self) -> u32 {
        return 1;
    }
    /// Every color texture the target draws into (TS `textures`, which the framebuffer-feedback check
    /// searches); empty for a target with no sampleable color texture (the screen).
    fn color_textures(&self) -> Vec<NativeTexture> {
        return Vec::new();
    }
}

pub struct GlScreenRenderTarget {
    pub(crate) runtime: EntityRuntimeSlot,
    pub gl: Rc<glow::Context>,
    pub width: u32,
    pub height: u32,
    pub color_space: RenderTargetColorSpace,
}

pub struct GlTextureRenderTarget {
    pub(crate) runtime: EntityRuntimeSlot,
    pub gl: Rc<glow::Context>,
    pub requested_axes: RenderTargetAxes,
    pub axes: RenderTargetAxes,
    pub framebuffer: NativeFramebuffer,
    pub resolve_framebuffer: Option<NativeFramebuffer>,
    pub textures: Vec<NativeTexture>,
    pub texture: NativeTexture,
    pub depth_texture: Option<NativeTexture>,
    pub color_renderbuffers: Vec<NativeRenderbuffer>,
    pub depth_stencil_renderbuffer: Option<NativeRenderbuffer>,
    pub delete_queue: GlDeleteQueue,
    pub destroyed: bool,
}

pub struct GlTextureRenderTargetStorage {
    pub axes: RenderTargetAxes,
    pub framebuffer: NativeFramebuffer,
    pub resolve_framebuffer: Option<NativeFramebuffer>,
    pub textures: Vec<NativeTexture>,
    pub depth_texture: Option<NativeTexture>,
    pub color_renderbuffers: Vec<NativeRenderbuffer>,
    pub depth_stencil_renderbuffer: Option<NativeRenderbuffer>,
}

#[derive(Default)]
pub struct GlTextureRenderTargetPool {
    pub(crate) runtime: EntityRuntimeSlot,
    pub free: Vec<GlTextureRenderTarget>,
}

pub struct GlCubeRenderTarget {
    pub(crate) runtime: EntityRuntimeSlot,
    pub gl: Rc<glow::Context>,
    pub color_space: RenderTargetColorSpace,
    pub depth_stencil_renderbuffer: Option<NativeRenderbuffer>,
    pub framebuffer: NativeFramebuffer,
    pub size: u32,
    pub texture: NativeTexture,
    pub delete_queue: GlDeleteQueue,
    pub destroyed: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct GlCubeRenderTargetOptions {
    pub depth: Option<bool>,
}

pub struct GlSkinPaletteTexture {
    pub(crate) runtime: EntityRuntimeSlot,
    pub joint_capacity: usize,
    pub texture: NativeTexture,
    pub delete_queue: GlDeleteQueue,
    pub destroyed: bool,
}

pub struct GlRenderViewResources {
    pub(crate) runtime: EntityRuntimeSlot,
    pub render_state: GlRenderState,
    pub render_target: GlTextureRenderTarget,
    pub viewport: flight_node::Viewport,
    pub proxies: RenderProxies2D<GlRenderState>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum GlRenderTextureStatus {
    Ready,
    Released,
    #[default]
    Unrendered,
    Writing,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct GlRenderTextureExplanation {
    pub height: u32,
    pub status: GlRenderTextureStatus,
    pub width: u32,
}

pub struct GlRenderTextureEntry {
    pub status: GlRenderTextureStatus,
    pub target: GlTextureRenderTarget,
}

pub type GlRenderTextureGuard =
    fn(&mut GlRenderState, &dyn TextureVariant, &GlRenderTextureExplanation);

pub struct GlRenderTexturePool {
    pub(crate) runtime: EntityRuntimeSlot,
    pub context_id: Option<usize>,
    pub destroyed: bool,
    pub effect_targets: GlTextureRenderTargetPool,
    pub free: Vec<flight_render::RenderTexture>,
    pub leased: HashSet<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderTargetExplanation {
    pub differences: Vec<RenderTargetAxisDifference>,
    pub effective: RenderTargetAxes,
    pub requested: RenderTargetAxes,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlRenderTargetSnapshot {
    pub color_attachments: u32,
    /// Every color texture the target draws into (TS `textures`), so a sampler can detect framebuffer
    /// feedback against any active draw attachment; empty for the screen.
    pub color_textures: Vec<NativeTexture>,
    pub framebuffer: Option<NativeFramebuffer>,
    pub height: u32,
    pub id: u64,
    pub resolve_framebuffer: Option<NativeFramebuffer>,
    pub sample_count: u32,
    pub width: u32,
}

#[derive(Clone)]
pub struct GlRenderPass(pub Rc<RefCell<GlRenderPassHandle>>);

pub struct GlRenderPassHandle {
    pub(crate) runtime: EntityRuntimeSlot,
    pub gl: Rc<glow::Context>,
    pub owner_id: u64,
    pub target: GlRenderTargetSnapshot,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SavedGlPassState {
    pub clip_forms: Vec<GlClipForm>,
    pub current_mask_depth: u32,
    pub framebuffer: Option<NativeFramebuffer>,
    pub render_target: Option<GlRenderTargetSnapshot>,
    pub render_target_viewport: Option<GlViewportRect>,
    pub scissor_rect: Option<GlScissorRect>,
    pub scissor_stack: Vec<GlScissorRect>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct SavedGlStencil {
    pub fail: u32,
    pub function: u32,
    pub pass_depth_fail: u32,
    pub pass_depth_pass: u32,
    pub reference: i32,
    pub value_mask: u32,
    pub write_mask: u32,
}

pub(crate) struct GlPassStackEntry {
    pub depth_mask: bool,
    pub fallback_viewport: [i32; 4],
    pub owner_id: u64,
    pub owner_state: SavedGlPassState,
    pub previous_state: SavedGlPassState,
    pub stencil: Option<SavedGlStencil>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SavedGlCubeFaceState {
    pub clip_forms: Vec<GlClipForm>,
    pub current_framebuffer: Option<NativeFramebuffer>,
    pub current_mask_depth: u32,
    pub current_render_target: Option<GlRenderTargetSnapshot>,
    pub current_scissor_rect: Option<GlScissorRect>,
    pub depth_mask: bool,
    pub framebuffer: Option<NativeFramebuffer>,
    pub render_target_viewport: Option<GlViewportRect>,
    pub scissor_box: [i32; 4],
    pub scissor_stack: Vec<GlScissorRect>,
    pub scissor_test: bool,
    pub stencil_test: bool,
    pub viewport: [i32; 4],
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SavedGlRenderState {
    pub active_texture: u32,
    pub blend: bool,
    pub blend_dst_alpha: u32,
    pub blend_dst_rgb: u32,
    pub blend_equation_alpha: u32,
    pub blend_equation_rgb: u32,
    pub blend_src_alpha: u32,
    pub blend_src_rgb: u32,
    pub clear_color: [f32; 4],
    pub color_mask: [bool; 4],
    pub cull_face: bool,
    pub cull_face_mode: u32,
    pub current_blend_signature: Option<GlBlendSignature>,
    pub current_framebuffer: Option<NativeFramebuffer>,
    pub current_render_target: Option<GlRenderTargetSnapshot>,
    pub current_scissor_rect: Option<GlScissorRect>,
    pub current_shader: Option<GlBoundShader>,
    pub current_texture_realization: Option<GlTextureRealization>,
    pub depth_func: u32,
    pub depth_mask: bool,
    pub depth_test: bool,
    pub framebuffer: Option<NativeFramebuffer>,
    pub front_face: u32,
    pub program: Option<NativeProgram>,
    pub render_target_viewport: Option<GlViewportRect>,
    pub scissor_box: [i32; 4],
    pub scissor_test: bool,
    pub stencil_back_fail: u32,
    pub stencil_back_function: u32,
    pub stencil_back_pass_depth_fail: u32,
    pub stencil_back_pass_depth_pass: u32,
    pub stencil_back_reference: i32,
    pub stencil_back_value_mask: u32,
    pub stencil_back_write_mask: u32,
    pub stencil_fail: u32,
    pub stencil_function: u32,
    pub stencil_pass_depth_fail: u32,
    pub stencil_pass_depth_pass: u32,
    pub stencil_reference: i32,
    pub stencil_test: bool,
    pub stencil_value_mask: u32,
    pub stencil_write_mask: u32,
    pub texture_2d_by_unit: Vec<Option<NativeTexture>>,
    pub unpack_premultiply_alpha: bool,
    pub vertex_array: Option<NativeVertexArray>,
    pub viewport: [i32; 4],
}

fn empty_kind_map<T>() -> KindMap<T> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

impl Default for GlDeleteQueue {
    fn default() -> Self {
        return GlDeleteQueue(
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(AtomicBool::new(true)),
        );
    }
}

impl Default for GlRenderRegistries {
    fn default() -> Self {
        return GlRenderRegistries {
            blend_realizations: Arc::new(empty_kind_map()),
            color_adjustment_feature: None,
            color_adjustment_feature_guard: None,
            compressed_texture_decoder: None,
            compressed_texture_upload: None,
            custom_effect_shaders: Arc::new(empty_kind_map()),
            custom_material_shaders: Arc::new(empty_kind_map()),
            effects: Arc::new(empty_kind_map()),
            material_renderers: Arc::new(empty_kind_map()),
            modifier_snippets: Arc::new(empty_kind_map()),
            passes: None,
            pbr_extensions: Arc::new(empty_kind_map()),
            shape_rasterizer: None,
            texture_resolvers: Arc::new(empty_kind_map()),
            velocity_writers: Arc::new(empty_kind_map()),
        };
    }
}

impl Default for GlRenderStateOptions {
    fn default() -> Self {
        return GlRenderStateOptions {
            render_registries: RenderStateOptions::default(),
            gl_registries: GlRenderRegistries::default(),
            canvas_host: None,
            image_host: None,
            image_resolver: None,
        };
    }
}

impl Default for GlRenderStateRuntime {
    fn default() -> Self {
        return GlRenderStateRuntime {
            current_framebuffer: None,
            current_mask_depth: 0,
            current_scissor_rect: None,
            current_target_id: None,
            render_target_viewport: None,
            scissor_stack: Vec::new(),
            clip_forms: Vec::new(),
            cube_face_stack: Vec::new(),
            render_state_stack: Vec::new(),
            matrix_array: [0.0; 9],
            quad_vertex_data: [0.0; 16],
            current_pass: None,
            current_target: None,
            default_bitmap_shader: None,
            material_bitmap_shader_map: HashMap::new(),
            shader_bindings: HashMap::new(),
            render_texture_guard: None,
            binding_cache_guard: None,
            guard_log: None,
            first_render_root_id: None,
            pbr_extension_revision: 0,
            modifier_snippet_revision: 0,
            flush_pending_draws: None,
            destroyed: false,
            stats: GlRenderStats::default(),
            teardowns: Vec::new(),
            effect_runtime: None,
            canvas_host_surfaces: CanvasHostSurfaces::default(),
            particle_instance_data: None,
            quad_batch_writer_blend_mode: None,
            quad_batch_writer_material: None,
            quad_batch_writer_material_renderer: None,
            quad_batch_writer_material_floats: 0,
            quad_batch_writer_material_data: vec![0.0; 8 * 256],
            quad_batch_writer_count: 0,
            quad_batch_writer_instance_data: vec![0.0; 13 * 256],
            quad_batch_writer_texture: None,
            quad_batch_writer_sampler: None,
            quad_batch_writer_straight_alpha: false,
            quad_batch_writer_smoothing: None,
            quad_batch_writer_color_scale_bias_mode: None,
            quad_batch_writer_uniform_color_scale_bias: None,
            quad_batch_writer_color_scale_bias_data: None,
            quad_batch_writer_color_matrix_data: None,
            quad_batch_writer_color_tint_data: None,
            scene2d_runtime: None,
            scene3d_runtime: None,
        };
    }
}

impl Entity for GlRenderState {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.render.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.render.entity_runtime_mut();
    }
}

impl RenderState for GlRenderState {
    fn render_backend(&self) -> RenderStateBackend {
        return RenderStateBackend::Gl;
    }

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

flight_entity::impl_entity!(GlBitmapShader);
flight_entity::impl_entity!(GlContextState);
flight_entity::impl_entity!(GlCubeRenderTarget);
flight_entity::impl_entity!(GlRenderPassHandle);
flight_entity::impl_entity!(GlRenderViewResources);
flight_entity::impl_entity!(GlRenderTexturePool);
flight_entity::impl_entity!(GlScreenRenderTarget);
flight_entity::impl_entity!(GlSkinPaletteTexture);
flight_entity::impl_entity!(GlTextureRenderTarget);
flight_entity::impl_entity!(GlTextureRenderTargetPool);

impl GlRenderTarget for GlScreenRenderTarget {
    fn color_attachments(&self) -> u32 {
        return 1;
    }
    fn color_space(&self) -> RenderTargetColorSpace {
        return self.color_space;
    }
    fn framebuffer(&self) -> Option<NativeFramebuffer> {
        return None;
    }
    fn gl(&self) -> &Rc<glow::Context> {
        return &self.gl;
    }
    fn height(&self) -> u32 {
        return self.height;
    }
    fn set_color_space(&mut self, color_space: RenderTargetColorSpace) {
        self.color_space = color_space;
    }
    fn width(&self) -> u32 {
        return self.width;
    }
}

impl GlRenderTarget for GlTextureRenderTarget {
    fn color_attachments(&self) -> u32 {
        return self.axes.color_attachments;
    }
    fn color_space(&self) -> RenderTargetColorSpace {
        return self.axes.color_space;
    }
    fn color_textures(&self) -> Vec<NativeTexture> {
        return self.textures.clone();
    }
    fn framebuffer(&self) -> Option<NativeFramebuffer> {
        return Some(self.framebuffer);
    }
    fn gl(&self) -> &Rc<glow::Context> {
        return &self.gl;
    }
    fn height(&self) -> u32 {
        return self.axes.height;
    }
    fn resolve_framebuffer(&self) -> Option<NativeFramebuffer> {
        return self.resolve_framebuffer;
    }
    fn sample_count(&self) -> u32 {
        return self.axes.sample_count;
    }
    fn set_color_space(&mut self, color_space: RenderTargetColorSpace) {
        self.axes.color_space = color_space;
        self.requested_axes.color_space = color_space;
    }
    fn width(&self) -> u32 {
        return self.axes.width;
    }
}

impl GlRenderTarget for GlCubeRenderTarget {
    fn color_attachments(&self) -> u32 {
        return 1;
    }

    fn color_space(&self) -> RenderTargetColorSpace {
        return self.color_space;
    }

    // TS `GlCubeRenderTarget.textures`: its sole entry is the cubemap texture.
    fn color_textures(&self) -> Vec<NativeTexture> {
        return vec![self.texture];
    }

    fn framebuffer(&self) -> Option<NativeFramebuffer> {
        return Some(self.framebuffer);
    }

    fn gl(&self) -> &Rc<glow::Context> {
        return &self.gl;
    }

    fn height(&self) -> u32 {
        return self.size;
    }

    fn set_color_space(&mut self, color_space: RenderTargetColorSpace) {
        self.color_space = color_space;
    }

    fn width(&self) -> u32 {
        return self.size;
    }
}

impl PartialEq for GlRenderPass {
    fn eq(&self, other: &Self) -> bool {
        return Rc::ptr_eq(&self.0, &other.0);
    }
}

impl Eq for GlRenderPass {}

impl Drop for GlTextureRenderTarget {
    fn drop(&mut self) {
        if self.destroyed || !self.delete_queue.1.load(Ordering::Acquire) {
            return;
        }
        let mut queue = self.delete_queue.0.lock().unwrap();
        queue.push(GlDeletion::Framebuffer(self.framebuffer));
        if let Some(framebuffer) = self.resolve_framebuffer {
            queue.push(GlDeletion::Framebuffer(framebuffer));
        }
        queue.extend(self.textures.iter().copied().map(GlDeletion::Texture));
        if let Some(texture) = self.depth_texture {
            queue.push(GlDeletion::Texture(texture));
        }
        queue.extend(
            self.color_renderbuffers
                .iter()
                .copied()
                .map(GlDeletion::Renderbuffer),
        );
        if let Some(renderbuffer) = self.depth_stencil_renderbuffer {
            queue.push(GlDeletion::Renderbuffer(renderbuffer));
        }
    }
}

impl Drop for GlCubeRenderTarget {
    fn drop(&mut self) {
        if self.destroyed || !self.delete_queue.1.load(Ordering::Acquire) {
            return;
        }
        let mut queue = self.delete_queue.0.lock().unwrap();
        queue.push(GlDeletion::Framebuffer(self.framebuffer));
        queue.push(GlDeletion::Texture(self.texture));
        if let Some(renderbuffer) = self.depth_stencil_renderbuffer {
            queue.push(GlDeletion::Renderbuffer(renderbuffer));
        }
    }
}

impl Drop for GlSkinPaletteTexture {
    fn drop(&mut self) {
        if !self.destroyed && self.delete_queue.1.load(Ordering::Acquire) {
            self.delete_queue
                .0
                .lock()
                .unwrap()
                .push(GlDeletion::Texture(self.texture));
        }
    }
}
