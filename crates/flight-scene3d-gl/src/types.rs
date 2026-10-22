// flight-lint: allow-file(contract-vocabulary, file-structure, sugar-delegates) D17 scene3d-gl records hold glow native handles, thread-bound render-gl state and composed program families

use std::any::Any;
use std::cell::Cell;
use std::collections::HashMap;
use std::ops::Deref;
use std::rc::Rc;

use flight_entity::{Kind, Ref};
use flight_geometry::Matrix4;
use flight_lighting::{Scene3DLightBlock, Scene3DLightsLike};
use flight_materials::{Material3DRef, PbrExtension, PbrUvSet};
use flight_meshgeometry::MeshSubset;
use flight_node::NodeRef;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{
    GlMeshMaterialRenderer, GlRenderState, GlSkinPaletteTexture, GlTextureRenderTarget,
};
use flight_scene3d::{Mesh, Scene3DAppearanceState};
use flight_texture::TextureColorSpace;
use glow::{
    NativeBuffer, NativeFramebuffer, NativeProgram, NativeTexture, NativeUniformLocation,
    NativeVertexArray,
};

/// A lazily resolved uniform location cached on a program (TS `loc?: WebGLUniformLocation | null`):
/// `None` = not yet resolved, `Some(None)` = the program omits the uniform, `Some(Some(loc))` =
/// present.
pub type GlLazyUniformLocation = Cell<Option<Option<NativeUniformLocation>>>;

/// The minimal bind→draw handoff every mesh-material family shares (TS `GlMeshProgram`). A family
/// program composes it (TS `extends GlMeshProgram`) and adds its own material uniform locations.
#[derive(Debug)]
pub struct GlMeshProgram {
    pub loc_color_scale: GlLazyUniformLocation,
    pub loc_color_bias: GlLazyUniformLocation,
    pub loc_color_matrix0: GlLazyUniformLocation,
    pub loc_color_matrix1: GlLazyUniformLocation,
    pub loc_color_matrix2: GlLazyUniformLocation,
    pub loc_color_matrix3: GlLazyUniformLocation,
    pub loc_color_matrix_offset: GlLazyUniformLocation,
    pub loc_object_alpha: GlLazyUniformLocation,
    pub loc_alpha_is_coverage: GlLazyUniformLocation,
    pub loc_joint_texture: GlLazyUniformLocation,
    pub loc_instance_palette: GlLazyUniformLocation,
    pub loc_instance_color_palette: GlLazyUniformLocation,
    pub loc_joint_normal_texture: GlLazyUniformLocation,
    pub loc_model: Option<NativeUniformLocation>,
    pub loc_normal_matrix: Option<NativeUniformLocation>,
    pub loc_uv_transform: GlLazyUniformLocation,
    pub loc_view_projection: Option<NativeUniformLocation>,
    pub program: NativeProgram,
}

/// Any compiled mesh-material family program (TS: an interface extending `GlMeshProgram`). The
/// program cache and the active bind→draw slot hold families behind this seam; a family narrows
/// back to its concrete record through `Any`.
pub trait GlMeshProgramFamily: Any {
    fn mesh_program(&self) -> &GlMeshProgram;
}

/// A shared compiled family program (TS `GlMeshProgram` object identity).
pub type GlMeshProgramRef = Rc<dyn GlMeshProgramFamily>;

