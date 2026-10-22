use std::any::Any;
use std::collections::HashMap;
use std::sync::Arc;

use flight_camera::Camera3D;
use flight_entity::Kind;
use flight_geometry::Matrix4;
use flight_materials::{Material3DRef, PbrExtension};
use flight_meshgeometry::{MeshGeometry, MeshSubset, VertexAttributeLayout};
use flight_render::RenderProxy;
use flight_render_gl::{
    GlRenderState, GlSkinPaletteTexture, GlTextureRenderTarget,
};
use flight_scene3d::Mesh;
use flight_shading::ModifierKind;
use glow::{NativeBuffer, NativeFramebuffer, NativeProgram, NativeTexture, NativeUniformLocation, NativeVertexArray};

pub type GlScene3DColorSpaceGuard = Arc<dyn Fn() + Send + Sync>;
pub type GlScene3DCustomShaderGuard = Arc<dyn Fn(&GlRenderState, NativeProgram, &str) + Send + Sync>;
pub type GlScene3DDeformGuard = Arc<dyn Fn(&Mesh) + Send + Sync>;
pub type GlScene3DForwardLightSelectionGuard = Arc<dyn Fn(&Scene3DLightsLike) + Send + Sync>;
pub type GlScene3DPbrExtensionGuard = Arc<dyn Fn(&[PbrExtension]) + Send + Sync>;

pub struct GlScene3DRuntime {
    pub active_blended_run: bool,
    pub active_color_adjustment_run: bool,
    pub active_color_matrix_run: bool,
    pub active_instanced_run: bool,
    pub active_mesh_program: Option<NativeProgram>,
    pub active_skinned_run: bool,
    pub blended_draw_list: Vec<GlScene3DDrawEntry>,
    pub blended_pool: Vec<GlScene3DDrawEntry>,
    pub color_space_guard: Option<GlScene3DColorSpaceGuard>,
    pub custom_shader_guard: Option<GlScene3DCustomShaderGuard>,
    pub deform_guard: Option<GlScene3DDeformGuard>,
    pub environment_source_cube: Option<NativeTexture>,
    pub environment_source_cube_color_space: String,
    pub environment_source_cube_face_versions: Vec<i32>,
    pub environment_source_revision: i32,
    pub environment_source_texture: Option<u64>,
    pub environment_source_texture_version: i32,
    pub forward_light_selection_guard: Option<GlScene3DForwardLightSelectionGuard>,
    pub ibl: Option<GlScene3DIbl>,
    pub ibl_bake_framebuffer: Option<NativeFramebuffer>,
    pub mesh_skin_feature: Option<GlMeshSkinFeature>,
    pub opaque_draw_list: Vec<GlScene3DDrawEntry>,
    pub opaque_pool: Vec<GlScene3DDrawEntry>,
    pub pbr_extension_guard: Option<GlScene3DPbrExtensionGuard>,
    pub pbr_transmission_scene_color: Option<GlPbrTransmissionSceneColor>,
    pub program_cache: HashMap<String, Box<dyn Any>>,
    pub resource_cleanups: Option<Vec<fn(&GlRenderState)>>,
    pub shadow: Option<GlScene3DShadow>,
    pub shadow_target: Option<GlTextureRenderTarget>,
    pub instance_color_palette: Option<GlSkinPaletteTexture>,
    pub instance_palette: Option<GlSkinPaletteTexture>,
    pub skin_normal_palette: Option<GlSkinPaletteTexture>,
    pub skin_palette: Option<GlSkinPaletteTexture>,
    pub time: f32,
    pub upload_cache: HashMap<u64, GlMeshUpload>,
    pub material_renderers: HashMap<Kind, Arc<dyn GlMeshMaterialRenderer>>,
    pub modifier_snippets: HashMap<Kind, GlModifierSnippet>,
    pub pbr_extension_registrations: HashMap<Kind, GlPbrExtensionRegistration>,
}

pub struct GlScene3DIbl {
    pub brdf_lut: NativeTexture,
    pub irradiance_cube: NativeTexture,
    pub prefiltered_cube: NativeTexture,
}

pub struct GlScene3DShadow {
    pub depth_texture: NativeTexture,
    pub light_view_projection: Matrix4,
    pub shadow_bias: f32,
    pub shadow_map_size: u32,
}

