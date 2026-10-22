// flight-lint: allow-file(contract-vocabulary) D17: scene3d-wgpu contracts carry native wgpu values and the Rust fn forms of the TS guard closures
// flight-lint: allow-file(file-structure) D12 entity plumbing sits beside the pipeline declaration
//! The scene3d-wgpu contract types (TS `types/src/Wgpu*Pipeline.ts`, `WgpuScene3DRuntime.ts` and
//! `WgpuScene3DForwardLightList.ts`, owned by scene3d-wgpu) and the per-state package record that
//! replaces the source's module WeakMaps (D5). The mesh-renderer, pass, modifier-snippet, skinning
//! and mesh-upload contracts live in render-wgpu, which types the registry slots (D8 lowest namer).

use std::collections::HashMap;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::Matrix4;
use flight_lighting::{Scene3DForwardLightSelection, Scene3DLightBlock, Scene3DLightsLike};
use flight_materials::{BlendMode, ColorScaleBias, CustomShaderMaterial, Material3DRef};
use flight_meshgeometry::MeshSubset;
use flight_node::NodeRef;
use flight_render_wgpu::{WgpuMeshMaterialRenderer, WgpuRenderState, WgpuSkinningAdapter};
use flight_scene3d::Scene3DAppearanceState;
use flight_texture::Texture;

/// A compiled mesh-material pipeline plus the material bind-group layout its group(2) targets (TS
/// `WgpuMeshPipeline`). The Frame and Draw layouts are shared on the runtime. `has_shadow_group`,
/// `has_pbr_sample_group` and `has_ibl_group` record which group(3)/(4) layouts the pipeline was laid
/// out with, so `begin_wgpu_mesh_draw` binds them; `skinned` marks the HAS_SKIN variant.
#[derive(Clone, Debug)]
pub struct WgpuMeshPipeline {
    pub(crate) runtime: EntityRuntimeSlot,
    pub has_ibl_group: bool,
    pub has_pbr_sample_group: bool,
    pub has_shadow_group: bool,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub pipeline: wgpu::RenderPipeline,
    pub skinned: bool,
}

/// A compiled classic pipeline variant (TS `WgpuClassicPipeline extends WgpuMeshPipeline {}`).
pub type WgpuClassicPipeline = WgpuMeshPipeline;
/// A compiled debug pipeline variant (TS `WgpuDebugPipeline`).
pub type WgpuDebugPipeline = WgpuMeshPipeline;
/// A compiled matcap pipeline variant (TS `WgpuMatcapPipeline`).
pub type WgpuMatcapPipeline = WgpuMeshPipeline;
/// A compiled PBR uber-shader variant (TS `WgpuPbrPipeline`).
pub type WgpuPbrPipeline = WgpuMeshPipeline;
/// A compiled toon pipeline variant (TS `WgpuToonPipeline`).
pub type WgpuToonPipeline = WgpuMeshPipeline;
/// A compiled unlit pipeline variant (TS `WgpuUnlitPipeline`).
pub type WgpuUnlitPipeline = WgpuMeshPipeline;
/// A compiled wireframe pipeline (TS `WgpuWireframePipeline`).
pub type WgpuWireframePipeline = WgpuMeshPipeline;

/// The options object `create_wgpu_mesh_pipeline` takes (TS inline `options` record).
#[derive(Clone, Debug)]
pub struct WgpuMeshPipelineOptions {
    pub blended: Option<bool>,
    pub double_sided: bool,
    pub extra_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub format: wgpu::TextureFormat,
    pub ibl_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub module: wgpu::ShaderModule,
    pub pbr_sample_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub shadow_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub skinned: Option<bool>,
    pub topology: Option<wgpu::PrimitiveTopology>,
}

/// The shared group(0)/group(1) bind-group layouts every family pipeline uses (TS
/// `WgpuScene3DLayouts`).
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuScene3DLayouts {
    pub draw_bind_group_layout: wgpu::BindGroupLayout,
    pub frame_bind_group_layout: wgpu::BindGroupLayout,
}