/// The shared base for every lit family (TS `GlLitProgram extends GlMeshProgram`): the packed
/// forward-light, camera, shadow and IBL uniform locations.
#[derive(Debug)]
pub struct GlLitProgram {
    pub mesh: GlMeshProgram,
    pub loc_ambient_count: Option<NativeUniformLocation>,
    pub loc_ambient_radiance: Option<NativeUniformLocation>,
    pub loc_camera_position: Option<NativeUniformLocation>,
    pub loc_directional: Option<NativeUniformLocation>,
    pub loc_directional_count: Option<NativeUniformLocation>,
    pub loc_directional_radiance: Option<NativeUniformLocation>,
    pub loc_hemisphere_count: Option<NativeUniformLocation>,
    pub loc_hemisphere_lights: Option<NativeUniformLocation>,
    pub loc_ibl_brdf: Option<NativeUniformLocation>,
    pub loc_ibl_enabled: Option<NativeUniformLocation>,
    pub loc_ibl_intensity: Option<NativeUniformLocation>,
    pub loc_ibl_irradiance: Option<NativeUniformLocation>,
    pub loc_ibl_max_mip: Option<NativeUniformLocation>,
    pub loc_ibl_prefiltered: Option<NativeUniformLocation>,
    pub loc_point_count: Option<NativeUniformLocation>,
    pub loc_point_lights: Option<NativeUniformLocation>,
    pub loc_shadow_bias: Option<NativeUniformLocation>,
    pub loc_shadow_enabled: Option<NativeUniformLocation>,
    pub loc_shadow_map: Option<NativeUniformLocation>,
    pub loc_shadow_matrix: Option<NativeUniformLocation>,
    pub loc_shadow_normal_bias_world: Option<NativeUniformLocation>,
    pub loc_shadow_pcf_radius: Option<NativeUniformLocation>,
    pub loc_spot_count: Option<NativeUniformLocation>,
    pub loc_spot_lights: Option<NativeUniformLocation>,
}

/// TS `GlClassicLightingModel`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum GlClassicLightingModel {
    BlinnPhong,
    #[default]
    Lambert,
    Phong,
}

/// TS `GlClassicDefineKey`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlClassicDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_color_adjustment: Option<bool>,
    pub has_color_matrix: Option<bool>,
    pub has_alpha_map: bool,
    pub has_diffuse_map: bool,
    pub has_instances: Option<bool>,
    pub has_normal_map: bool,
    pub has_skin: Option<bool>,
    pub has_specular_map: bool,
    pub has_uv_transform: bool,
    pub lighting_model: GlClassicLightingModel,
}

/// TS `GlClassicProgram extends GlLitProgram`.
#[derive(Debug)]
pub struct GlClassicProgram {
    pub lit: GlLitProgram,
    pub loc_alpha_cutoff: Option<NativeUniformLocation>,
    pub loc_alpha_map: Option<NativeUniformLocation>,
    pub loc_diffuse: Option<NativeUniformLocation>,
    pub loc_diffuse_map: Option<NativeUniformLocation>,
    pub loc_normal_map: Option<NativeUniformLocation>,
    pub loc_normal_scale: Option<NativeUniformLocation>,
    pub loc_shininess: Option<NativeUniformLocation>,
    pub loc_specular: Option<NativeUniformLocation>,
    pub loc_specular_map: Option<NativeUniformLocation>,
}

/// TS `GlDebugDefineKey.mode`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum GlDebugMode {
    #[default]
    Depth,
    Normal,
}

/// TS `GlDebugDefineKey`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlDebugDefineKey {
    pub has_instances: Option<bool>,
    pub has_normal_map: bool,
    pub has_skin: Option<bool>,
    pub mode: GlDebugMode,
}

/// TS `GlDebugProgram extends GlMeshProgram`.
#[derive(Debug)]
pub struct GlDebugProgram {
    pub mesh: GlMeshProgram,
    pub loc_far: Option<NativeUniformLocation>,
    pub loc_near: Option<NativeUniformLocation>,
    pub loc_normal_map: Option<NativeUniformLocation>,
    pub loc_normal_scale: Option<NativeUniformLocation>,
    pub loc_view: Option<NativeUniformLocation>,
}

/// TS `GlMatcapDefineKey`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlMatcapDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_instances: Option<bool>,
    pub has_matcap: bool,
    pub has_skin: Option<bool>,
}

