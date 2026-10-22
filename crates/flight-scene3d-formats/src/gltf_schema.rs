use flight_entity::{Record, Ref, Unknown};

pub struct GltfAccessor {
    pub buffer_view: Option<f32>,
    pub byte_offset: Option<f32>,
    pub component_type: GltfComponentType,
    pub count: f32,
    pub normalized: Option<bool>,
    pub r#type: String,
    pub sparse: Option<Ref<GltfAccessorSparse>>,
}

pub struct GltfAccessorSparse {
    pub count: f32,
    pub indices: Ref<GltfAccessorSparseIndices>,
    pub values: Ref<GltfAccessorSparseValues>,
}

pub struct GltfAccessorSparseIndices {
    pub buffer_view: f32,
    pub byte_offset: Option<f32>,
    pub component_type: GltfComponentType,
}

pub struct GltfAccessorSparseValues {
    pub buffer_view: f32,
    pub byte_offset: Option<f32>,
}

pub struct GltfAnimation {
    pub name: Option<String>,
    pub channels: Vec<Ref<GltfAnimationChannel>>,
    pub samplers: Vec<Ref<GltfAnimationSampler>>,
}

pub struct GltfAnimationChannel {
    pub sampler: f32,
    pub target: Ref<GltfAnimationTarget>,
}

pub struct GltfAnimationSampler {
    pub input: f32,
    pub output: f32,
    pub interpolation: Option<String>,
}

pub struct GltfAnimationTarget {
    pub node: Option<f32>,
    pub path: String,
}

pub struct GltfAsset {
    pub version: String,
}

pub struct GltfBuffer {
    pub byte_length: f32,
    pub uri: Option<String>,
}

pub struct GltfBufferView {
    pub buffer: f32,
    pub byte_length: f32,
    pub byte_offset: Option<f32>,
    pub byte_stride: Option<f32>,
}

pub struct GltfCamera {
    pub name: Option<String>,
    pub orthographic: Option<Ref<GltfOrthographicCamera>>,
    pub perspective: Option<Ref<GltfPerspectiveCamera>>,
    pub r#type: String,
}

pub struct GltfDocument {
    pub asset: Option<Ref<GltfAsset>>,
    pub cameras: Option<Vec<Ref<GltfCamera>>>,
    pub scene: Option<f32>,
    pub scenes: Option<Vec<Ref<GltfScene3D>>>,
    pub nodes: Option<Vec<Ref<GltfNode>>>,
    pub meshes: Option<Vec<Ref<GltfMesh>>>,
    pub materials: Option<Vec<Ref<GltfMaterial>>>,
    pub textures: Option<Vec<Ref<GltfTexture>>>,
    pub samplers: Option<Vec<Ref<GltfSampler>>>,
    pub images: Option<Vec<Ref<GltfImage>>>,
    pub animations: Option<Vec<Ref<GltfAnimation>>>,
    pub accessors: Option<Vec<Ref<GltfAccessor>>>,
    pub buffer_views: Option<Vec<Ref<GltfBufferView>>>,
    pub buffers: Option<Vec<Ref<GltfBuffer>>>,
    pub skins: Option<Vec<Ref<GltfSkin>>>,
    pub extensions_used: Option<Vec<String>>,
    pub extensions_required: Option<Vec<String>>,
    pub extensions: Option<Ref<GltfDocumentExtensions>>,
}

pub struct GltfDocumentExtensions {
    pub khr_lights_punctual: Option<Ref<GltfPunctualLights>>,
    pub vendor: Record<Unknown>,
}

pub struct GltfDracoMeshCompression {
    pub attributes: Ref<Record<f32>>,
    pub buffer_view: f32,
}

pub struct GltfImage {
    pub uri: Option<String>,
    pub mime_type: Option<String>,
    pub buffer_view: Option<f32>,
}

pub struct GltfMaterial {
    pub name: Option<String>,
    pub pbr_metallic_roughness: Option<Ref<GltfPbrMetallicRoughness>>,
    pub normal_texture: Option<Ref<GltfNormalTextureInfo>>,
    pub occlusion_texture: Option<Ref<GltfOcclusionTextureInfo>>,
    pub emissive_texture: Option<Ref<GltfTextureInfo>>,
    pub emissive_factor: Option<Vec<f32>>,
    pub alpha_mode: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub double_sided: Option<bool>,
    pub extensions: Option<Ref<GltfMaterialExtensions>>,
}