/// One classic shading model (TS `WgpuClassicLightingModel`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuClassicLightingModel {
    BlinnPhong,
    Lambert,
    Phong,
}

/// The feature flags that select a classic uber-shader variant (TS `WgpuClassicDefineKey`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuClassicDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_color_adjustment: Option<bool>,
    pub has_color_matrix: Option<bool>,
    pub has_alpha_map: Option<bool>,
    pub has_diffuse_map: bool,
    pub has_normal_map: bool,
    pub has_specular_map: bool,
    pub lighting_model: WgpuClassicLightingModel,
}

/// The debug fragment branch (TS `'depth' | 'normal'`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuDebugMode {
    Depth,
    Normal,
}

/// The feature flags that select a debug variant (TS `WgpuDebugDefineKey`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuDebugDefineKey {
    pub has_normal_map: bool,
    pub mode: WgpuDebugMode,
}

/// The feature flags that select a matcap variant (TS `WgpuMatcapDefineKey`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuMatcapDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_matcap: bool,
}

/// The feature flags that select a PBR uber-shader variant (TS `WgpuPbrDefineKey`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WgpuPbrDefineKey {
    pub alpha_mask_enabled: bool,
    pub anisotropy_enabled: bool,
    pub clearcoat_enabled: bool,
    pub double_sided: bool,
    pub has_alpha_map: bool,
    pub has_base_color_map: bool,
    pub has_color_adjustment: Option<bool>,
    pub has_color_matrix: Option<bool>,
    pub has_emissive_map: bool,
    pub has_metallic_roughness_map: bool,
    pub has_normal_map: bool,
    pub has_occlusion_map: bool,
    pub iridescence_enabled: bool,
    pub sheen_enabled: bool,
    pub specular_enabled: bool,
    pub subsurface_enabled: bool,
    pub transmission_enabled: bool,
}

/// The feature flags that select a toon variant (TS `WgpuToonDefineKey`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuToonDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_base_color_map: bool,
    pub has_ramp: bool,
}

/// The feature flags that select an unlit variant (TS `WgpuUnlitDefineKey`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuUnlitDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_color_map: bool,
}

/// The wireframe GPU upload of one mesh geometry (TS `WgpuWireframeUpload`): the shared vertex
/// buffer plus a derived line index buffer.
#[derive(Clone, Debug)]
pub struct WgpuWireframeUpload {
    pub index_format: wgpu::IndexFormat,
    pub line_index_buffer: wgpu::Buffer,
    pub version: u32,
    pub vertex_buffer: wgpu::Buffer,
}

/// The active directional shadow for one state (TS `WgpuScene3DShadow`).
#[derive(Clone, Debug)]
pub struct WgpuScene3DShadow {
    pub depth_texture: wgpu::Texture,
    pub depth_view: wgpu::TextureView,
    pub enabled: bool,
    pub map_height: u32,
    pub map_width: u32,
    pub matrix: Matrix4,
    pub normal_bias_world: f32,
    pub pcf_radius: f32,
    pub shadow_bias: f32,
}

/// The baked image-based-lighting set for one state (TS `WgpuScene3DIbl`).
#[derive(Clone, Debug)]
pub struct WgpuScene3DIbl {
    pub brdf_lut: wgpu::Texture,
    pub brdf_lut_view: wgpu::TextureView,
    pub intensity: f32,
    pub irradiance_cube: wgpu::Texture,
    pub irradiance_cube_view: wgpu::TextureView,
    pub prefiltered_cube: wgpu::Texture,
    pub prefiltered_cube_view: wgpu::TextureView,
    pub prefiltered_mip_count: u32,
}

/// One light block's immutable Frame binding (TS `WgpuScene3DFrameBinding`).
#[derive(Clone, Debug)]
pub struct WgpuScene3DFrameBinding {
    pub bind_group: wgpu::BindGroup,
    pub buffer: wgpu::Buffer,
}