/// TS `GlMatcapProgram extends GlMeshProgram`.
#[derive(Debug)]
pub struct GlMatcapProgram {
    pub mesh: GlMeshProgram,
    pub loc_alpha_cutoff: Option<NativeUniformLocation>,
    pub loc_matcap: Option<NativeUniformLocation>,
    pub loc_tint: Option<NativeUniformLocation>,
    pub loc_view: Option<NativeUniformLocation>,
}

/// TS `GlPbrDefineKey`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlPbrDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_alpha_map: bool,
    pub has_base_color_map: bool,
    pub has_color_adjustment: Option<bool>,
    pub has_color_matrix: Option<bool>,
    pub has_emissive_map: bool,
    pub has_instances: Option<bool>,
    pub has_metallic_roughness_map: bool,
    pub has_normal_map: bool,
    pub has_occlusion_map: bool,
    pub has_skin: Option<bool>,
    pub has_uv_transform: bool,
}

/// TS `GlPbrProgram extends GlLitProgram`.
#[derive(Debug)]
pub struct GlPbrProgram {
    pub lit: GlLitProgram,
    pub loc_alpha_cutoff: Option<NativeUniformLocation>,
    pub loc_alpha_map: Option<NativeUniformLocation>,
    pub loc_base_color: Option<NativeUniformLocation>,
    pub loc_base_color_map: Option<NativeUniformLocation>,
    pub loc_emissive: Option<NativeUniformLocation>,
    pub loc_emissive_map: Option<NativeUniformLocation>,
    pub loc_emissive_strength: Option<NativeUniformLocation>,
    pub loc_metallic: Option<NativeUniformLocation>,
    pub loc_metallic_roughness_map: Option<NativeUniformLocation>,
    pub loc_normal_map: Option<NativeUniformLocation>,
    pub loc_normal_scale: Option<NativeUniformLocation>,
    pub loc_occlusion_map: Option<NativeUniformLocation>,
    pub loc_occlusion_strength: Option<NativeUniformLocation>,
    pub loc_roughness: Option<NativeUniformLocation>,
}

/// TS `GlShadedDefineKey`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlShadedDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_color_adjustment: Option<bool>,
    pub has_color_matrix: Option<bool>,
    pub has_diffuse_map: bool,
    pub has_instances: Option<bool>,
    pub has_normal_map: bool,
    pub has_skin: Option<bool>,
    pub has_specular_map: bool,
    pub has_uv_transform: bool,
}

/// TS `GlShadedProgram extends GlLitProgram`.
#[derive(Debug)]
pub struct GlShadedProgram {
    pub lit: GlLitProgram,
    pub loc_alpha_cutoff: Option<NativeUniformLocation>,
    pub loc_diffuse: Option<NativeUniformLocation>,
    pub loc_diffuse_map: Option<NativeUniformLocation>,
    pub loc_normal_map: Option<NativeUniformLocation>,
    pub loc_normal_scale: Option<NativeUniformLocation>,
    pub loc_shininess: Option<NativeUniformLocation>,
    pub loc_specular: Option<NativeUniformLocation>,
    pub loc_specular_map: Option<NativeUniformLocation>,
    pub loc_time: Option<NativeUniformLocation>,
}

/// TS `GlToonDefineKey`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlToonDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_base_color_map: bool,
    pub has_instances: Option<bool>,
    pub has_ramp: bool,
    pub has_skin: Option<bool>,
    pub has_uv_transform: bool,
}

/// TS `GlToonProgram extends GlLitProgram`.
#[derive(Debug)]
pub struct GlToonProgram {
    pub lit: GlLitProgram,
    pub loc_alpha_cutoff: Option<NativeUniformLocation>,
    pub loc_base_color: Option<NativeUniformLocation>,
    pub loc_base_color_map: Option<NativeUniformLocation>,
    pub loc_ramp: Option<NativeUniformLocation>,
    pub loc_steps: Option<NativeUniformLocation>,
}