pub struct GltfMaterialExtensions {
    pub khr_materials_anisotropy: Option<Ref<GltfMaterialsAnisotropy>>,
    pub khr_materials_clearcoat: Option<Ref<GltfMaterialsClearcoat>>,
    pub khr_materials_emissive_strength: Option<Ref<GltfMaterialsEmissiveStrength>>,
    pub khr_materials_ior: Option<Ref<GltfMaterialsIor>>,
    pub khr_materials_iridescence: Option<Ref<GltfMaterialsIridescence>>,
    pub khr_materials_pbr_specular_glossiness: Option<Ref<GltfMaterialsPbrSpecularGlossiness>>,
    pub khr_materials_sheen: Option<Ref<GltfMaterialsSheen>>,
    pub khr_materials_unlit: Option<Ref<GltfMaterialsUnlit>>,
    pub khr_materials_specular: Option<Ref<GltfMaterialsSpecular>>,
    pub khr_materials_transmission: Option<Ref<GltfMaterialsTransmission>>,
    pub khr_materials_volume: Option<Ref<GltfMaterialsVolume>>,
    pub vendor: Record<Unknown>,
}

pub struct GltfMaterialsAnisotropy {
    pub anisotropy_rotation: Option<f32>,
    pub anisotropy_strength: Option<f32>,
    pub anisotropy_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsClearcoat {
    pub clearcoat_factor: Option<f32>,
    pub clearcoat_normal_texture: Option<Ref<GltfNormalTextureInfo>>,
    pub clearcoat_roughness_factor: Option<f32>,
    pub clearcoat_roughness_texture: Option<Ref<GltfTextureInfo>>,
    pub clearcoat_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsEmissiveStrength {
    pub emissive_strength: Option<f32>,
}

pub struct GltfMaterialsIor {
    pub ior: Option<f32>,
}

pub struct GltfMaterialsIridescence {
    pub iridescence_factor: Option<f32>,
    pub iridescence_ior: Option<f32>,
    pub iridescence_texture: Option<Ref<GltfTextureInfo>>,
    pub iridescence_thickness_maximum: Option<f32>,
    pub iridescence_thickness_minimum: Option<f32>,
    pub iridescence_thickness_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsPbrSpecularGlossiness {
    pub diffuse_factor: Option<Vec<f32>>,
    pub diffuse_texture: Option<Ref<GltfTextureInfo>>,
    pub glossiness_factor: Option<f32>,
    pub specular_factor: Option<Vec<f32>>,
    pub specular_glossiness_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsSheen {
    pub sheen_color_factor: Option<Vec<f32>>,
    pub sheen_color_texture: Option<Ref<GltfTextureInfo>>,
    pub sheen_roughness_factor: Option<f32>,
    pub sheen_roughness_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsSpecular {
    pub specular_color_factor: Option<Vec<f32>>,
    pub specular_color_texture: Option<Ref<GltfTextureInfo>>,
    pub specular_factor: Option<f32>,
    pub specular_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsTransmission {
    pub transmission_factor: Option<f32>,
    pub transmission_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsVolume {
    pub attenuation_color: Option<Vec<f32>>,
    pub attenuation_distance: Option<f32>,
    pub thickness_factor: Option<f32>,
    pub thickness_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfMaterialsUnlit {}

pub struct GltfMesh {
    pub name: Option<String>,
    pub primitives: Vec<Ref<GltfPrimitive>>,
    pub weights: Option<Vec<f32>>,
}

pub struct GltfMorphTarget {
    pub normal: Option<f32>,
    pub position: Option<f32>,
    pub tangent: Option<f32>,
}

pub struct GltfNode {
    pub camera: Option<f32>,
    pub name: Option<String>,
    pub children: Option<Vec<f32>>,
    pub mesh: Option<f32>,
    pub skin: Option<f32>,
    pub matrix: Option<Vec<f32>>,
    pub translation: Option<Vec<f32>>,
    pub rotation: Option<Vec<f32>>,
    pub scale: Option<Vec<f32>>,
    pub extensions: Option<Ref<GltfNodeExtensions>>,
}

pub struct GltfNodeExtensions {
    pub khr_lights_punctual: Option<Ref<GltfNodePunctualLight>>,
    pub vendor: Record<Unknown>,
}

pub struct GltfNodePunctualLight {
    pub light: f32,
}

pub struct GltfNormalTextureInfo {
    pub fields: GltfTextureInfo,
    pub scale: Option<f32>,
}

pub struct GltfOcclusionTextureInfo {
    pub fields: GltfTextureInfo,
    pub strength: Option<f32>,
}

pub struct GltfOrthographicCamera {
    pub xmag: f32,
    pub ymag: f32,
    pub zfar: f32,
    pub znear: f32,
}

pub struct GltfPbrMetallicRoughness {
    pub base_color_factor: Option<Vec<f32>>,
    pub base_color_texture: Option<Ref<GltfTextureInfo>>,
    pub metallic_factor: Option<f32>,
    pub roughness_factor: Option<f32>,
    pub metallic_roughness_texture: Option<Ref<GltfTextureInfo>>,
}

pub struct GltfPerspectiveCamera {
    pub aspect_ratio: Option<f32>,
    pub yfov: f32,
    pub zfar: Option<f32>,
    pub znear: f32,
}

pub struct GltfPrimitive {
    pub attributes: Ref<GltfPrimitiveAttributes>,
    pub indices: Option<f32>,
    pub material: Option<f32>,
    pub mode: Option<f32>,
    pub extensions: Option<Ref<GltfPrimitiveExtensions>>,
    pub targets: Option<Vec<Ref<GltfMorphTarget>>>,
}

pub struct GltfPrimitiveAttributes {
    pub joints_0: Option<f32>,
    pub normal: Option<f32>,
    pub position: Option<f32>,
    pub tangent: Option<f32>,
    pub texcoord_0: Option<f32>,
    pub weights_0: Option<f32>,
}

pub struct GltfPrimitiveExtensions {
    pub khr_draco_mesh_compression: Option<Ref<GltfDracoMeshCompression>>,
    pub vendor: Record<Unknown>,
}

pub struct GltfPunctualLight {
    pub color: Option<Vec<f32>>,
    pub intensity: Option<f32>,
    pub name: Option<String>,
    pub range: Option<f32>,
    pub spot: Option<Ref<GltfPunctualLightSpot>>,
    pub r#type: String,
}

pub struct GltfPunctualLights {
    pub lights: Vec<Ref<GltfPunctualLight>>,
}

pub struct GltfPunctualLightSpot {
    pub inner_cone_angle: Option<f32>,
    pub outer_cone_angle: Option<f32>,
}

pub struct GltfSampler {
    pub mag_filter: Option<f32>,
    pub min_filter: Option<f32>,
    pub wrap_s: Option<f32>,
    pub wrap_t: Option<f32>,
}

pub struct GltfScene3D {
    pub name: Option<String>,
    pub nodes: Option<Vec<f32>>,
}

pub struct GltfSkin {
    pub name: Option<String>,
    pub inverse_bind_matrices: Option<f32>,
    pub joints: Vec<f32>,
    pub skeleton: Option<f32>,
}

pub struct GltfTexture {
    pub extensions: Option<Ref<GltfTextureExtensions>>,
    pub sampler: Option<f32>,
    pub source: Option<f32>,
}

pub struct GltfTextureBasisu {
    pub source: f32,
}

pub struct GltfTextureExtensions {
    pub khr_texture_basisu: Option<Ref<GltfTextureBasisu>>,
    pub vendor: Record<Unknown>,
}

pub struct GltfTextureInfo {
    pub index: f32,
    pub tex_coord: Option<f32>,
    pub extensions: Option<Ref<GltfTextureInfoExtensions>>,
}

pub struct GltfTextureInfoExtensions {
    pub khr_texture_transform: Option<Ref<GltfTextureTransform>>,
}

pub struct GltfTextureTransform {
    pub offset: Option<Vec<f32>>,
    pub rotation: Option<f32>,
    pub scale: Option<Vec<f32>>,
    pub tex_coord: Option<f32>,
}

pub type GltfComponentType = f32;

pub trait GltfTextureInfoAccess: Send + Sync {
    fn gltf_texture_info(&self) -> &GltfTextureInfo;
}

// flight-lint: allow(contract-vocabulary) D16 structural base view keeps normal/occlusion texture-info handles on their original allocations
pub type GltfTextureInfoRef = Ref<dyn GltfTextureInfoAccess>;

// flight-lint: allow(sugar-delegates) D16 structural implementation exposes original composed wire fields, not receiver sugar
impl GltfTextureInfoAccess for GltfNormalTextureInfo {
    fn gltf_texture_info(&self) -> &GltfTextureInfo {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 structural implementation exposes original composed wire fields, not receiver sugar
impl GltfTextureInfoAccess for GltfOcclusionTextureInfo {
    fn gltf_texture_info(&self) -> &GltfTextureInfo {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 structural implementation exposes original composed wire fields, not receiver sugar
impl GltfTextureInfoAccess for GltfTextureInfo {
    fn gltf_texture_info(&self) -> &GltfTextureInfo {
        return self;
    }
}