/// A per-subset draw record held in the opaque/blended lists (TS `WgpuScene3DDrawEntry`), pooled on
/// the runtime so rebuilding the two passes does not allocate each frame. `light_block` is the mesh's
/// prepared forward-light block, or `None` for the prepared render list's shared block.
#[derive(Clone)]
pub struct WgpuScene3DDrawEntry {
    pub alpha: f32,
    pub color_matrix: Option<[f32; 20]>,
    pub color_scale_bias: Option<ColorScaleBias>,
    pub depth: f32,
    pub light_block: Option<Ref<Scene3DLightBlock>>,
    pub material: Option<Material3DRef>,
    pub mesh: Option<NodeRef>,
    pub renderer: Option<&'static WgpuMeshMaterialRenderer>,
    pub sort_key: u32,
    pub subset: MeshSubset,
    pub world_matrix: Matrix4,
}

/// One material's per-state GPU binding (TS `WgpuMaterialBinding`): the material uniform buffer, the
/// bind group wiring it and the maps, and the resolved views and sampler(s) it was built from.
#[derive(Clone, Debug)]
pub struct WgpuMaterialBinding {
    pub bind_group: wgpu::BindGroup,
    pub buffer: wgpu::Buffer,
    pub samplers: Option<Vec<wgpu::Sampler>>,
    pub sampler: Option<wgpu::Sampler>,
    pub views: Option<Vec<wgpu::TextureView>>,
}

/// State-owned per-visible-mesh light blocks (TS `WgpuScene3DForwardLightList`). The index contract
/// matches `Scene3DRenderList.visible_meshes`; identical selected tuples share a block.
#[derive(Clone, Debug, Default)]
pub struct WgpuScene3DForwardLightList {
    pub mesh_count: usize,
    pub mesh_light_blocks: Vec<Ref<Scene3DLightBlock>>,
}

/// The opt-in custom-shader ABI diagnostic (TS `customShaderGuard`).
pub type WgpuScene3DCustomShaderGuard =
    fn(&mut WgpuRenderState, &str, &str, &CustomShaderMaterial);

/// The opt-in forward-light truncation diagnostic (TS `forwardLightSelectionGuard`).
pub type WgpuScene3DForwardLightSelectionGuard = fn(&WgpuRenderState, &Scene3DLightsLike);

/// The shaded family's per-material binding (the source's `ShadedBinding`, held in the runtime's
/// `shaded_material_binding_cache`): the uniform buffer and its CPU block, the bind group over the
/// layout it was built for, the primary sampler, and the textures and views bound, in slot order
/// (diffuse, specular, normal, then each modifier's textures).
#[derive(Clone, Debug)]
pub struct WgpuShadedMaterialBinding {
    pub bind_group: wgpu::BindGroup,
    pub buffer: wgpu::Buffer,
    pub data: Vec<f32>,
    pub layout: wgpu::BindGroupLayout,
    pub sampler: wgpu::Sampler,
    pub textures: Vec<Option<Ref<Texture>>>,
    pub views: Vec<wgpu::TextureView>,
}

/// The shaded family's composed modifier plan (the source's `ShadedModifierPlan`): each slot's
/// WGSL, the deduplicated fragment declarations, the ordered stack with the snippet resolved for each
/// entry, the modifier texture count and the modifier uniform float count.
#[derive(Clone)]
pub struct WgpuShadedModifierPlan {
    pub diffuse: String,
    pub effect: String,
    pub emissive: String,
    pub fragment_declarations: String,
    pub normal: String,
    pub ordered_modifiers: Vec<Ref<dyn flight_shading::Modifier>>,
    pub snippets: Vec<Option<&'static flight_render_wgpu::WgpuModifierSnippet>>,
    pub specular: String,
    pub texture_count: u32,
    pub uniform_float_count: u32,
    pub vertex: String,
}

/// One material's cached plan (the source's `CachedShadedPlan`, held in the runtime's
/// `shaded_material_plan_cache`): the define key and modifier stack it was built for, the plan, and
/// the identity of the snippet source it resolved against.
#[derive(Clone)]
pub struct WgpuShadedMaterialPlan {
    pub define_key: String,
    pub modifiers: Vec<Ref<dyn flight_shading::Modifier>>,
    pub plan: WgpuShadedModifierPlan,
    pub registry: usize,
}