/// TS `GlUnlitDefineKey`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlUnlitDefineKey {
    pub alpha_mask_enabled: bool,
    pub has_color_map: bool,
    pub has_instances: Option<bool>,
    pub has_skin: Option<bool>,
    pub has_uv_transform: bool,
    pub vertex_color: bool,
}

/// TS `GlUnlitProgram extends GlMeshProgram`.
#[derive(Debug)]
pub struct GlUnlitProgram {
    pub mesh: GlMeshProgram,
    pub loc_alpha_cutoff: Option<NativeUniformLocation>,
    pub loc_color: Option<NativeUniformLocation>,
    pub loc_color_map: Option<NativeUniformLocation>,
    pub loc_intensity: Option<NativeUniformLocation>,
}

/// TS `GlWireframeProgram extends GlMeshProgram`.
#[derive(Debug)]
pub struct GlWireframeProgram {
    pub mesh: GlMeshProgram,
    pub loc_alpha_cutoff: Option<NativeUniformLocation>,
    pub loc_color: Option<NativeUniformLocation>,
}

/// The line-index upload of one geometry for the wireframe family (TS `GlWireframeUpload`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlWireframeUpload {
    pub index_type: u32,
    pub line_index_buffer: NativeBuffer,
    pub vao: NativeVertexArray,
    pub version: i64,
}

/// The GPU upload of one MeshGeometry (TS `GlMeshUpload`): a VAO over the interleaved vertex buffer
/// and optional index buffer, the element type/count, the effective primitive mode, and the geometry
/// `version` uploaded (-1 before the first upload).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlMeshUpload {
    pub index_buffer: Option<NativeBuffer>,
    pub index_count: u32,
    pub index_type: u32,
    pub primitive_mode: u32,
    pub skin_bind_uploaded: Option<bool>,
    pub vao: NativeVertexArray,
    pub version: i64,
    pub vertex_buffer: NativeBuffer,
}

/// The directional shadow resource for a state (TS `GlScene3DShadow`).
#[derive(Clone, Debug, PartialEq)]
pub struct GlScene3DShadow {
    pub enabled: bool,
    pub matrix: Matrix4,
    pub normal_bias_world: f32,
    pub pcf_radius: f32,
    pub shadow_bias: f32,
    pub texture: NativeTexture,
}

/// The baked image-based-lighting set for a state (TS `GlScene3DIbl`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GlScene3DIbl {
    pub brdf_lut: NativeTexture,
    pub environment_source_revision: u32,
    pub intensity: f32,
    pub irradiance_cube: NativeTexture,
    pub prefiltered_cube: NativeTexture,
    pub prefiltered_mip_count: u32,
}

/// Caller-owned, resolved opaque-scene color sampled by GL transmission (TS
/// `GlPbrTransmissionSceneColor`); scene3d-gl retains only this non-owning view.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlPbrTransmissionSceneColor {
    pub height: u32,
    pub mip_level_count: u32,
    pub texture: NativeTexture,
    pub width: u32,
}

/// The opt-in GPU mesh-skinning capability (TS `GlMeshSkinFeature`), installed by
/// `register_gl_mesh_skinning`: the forward and shadow palette binders plus the vertex GLSL the
/// HAS_SKIN variant needs.
pub struct GlMeshSkinFeature {
    pub bind_mesh_skin_palette: fn(&mut GlRenderState, &GlMeshProgram, &Scene3DRenderProxy) -> bool,
    pub bind_shadow_skin_palette: fn(&mut GlRenderState, &[f32]),
    pub vertex_declarations_glsl: &'static str,
}

/// The prepared per-visible-mesh forward-light blocks (TS `GlScene3DForwardLightList`).
/// `mesh_light_blocks[i]` belongs to the render list's `visible_meshes[i]`; identical selected-light
/// tuples share one block instance so material binds stay batchable.
#[derive(Clone, Debug, Default)]
pub struct GlScene3DForwardLightList {
    pub mesh_count: usize,
    pub mesh_light_blocks: Vec<Rc<Scene3DLightBlock>>,
}