pub struct GlPbrTransmissionSceneColor {
    pub target: GlTextureRenderTarget,
}

pub struct GlMeshProgram {
    pub program: NativeProgram,
    pub model_location: Option<NativeUniformLocation>,
    pub view_projection_location: Option<NativeUniformLocation>,
    pub normal_matrix_location: Option<NativeUniformLocation>,
    pub camera_position_location: Option<NativeUniformLocation>,
    pub object_alpha_location: Option<NativeUniformLocation>,
    pub alpha_is_coverage_location: Option<NativeUniformLocation>,
}

pub struct GlLitProgram {
    pub base: GlMeshProgram,
    pub ambient_color_location: Option<NativeUniformLocation>,
    pub directional_color_location: Option<NativeUniformLocation>,
    pub directional_direction_location: Option<NativeUniformLocation>,
    pub point_light_colors_location: Option<NativeUniformLocation>,
    pub point_light_positions_location: Option<NativeUniformLocation>,
    pub point_light_ranges_location: Option<NativeUniformLocation>,
    pub point_light_count_location: Option<NativeUniformLocation>,
    pub spot_light_colors_location: Option<NativeUniformLocation>,
    pub spot_light_positions_location: Option<NativeUniformLocation>,
    pub spot_light_directions_location: Option<NativeUniformLocation>,
    pub spot_light_ranges_location: Option<NativeUniformLocation>,
    pub spot_light_angles_location: Option<NativeUniformLocation>,
    pub spot_light_count_location: Option<NativeUniformLocation>,
}

pub struct GlClassicProgram {
    pub lit: GlLitProgram,
    pub diffuse_color_location: Option<NativeUniformLocation>,
    pub diffuse_map_location: Option<NativeUniformLocation>,
    pub has_diffuse_map: bool,
}

pub struct GlDebugProgram {
    pub base: GlMeshProgram,
    pub debug_range_location: Option<NativeUniformLocation>,
    pub debug_normal_map_location: Option<NativeUniformLocation>,
}

pub struct GlMatcapProgram {
    pub base: GlMeshProgram,
    pub matcap_location: Option<NativeUniformLocation>,
    pub diffuse_color_location: Option<NativeUniformLocation>,
}

pub struct GlToonProgram {
    pub lit: GlLitProgram,
    pub diffuse_color_location: Option<NativeUniformLocation>,
    pub diffuse_map_location: Option<NativeUniformLocation>,
    pub has_diffuse_map: bool,
    pub ramp_location: Option<NativeUniformLocation>,
    pub has_ramp: bool,
}

pub struct GlUnlitProgram {
    pub base: GlMeshProgram,
    pub diffuse_color_location: Option<NativeUniformLocation>,
    pub diffuse_map_location: Option<NativeUniformLocation>,
    pub has_diffuse_map: bool,
}

pub struct GlWireframeProgram {
    pub base: GlMeshProgram,
    pub wire_color_location: Option<NativeUniformLocation>,
}

pub struct GlMeshUpload {
    pub vertex_array: NativeVertexArray,
    pub vertex_buffer: NativeBuffer,
    pub index_buffer: NativeBuffer,
    pub vertex_count: u32,
    pub index_count: u32,
    pub layout: VertexAttributeLayout,
    pub version: u32,
}

pub struct GlWireframeUpload {
    pub vertex_array: NativeVertexArray,
    pub vertex_buffer: NativeBuffer,
    pub index_buffer: NativeBuffer,
    pub line_count: u32,
    pub version: u32,
}

pub struct GlMeshSkinFeature {
    pub skin_declarations_glsl: String,
}

pub struct GlScene3DDrawEntry {
    pub alpha: f32,
    pub color_matrix: Option<Vec<f32>>,
    pub color_scale_bias: Option<ColorScaleBias>,
    pub depth: f32,
    pub light_block: Scene3DLightBlock,
    pub material: Material3DRef,
    pub mesh_id: u64,
    pub renderer_id: u64,
    pub sort_key: i32,
    pub subset: MeshSubset,
    pub world_matrix: Matrix4,
}

pub struct ColorScaleBias {
    pub r_scale: f32,
    pub g_scale: f32,
    pub b_scale: f32,
    pub a_scale: f32,
    pub r_bias: f32,
    pub g_bias: f32,
    pub b_bias: f32,
    pub a_bias: f32,
}