/// Where the shaded family resolves modifier compilers (TS `WgpuModifierSnippetSource`): the
/// substrate-neutral modifier registry (definitions only, so it contributes define signatures but no
/// WGSL) or a state's snippet table.
// flight-lint: allow(enum-payload-named) D16 the source union of two borrowed registry objects: each arm carries the registry by reference, not a payload record
#[derive(Clone, Copy)]
pub enum WgpuModifierSnippetSource<'a> {
    Registry(&'a flight_shading::ModifierRegistry),
    Snippets(&'a flight_registry::KindMap<&'static flight_render_wgpu::WgpuModifierSnippet>),
}

/// The base surface flags a shaded material compiles under (TS `getWgpuShadedBaseFlags` result).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WgpuShadedBaseFlags {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_diffuse_map: bool,
    pub has_normal_map: bool,
    pub has_specular_map: bool,
}

/// The forward-light preparation scratch (the source's `preparedByState` WeakMap value).
#[derive(Clone, Debug, Default)]
pub struct WgpuScene3DForwardLightPrepared {
    pub block_count: usize,
    pub blocks: Vec<WgpuScene3DForwardLightPreparedBlock>,
    pub list: WgpuScene3DForwardLightList,
    pub selection: Scene3DForwardLightSelection,
}

/// One prepared forward-light block and the stable light-index tuple it packs.
#[derive(Clone, Debug)]
pub struct WgpuScene3DForwardLightPreparedBlock {
    pub indices: Vec<i32>,
    pub lights: Ref<Scene3DLightBlock>,
}