/// One per-subset draw record in the two-pass draw lists (TS `GlScene3DDrawEntry`), pooled on the
/// scene runtime.
#[derive(Clone)]
pub struct GlScene3DDrawEntry {
    pub alpha: f32,
    pub color_matrix: Option<[f32; 20]>,
    pub color_scale_bias: Option<flight_materials::ColorScaleBias>,
    pub depth: f32,
    pub light_block: Option<Rc<Scene3DLightBlock>>,
    pub material: Option<Material3DRef>,
    pub mesh: Option<NodeRef>,
    pub renderer: Option<&'static GlMeshMaterialRenderer>,
    pub sort_key: u32,
    pub subset: MeshSubset,
    pub world_matrix: Matrix4,
}

/// TS `GlEnvironmentCaptureOptions`.
#[derive(Clone, Default)]
pub struct GlEnvironmentCaptureOptions {
    pub environment: Option<Ref<flight_lighting::Environment>>,
    pub exclude_node: Option<NodeRef>,
    pub far: Option<f32>,
    pub near: Option<f32>,
}

/// TS `GlPbrExtensionIssueCode`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlPbrExtensionIssueCode {
    DuplicateKind,
    FramebufferFeedback,
    MissingRegistration,
    TextureUnitExhaustion,
    UnsupportedExtension,
}

/// Plain-data explanation for a silent Extended PBR skip (TS `GlPbrExtensionIssue`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlPbrExtensionIssue {
    pub code: GlPbrExtensionIssueCode,
    pub kind: Kind,
}

/// What a geometry's vertex layout can serve when a material's maps ask for a UV set (TS
/// `MeshGeometryUvSetExplanation`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MeshGeometryUvSetExplanation {
    pub available_uv_sets: Vec<PbrUvSet>,
    pub requested_uv_sets: Vec<PbrUvSet>,
    pub samples_at_origin: bool,
    pub unserved_uv_sets: Vec<PbrUvSet>,
}

/// Opt-in scene guard slots (TS optional `GlScene3DRuntime` callbacks). Each receives the state so
/// it can reach the state's guard log (D5: no logging singleton).
pub type GlScene3DColorSpaceGuard = fn(&GlRenderState);
pub type GlScene3DCustomShaderGuard = fn(&GlRenderState, NativeProgram, &str);
pub type GlScene3DDeformGuard = fn(&GlRenderState, &Mesh);
pub type GlScene3DForwardLightSelectionGuard = fn(&GlRenderState, &Scene3DLightsLike);
pub type GlScene3DPbrExtensionGuard = fn(&mut GlRenderState, &[Ref<PbrExtension>]);

/// A teardown a lazily created optional resource registers (TS `resourceCleanups` entry).
pub type GlScene3DResourceCleanup = fn(&mut GlRenderState);