pub struct Scene3DLightBlock {
    pub ambient_color: [f32; 3],
    pub directional_color: [f32; 3],
    pub directional_direction: [f32; 3],
    pub point_light_count: u32,
    pub point_light_colors: Vec<f32>,
    pub point_light_positions: Vec<f32>,
    pub point_light_ranges: Vec<f32>,
    pub spot_light_count: u32,
    pub spot_light_colors: Vec<f32>,
    pub spot_light_positions: Vec<f32>,
    pub spot_light_directions: Vec<f32>,
    pub spot_light_ranges: Vec<f32>,
    pub spot_light_angles: Vec<f32>,
}

pub struct Scene3DLightsLike {
    pub ambient: Vec<AmbientLight>,
    pub directional: Vec<DirectionalLight>,
    pub point: Vec<PointLight>,
    pub spot: Vec<SpotLight>,
}

pub struct AmbientLight {
    pub color: [f32; 3],
    pub intensity: f32,
}

pub struct DirectionalLight {
    pub color: [f32; 3],
    pub intensity: f32,
    pub direction: [f32; 3],
}

pub struct PointLight {
    pub color: [f32; 3],
    pub intensity: f32,
    pub position: [f32; 3],
    pub range: f32,
}

pub struct SpotLight {
    pub color: [f32; 3],
    pub intensity: f32,
    pub position: [f32; 3],
    pub direction: [f32; 3],
    pub range: f32,
    pub inner_cone_angle: f32,
    pub outer_cone_angle: f32,
}

pub struct GlScene3DForwardLightList {
    pub mesh_count: usize,
    pub mesh_light_blocks: Vec<Scene3DLightBlock>,
}

pub trait GlMeshMaterialRenderer: Send + Sync {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn flight_materials::Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    );
    fn draw(
        &self,
        state: &GlRenderState,
        proxy: &RenderProxy<GlRenderState>,
        geometry: &MeshGeometry,
    );
}

pub struct GlModifierSnippet {
    pub kind: ModifierKind,
    pub vertex_preamble: String,
    pub vertex_body: String,
    pub fragment_preamble: String,
    pub fragment_body: String,
    pub define_key_fn: Option<Arc<dyn Fn(&dyn flight_shading::Modifier) -> String + Send + Sync>>,
}

pub struct GlPbrExtensionRegistration {
    pub kind: Kind,
    pub supported: bool,
    pub texture_unit_cost: u32,
    pub fragment_preamble: String,
    pub fragment_body: String,
    pub define_key_fn: Option<Arc<dyn Fn(&PbrExtension) -> String + Send + Sync>>,
    pub bind_fn: Option<Arc<dyn Fn(&GlRenderState, &PbrExtension, u32) + Send + Sync>>,
}

pub struct GlPbrExtensionIssue {
    pub code: String,
    pub kind: Kind,
}

pub struct GlClassicDefineKey {
    pub has_diffuse_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_instanced: bool,
}

pub struct GlDebugDefineKey {
    pub mode: GlDebugMode,
    pub has_skin: bool,
    pub has_instanced: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlDebugMode {
    Normal,
    NormalMap,
    Uv,
    Range,
}

pub struct GlMatcapDefineKey {
    pub has_matcap_map: bool,
    pub has_normal_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_instanced: bool,
}

pub struct GlPbrDefineKey {
    pub has_base_color_map: bool,
    pub has_metallic_roughness_map: bool,
    pub has_normal_map: bool,
    pub has_occlusion_map: bool,
    pub has_emissive_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_instanced: bool,
    pub has_ibl: bool,
    pub has_shadow: bool,
    pub extension_define_key: String,
    pub modifier_define_key: String,
}

pub struct GlToonDefineKey {
    pub has_diffuse_map: bool,
    pub has_ramp: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_instanced: bool,
}

pub struct GlUnlitDefineKey {
    pub has_diffuse_map: bool,
    pub has_skin: bool,
    pub has_color_adjustment: bool,
    pub has_color_matrix: bool,
    pub has_alpha_mask: bool,
    pub has_instanced: bool,
    pub has_video: bool,
}

pub struct GlShadedDefineKey {
    pub base_flags: u32,
    pub modifier_define_key: String,
}

pub struct GlCustomMaterialShaderSource {
    pub key: String,
    pub vertex_source: String,
    pub fragment_source: String,
}
