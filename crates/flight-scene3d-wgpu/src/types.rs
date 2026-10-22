use std::collections::HashMap;
use std::sync::Arc;

use flight_camera::Camera3D;
use flight_entity::Kind;
use flight_geometry::{Matrix3, Matrix4};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{BlendMode, ColorScaleBias, Material3DRef};
use flight_meshgeometry::{MeshGeometry, MeshSubset};
use flight_render_wgpu::WgpuRenderState;
use flight_shading::ModifierKind;

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
    pub custom_shader_guard: Option<WgpuScene3DCustomShaderGuard>,
    pub draw_bind_group: Option<wgpu::BindGroup>,
    pub draw_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub environment_source_cube: Option<wgpu::Texture>,
    pub environment_source_cube_view: Option<wgpu::TextureView>,
    pub forward_light_selection_guard: Option<WgpuScene3DForwardLightSelectionGuard>,
    pub frame_bind_group: Option<wgpu::BindGroup>,
    pub frame_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub frame_buffer: Option<wgpu::Buffer>,
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
    pub material_renderers: HashMap<Kind, Arc<dyn WgpuMeshMaterialRenderer>>,
    pub modifier_snippets: HashMap<Kind, WgpuModifierSnippet>,
    pub opaque_draw_list: Vec<WgpuScene3DDrawEntry>,
    pub opaque_pool: Vec<WgpuScene3DDrawEntry>,
    pub pbr_sample_bind_group: Option<wgpu::BindGroup>,
    pub pbr_sample_ibl_cube_view: Option<wgpu::TextureView>,
    pub pbr_sample_layout: Option<wgpu::BindGroupLayout>,
    pub pbr_sample_shadow_view: Option<wgpu::TextureView>,
    pub pending_draw_offset: u64,
    pub pending_skin_normal_palette_base: u32,
    pub pending_skin_palette_base: u32,
    pub pending_uv_transform: Vec<f32>,
    pub pipeline_cache: HashMap<String, WgpuMeshPipeline>,
    pub placeholder_view: Option<wgpu::TextureView>,
    pub shadow: Option<WgpuScene3DShadow>,
    pub shadow_comparison_sampler: Option<wgpu::Sampler>,
    pub shadow_depth_pipeline: Option<wgpu::RenderPipeline>,
    pub shadow_depth_instanced_pipeline: Option<wgpu::RenderPipeline>,
    pub shadow_depth_skinned_pipeline: Option<wgpu::RenderPipeline>,
    pub shadow_dummy_texture: Option<wgpu::Texture>,
    pub shadow_dummy_view: Option<wgpu::TextureView>,
    pub shadow_sample_bind_group: Option<wgpu::BindGroup>,
    pub shadow_sample_layout: Option<wgpu::BindGroupLayout>,
    pub shadow_sample_view: Option<wgpu::TextureView>,
    pub shadow_uniform_buffer: Option<wgpu::Buffer>,
    pub shaded_material_binding_cache: HashMap<u64, WgpuMaterialBinding>,
    pub skin_draw_bind_group: Option<wgpu::BindGroup>,
    pub skin_draw_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub skin_mesh_draw_bind_group: Option<wgpu::BindGroup>,
    pub skin_mesh_draw_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub skin_normal_palette_texture: Option<wgpu::Texture>,
    pub skin_normal_palette_view: Option<wgpu::TextureView>,
    pub skin_arena_frame: Option<u64>,
    pub skin_normal_palette_arena_bases: Option<Vec<u32>>,
    pub skin_normal_palette_arena_cursor: u32,
    pub skin_normal_palette_arena_rows: u32,
    pub skin_palette_arena_bases: Option<Vec<u32>>,
    pub skin_palette_arena_cursor: u32,
    pub skin_palette_arena_rows: u32,
    pub skin_palette_texture: Option<wgpu::Texture>,
    pub skin_palette_view: Option<wgpu::TextureView>,
    pub skinning_adapter: Option<Box<dyn WgpuSkinningAdapter>>,
    pub time: f32,
    pub upload_cache: HashMap<u64, WgpuMeshUpload>,
}

pub struct WgpuScene3DIbl {
    pub brdf_lut_view: wgpu::TextureView,
    pub intensity: f32,
    pub irradiance_cube_view: wgpu::TextureView,
    pub prefiltered_cube_view: wgpu::TextureView,
    pub prefiltered_mip_count: u32,
}

pub struct WgpuScene3DShadow {
    pub depth_view: wgpu::TextureView,
    pub enabled: bool,
    pub matrix: Matrix4,
    pub normal_bias_world: f32,
    pub pcf_radius: f32,
    pub shadow_bias: f32,
}

pub type WgpuScene3DCustomShaderGuard =
    Arc<dyn Fn(&WgpuRenderState, &wgpu::ShaderModule, &str) + Send + Sync>;
pub type WgpuScene3DForwardLightSelectionGuard =
    Arc<dyn Fn(&Scene3DLightBlock) + Send + Sync>;

pub struct WgpuMeshPipeline {
    pub has_ibl_group: bool,
    pub has_pbr_sample_group: bool,
    pub has_shadow_group: bool,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub pipeline: wgpu::RenderPipeline,
    pub skinned: bool,
}