/// scene3d-gl's per-`GlRenderState` private state (TS `GlScene3DRuntime`), held in render-gl's
/// opaque `scene3d_runtime` slot (D5). The geometry upload caches live on the context tier
/// (`GlScene3DContextRuntime`) so derived states share them, as TS `sceneMeshUploadCache` does.
pub struct GlScene3DRuntime {
    pub active_blended_run: bool,
    pub active_color_adjustment_run: bool,
    pub active_color_matrix_run: bool,
    pub active_instanced_run: bool,
    pub active_mesh_program: Option<GlMeshProgramRef>,
    pub active_skinned_run: bool,
    /// The explicit world-alpha revision source `get_node3d_world_alpha` advances (D5; TS module
    /// counter in scene3d).
    pub appearance: Scene3DAppearanceState,
    pub blended_draw_list: Vec<GlScene3DDrawEntry>,
    pub blended_pool: Vec<GlScene3DDrawEntry>,
    pub color_space_guard: Option<GlScene3DColorSpaceGuard>,
    pub custom_shader_guard: Option<GlScene3DCustomShaderGuard>,
    /// Custom-shader programs the guard already introspected (TS module WeakSet `_checkedPrograms`).
    pub custom_shader_checked_programs: std::collections::HashSet<NativeProgram>,
    /// The placeholder material a subset with no concrete material draws with (TS module const
    /// `DEFAULT_MATERIAL`: StandardMaterialKind with createMaterial3D defaults), one identity per
    /// state so it batches across frames.
    pub default_material: Material3DRef,
    pub deform_guard: Option<GlScene3DDeformGuard>,
    /// The reusable face camera for environment captures (TS module WeakMap
    /// `glEnvironmentCaptureCameras` keyed by state).
    pub environment_capture_camera: Option<flight_camera::Camera3D>,
    /// The skybox program, VAO and vertex buffer (TS module WeakMap `_skyboxes` keyed by state).
    pub(crate) environment_skybox: Option<crate::gl_environment_skybox::GlSkybox>,
    pub environment_source_cube: Option<NativeTexture>,
    pub environment_source_cube_color_space: TextureColorSpace,
    /// Per-face payload versions the cached cube was built from (-1 = not tracked, TS `-1`).
    pub environment_source_cube_face_versions: Vec<i64>,
    /// Entity ids of the face sources the cached cube was built from (TS `trackedCube.sources[face]`
    /// identity, D15).
    pub environment_source_cube_face_sources: Vec<u64>,
    pub environment_source_revision: u32,
    /// Entity id of the source Texture the cached GL cubemap was derived from (D15 identity key).
    pub environment_source_texture: Option<u64>,
    pub environment_source_texture_version: i64,
    pub forward_light_selection_guard: Option<GlScene3DForwardLightSelectionGuard>,
    pub ibl: Option<GlScene3DIbl>,
    pub ibl_bake_framebuffer: Option<NativeFramebuffer>,
    /// The IBL bake pass programs in creation order (TS module WeakMap `_bakePrograms` keyed by state).
    pub(crate) ibl_bake_programs: Option<Vec<(String, crate::gl_environment_ibl_bake::GlBakeProgram)>>,
    /// The 1x1 placeholder cube + 2D textures bound to the IBL units when no environment is baked (TS
    /// module WeakMap `_iblPlaceholders` keyed by state).
    pub ibl_placeholders: Option<GlIblPlaceholders>,
    pub instance_color_palette: Option<GlSkinPaletteTexture>,
    pub instance_palette: Option<GlSkinPaletteTexture>,
    /// The prepared list's light block for the current frame, kept while unchanged (TS: the reused
    /// render-list block identity).
    pub list_light_block: Option<Rc<Scene3DLightBlock>>,
    pub mesh_skin_feature: Option<&'static GlMeshSkinFeature>,
    pub opaque_draw_list: Vec<GlScene3DDrawEntry>,
    /// The 3D particle billboard shader (TS module WeakMap `shaderCache` keyed by state).
    pub(crate) particle_emitter3d_shader: Option<crate::gl_particle_emitter3d::GlParticle3DShader>,
    pub opaque_pool: Vec<GlScene3DDrawEntry>,
    pub pbr_extension_guard: Option<GlScene3DPbrExtensionGuard>,
    /// prepare_gl_scene3d_forward_lights's state-owned scratch (TS module WeakMap
    /// `preparedGlScene3DForwardLights` keyed by state).
    pub prepared_forward_lights: Option<PreparedGlScene3DForwardLights>,
    pub pbr_transmission_scene_color: Option<GlPbrTransmissionSceneColor>,
    pub program_cache: HashMap<String, GlMeshProgramRef>,
    pub resource_cleanups: Option<Vec<GlScene3DResourceCleanup>>,
    pub shadow: Option<GlScene3DShadow>,
    pub shadow_target: Option<GlTextureRenderTarget>,
    pub skin_normal_palette: Option<GlSkinPaletteTexture>,
    pub skin_palette: Option<GlSkinPaletteTexture>,
    pub time: f32,
    /// The light block (held, so its identity cannot be reused) and version last uploaded into each
    /// lit program's default uniforms (TS module WeakMaps `_uploadedLightBlock` /
    /// `_uploadedLightVersion` keyed by program). An entry is dropped when its program is deleted, so a
    /// recycled GL program name never inherits a stale upload.
    pub uploaded_light_blocks: HashMap<NativeProgram, (Rc<Scene3DLightBlock>, u32)>,
}