/// scene3d-wgpu's private per-state record (TS `WgpuScene3DRuntime`), held in render-wgpu's
/// `scene3d_runtime` slot and created lazily by `get_wgpu_scene3d_runtime`. Object-identity WeakMaps
/// key by entity id (materials, geometries) or by the identity of the shared buffer a light block or
/// palette owns. The geometry upload cache is the device tier's `scene_mesh_upload_cache`, shared by
/// every state derived from the device.
pub struct WgpuScene3DRuntime {
    pub active_blend_mode: Option<BlendMode>,
    pub active_blended_run: bool,
    pub active_color_adjustment_run: bool,
    pub active_color_matrix_run: bool,
    pub active_mirrored_run: bool,
    pub active_skinned_run: bool,
    pub active_mesh_pipeline: Option<WgpuMeshPipeline>,
    pub blended_draw_list: Vec<WgpuScene3DDrawEntry>,
    pub blended_pool: Vec<WgpuScene3DDrawEntry>,
    pub draw_bind_group: Option<wgpu::BindGroup>,
    pub draw_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub frame_bind_group: Option<wgpu::BindGroup>,
    pub frame_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub frame_buffer: Option<wgpu::Buffer>,
    pub frame_bindings: HashMap<usize, WgpuScene3DFrameBinding>,
    pub custom_shader_guard: Option<WgpuScene3DCustomShaderGuard>,
    pub forward_light_selection_guard: Option<WgpuScene3DForwardLightSelectionGuard>,
    pub environment_source_cube: Option<wgpu::Texture>,
    pub environment_source_cube_view: Option<wgpu::TextureView>,
    pub ibl: Option<WgpuScene3DIbl>,
    pub ibl_dummy_cube_texture: Option<wgpu::Texture>,
    pub ibl_dummy_cube_view: Option<wgpu::TextureView>,
    pub ibl_dummy_lut_texture: Option<wgpu::Texture>,
    pub ibl_dummy_lut_view: Option<wgpu::TextureView>,
    pub ibl_sample_bind_group: Option<wgpu::BindGroup>,
    pub ibl_sample_cube_view: Option<wgpu::TextureView>,
    pub ibl_sample_layout: Option<wgpu::BindGroupLayout>,
    pub ibl_sampler: Option<wgpu::Sampler>,
    pub ibl_uniform_buffer: Option<wgpu::Buffer>,
    pub material_bind_groups: HashMap<u64, WgpuMaterialBinding>,
    pub pbr_sample_bind_group: Option<wgpu::BindGroup>,
    pub pbr_sample_ibl_cube_view: Option<wgpu::TextureView>,
    pub pbr_sample_layout: Option<wgpu::BindGroupLayout>,
    pub pbr_sample_shadow_view: Option<wgpu::TextureView>,
    pub opaque_draw_list: Vec<WgpuScene3DDrawEntry>,
    pub opaque_pool: Vec<WgpuScene3DDrawEntry>,
    pub pending_draw_offset: u32,
    pub pending_uv_transform: [f32; 9],
    pub pipeline_cache: HashMap<String, WgpuMeshPipeline>,
    pub placeholder_view: Option<wgpu::TextureView>,
    pub shadow: Option<WgpuScene3DShadow>,
    pub shadow_comparison_sampler: Option<wgpu::Sampler>,
    pub shadow_depth_pipeline: Option<wgpu::RenderPipeline>,
    pub shadow_depth_skinned_pipeline: Option<wgpu::RenderPipeline>,
    pub shadow_depth_instanced_pipeline: Option<wgpu::RenderPipeline>,
    pub shadow_dummy_texture: Option<wgpu::Texture>,
    pub shadow_dummy_view: Option<wgpu::TextureView>,
    pub shadow_sample_bind_group: Option<wgpu::BindGroup>,
    pub shadow_sample_layout: Option<wgpu::BindGroupLayout>,
    pub shadow_sample_view: Option<wgpu::TextureView>,
    pub shadow_uniform_buffer: Option<wgpu::Buffer>,
    pub shaded_material_binding_cache: HashMap<u64, WgpuShadedMaterialBinding>,
    pub shaded_material_plan_cache: HashMap<u64, WgpuShadedMaterialPlan>,
    pub skin_draw_bind_group: Option<wgpu::BindGroup>,
    pub skin_draw_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub skin_mesh_draw_bind_group: Option<wgpu::BindGroup>,
    pub skin_mesh_draw_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub skin_arena_frame: Option<u64>,
    pub skin_normal_palette_arena_bases: Option<HashMap<usize, u32>>,
    pub skin_normal_palette_arena_cursor: u32,
    // The palettes written this frame and their bases, replayed into a grown arena (TS: iterating
    // the bases map, whose keys are the palette arrays themselves).
    pub skin_normal_palette_arena_replays: Vec<(Vec<f32>, u32)>,
    pub skin_normal_palette_arena_rows: u32,
    pub skin_normal_palette_texture: Option<wgpu::Texture>,
    pub skin_normal_palette_view: Option<wgpu::TextureView>,
    pub skin_palette_arena_bases: Option<HashMap<usize, u32>>,
    pub skin_palette_arena_cursor: u32,
    pub skin_palette_arena_replays: Vec<(Vec<f32>, u32)>,
    pub skin_palette_arena_rows: u32,
    pub skin_palette_texture: Option<wgpu::Texture>,
    pub skin_palette_view: Option<wgpu::TextureView>,
    pub pending_skin_normal_palette_base: u32,
    pub pending_skin_palette_base: u32,
    pub skinning_adapter: Option<&'static WgpuSkinningAdapter>,
    // Rust-side homes for the source's other module state keyed by state (D5): the appearance
    // revision source world alpha resolves through, the sort-key scratch, the placeholder default
    // material, the scene time, the forward-light scratch and the instanced-record scratch.
    pub appearance: Scene3DAppearanceState,
    pub default_material: Option<Material3DRef>,
    // The shared 48-float PBR MaterialBlock scratch the standard and extension packers write into
    // (TS module `_materialScratch` in wgpuStandardPbrMeshMaterialRenderer).
    pub pbr_material_scratch: [f32; 48],
    pub forward_lights: Option<WgpuScene3DForwardLightPrepared>,
    pub instance_scratch: Vec<f32>,
    pub sort_key_counter: u32,
    pub sort_keys: HashMap<usize, u32>,
    pub time: f32,
    // The wireframe family's per-state line-index uploads keyed by geometry entity id (TS: the
    // module `wireframeUploads` WeakMap keyed by state).
    pub wireframe_uploads: HashMap<u64, WgpuWireframeUpload>,
}

flight_entity::impl_entity!(WgpuMeshPipeline);