pub struct WgpuMeshUpload {
    pub index_buffer: Option<wgpu::Buffer>,
    pub index_format: Option<wgpu::IndexFormat>,
    pub vertex_buffer: wgpu::Buffer,
    pub vertex_count: u32,
    pub version: u32,
}

pub struct WgpuWireframeUpload {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub line_count: u32,
    pub version: u32,
}

pub struct WgpuScene3DDrawEntry {
    pub alpha: f32,
    pub blend_mode: Option<BlendMode>,
    pub color_matrix: Option<Vec<f32>>,
    pub color_scale_bias: Option<ColorScaleBias>,
    pub depth: f32,
    pub instance_count: Option<u32>,
    pub instance_matrices: Option<Vec<f32>>,
    pub joint_matrices: Option<Vec<f32>>,
    pub light_block: Scene3DLightBlock,
    pub material: Material3DRef,
    pub mesh_id: u64,
    pub mirrored: bool,
    pub normal_matrices: Option<Vec<f32>>,
    pub renderer_id: u64,
    pub sort_key: i32,
    pub subset: MeshSubset,
    pub world_matrix: Matrix4,
}

pub struct WgpuScene3DLayouts {
    pub draw_bind_group_layout: wgpu::BindGroupLayout,
    pub frame_bind_group_layout: wgpu::BindGroupLayout,
}

pub struct WgpuMaterialBinding {
    pub bind_group: wgpu::BindGroup,
    pub buffer: wgpu::Buffer,
    pub sampler: Option<wgpu::Sampler>,
    pub samplers: Option<Vec<wgpu::Sampler>>,
    pub views: Option<Vec<wgpu::TextureView>>,
}

pub struct WgpuMeshInstanceBufferSlot {
    pub buffer: Option<wgpu::Buffer>,
    pub capacity: u64,
}

pub trait WgpuMeshMaterialRenderer: Send + Sync {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn flight_materials::Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    );
    fn draw(
        &self,
        state: &WgpuRenderState,
        proxy: &WgpuScene3DRenderProxy,
        geometry: &MeshGeometry,
    );
}

pub struct WgpuScene3DRenderProxy {
    pub alpha: Option<f32>,
    pub color_matrix: Option<Vec<f32>>,
    pub color_scale_bias: Option<ColorScaleBias>,
    pub instance_count: Option<u32>,
    pub instance_matrices: Option<Vec<f32>>,
    pub joint_matrices: Option<Vec<f32>>,
    pub material: Option<Material3DRef>,
    pub normal_matrices: Option<Vec<f32>>,
    pub normal_matrix: Matrix3,
    pub subset: MeshSubset,
    pub world_matrix: Matrix4,
}

pub trait WgpuSkinningAdapter: Send + Sync {
    fn extend_mesh_prelude(&self, source: &str) -> String;
    fn get_mesh_draw_bind_group(
        &self,
        state: &WgpuRenderState,
        joint_matrices: &[f32],
        normal_matrices: &[f32],
    ) -> Option<wgpu::BindGroup>;
    fn get_mesh_draw_layout(&self, state: &WgpuRenderState) -> wgpu::BindGroupLayout;
    fn vertex_buffer_layouts(&self) -> Vec<wgpu::VertexBufferLayout<'static>>;
}

pub struct WgpuModifierSnippet {
    pub kind: ModifierKind,
    pub vertex_preamble: String,
    pub vertex_body: String,
    pub fragment_preamble: String,
    pub fragment_body: String,
    pub define_key_fn:
        Option<Arc<dyn Fn(&dyn flight_shading::Modifier) -> String + Send + Sync>>,
}

pub struct WgpuCustomMaterialAbi {
    pub key: String,
    pub vertex_source: String,
    pub fragment_source: String,
}

pub struct WgpuColorAdjustmentMaterialFeature {
    pub fragment_shader_chunk: String,
    pub matrix_fragment_shader_chunk: String,
}

pub struct WgpuClassicDefineKey {
    pub has_diffuse_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
}

pub struct WgpuDebugDefineKey {
    pub mode: WgpuDebugMode,
    pub has_skin: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuDebugMode {
    Normal,
    NormalMap,
    Uv,
    Range,
}

pub struct WgpuMatcapDefineKey {
    pub has_matcap_map: bool,
    pub has_normal_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
}

pub struct WgpuPbrDefineKey {
    pub has_base_color_map: bool,
    pub has_metallic_roughness_map: bool,
    pub has_normal_map: bool,
    pub has_occlusion_map: bool,
    pub has_emissive_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_ibl: bool,
    pub has_shadow: bool,
    pub modifier_define_key: String,
}

pub struct WgpuToonDefineKey {
    pub has_diffuse_map: bool,
    pub has_ramp: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_shadow: bool,
}

pub struct WgpuUnlitDefineKey {
    pub has_diffuse_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_video: bool,
}

pub struct WgpuShadedDefineKey {
    pub base_flags: u32,
    pub modifier_define_key: String,
}

pub struct WgpuWireframeDefineKey {
    pub has_skin: bool,
}