/// One packed punctual-light block and the stable light-index tuple it was packed from (TS
/// `PreparedForwardLightBlock`).
#[derive(Clone, Debug, Default)]
pub struct PreparedForwardLightBlock {
    pub indices: Vec<i32>,
    pub lights: Rc<Scene3DLightBlock>,
}

/// prepare_gl_scene3d_forward_lights's reusable per-state scratch (TS `PreparedGlScene3DForwardLights`).
/// The source's `list` field is the caller-owned out (D24), so it is not held here.
#[derive(Clone, Debug, Default)]
pub struct PreparedGlScene3DForwardLights {
    pub block_count: usize,
    pub blocks: Vec<PreparedForwardLightBlock>,
    pub selection: flight_lighting::Scene3DForwardLightSelection,
}

/// TS `GlIblPlaceholders`: the correctly-typed placeholder textures for the PBR IBL samplers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlIblPlaceholders {
    pub cube: NativeTexture,
    pub lut: NativeTexture,
}

/// scene3d-gl's per-context record (TS `GlContextRuntime.sceneMeshUploadCache` and the wireframe
/// upload WeakMap), keyed by geometry entity id (D15) and shared by every state on the context.
#[derive(Default)]
pub struct GlScene3DContextRuntime {
    pub upload_cache: HashMap<u64, GlMeshUpload>,
    pub wireframe_upload_cache: HashMap<u64, GlWireframeUpload>,
}

impl GlMeshProgramFamily for GlMeshProgram {
    fn mesh_program(&self) -> &GlMeshProgram {
        return self;
    }
}

impl GlMeshProgramFamily for GlLitProgram {
    fn mesh_program(&self) -> &GlMeshProgram {
        return &self.mesh;
    }
}

impl Deref for GlLitProgram {
    type Target = GlMeshProgram;

    fn deref(&self) -> &GlMeshProgram {
        return &self.mesh;
    }
}

macro_rules! impl_gl_lit_family {
    ($t:ty) => {
        impl GlMeshProgramFamily for $t {
            fn mesh_program(&self) -> &GlMeshProgram {
                return &self.lit.mesh;
            }
        }

        impl Deref for $t {
            type Target = GlLitProgram;

            fn deref(&self) -> &GlLitProgram {
                return &self.lit;
            }
        }
    };
}

macro_rules! impl_gl_mesh_family {
    ($t:ty) => {
        impl GlMeshProgramFamily for $t {
            fn mesh_program(&self) -> &GlMeshProgram {
                return &self.mesh;
            }
        }

        impl Deref for $t {
            type Target = GlMeshProgram;

            fn deref(&self) -> &GlMeshProgram {
                return &self.mesh;
            }
        }
    };
}

impl_gl_lit_family!(GlClassicProgram);
impl_gl_lit_family!(GlPbrProgram);
impl_gl_lit_family!(GlShadedProgram);
impl_gl_lit_family!(GlToonProgram);
impl_gl_mesh_family!(GlDebugProgram);
impl_gl_mesh_family!(GlMatcapProgram);
impl_gl_mesh_family!(GlUnlitProgram);
impl_gl_mesh_family!(GlWireframeProgram);
