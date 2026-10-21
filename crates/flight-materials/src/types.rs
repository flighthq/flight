use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Kind, Ref};
use flight_texture::Texture;

// ── Texture reference alias ──────────────────────────────────────────────────

pub type TextureSlot = Option<Ref<Texture>>;

// ── Alpha mode ───────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MaterialAlphaMode {
    Blend,
    Mask,
    #[default]
    Opaque,
}

// ── Blend mode ───────────────────────────────────────────────────────────────

pub const BLEND_MODE_ADD: &str = "Add";
pub const BLEND_MODE_DARKEN: &str = "Darken";
pub const BLEND_MODE_LIGHTEN: &str = "Lighten";
pub const BLEND_MODE_MULTIPLY: &str = "Multiply";
pub const BLEND_MODE_NORMAL: &str = "Normal";
pub const BLEND_MODE_SCREEN: &str = "Screen";

pub type BlendMode = String;

// ── PBR UV set ───────────────────────────────────────────────────────────────

pub type PbrUvSet = u32;

// ── Material conversion ──────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MaterialConversionDropReason {
    IncompatibleChannelSemantics,
    UnsupportedByTargetModel,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MaterialConversionExplanation {
    pub dropped_maps: Vec<String>,
    pub reason: Option<MaterialConversionDropReason>,
}

pub type MaterialConversionGuard = Arc<dyn Fn(&MaterialConversionExplanation, &str) + Send + Sync>;

pub struct MaterialConversionContext {
    pub(crate) guard: MaterialConversionGuard,
}

// ── Material base ────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct Material {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
}

// ── Material2D (open family) ────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct Material2DFields {
    material: Material,
}

pub trait Material2D: flight_entity::Entity + Send + Sync {
    fn material2d_fields(&self) -> &Material2DFields;
    fn material2d_fields_mut(&mut self) -> &mut Material2DFields;
}

// ── MaterialData (open family) ──────────────────────────────────────────────

#[derive(Clone, Debug, Default)]
pub struct MaterialDataFields {
    runtime: EntityRuntimeSlot,
}

pub trait MaterialData: flight_entity::Entity + Send + Sync {
    fn material_data_fields(&self) -> &MaterialDataFields;
    fn material_data_fields_mut(&mut self) -> &mut MaterialDataFields;
}

// ── TintMaterialData ────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct TintMaterialData {
    fields: MaterialDataFields,
    pub tint: u32,
}

// ── Material3D ───────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct Material3D {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
}

// ── Standard material (2D) ───────────────────────────────────────────────────

pub const STANDARD_MATERIAL_KIND: &str = "StandardMaterial";

#[derive(Clone, Debug)]
pub struct StandardMaterial {
    fields: Material2DFields,
}

// ── Classic materials ────────────────────────────────────────────────────────

pub const BLINN_PHONG_MATERIAL_KIND: &str = "BlinnPhongMaterial";

#[derive(Clone, Debug)]
pub struct BlinnPhongMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub alpha_map: TextureSlot,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub shininess: f32,
    pub specular: u32,
    pub specular_map: TextureSlot,
}

pub const LAMBERT_MATERIAL_KIND: &str = "LambertMaterial";

#[derive(Clone, Debug)]
pub struct LambertMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
}

pub const PHONG_MATERIAL_KIND: &str = "PhongMaterial";

#[derive(Clone, Debug)]
pub struct PhongMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub shininess: f32,
    pub specular: u32,
    pub specular_map: TextureSlot,
}

// ── Unlit materials ──────────────────────────────────────────────────────────

pub const DEPTH_MATERIAL_KIND: &str = "DepthMaterial";

#[derive(Clone, Debug)]
pub struct DepthMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub far: f32,
    pub near: f32,
}

pub const EMISSIVE_MATERIAL_KIND: &str = "EmissiveMaterial";

#[derive(Clone, Debug)]
pub struct EmissiveMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
}

pub const MATCAP_MATERIAL_KIND: &str = "MatcapMaterial";

#[derive(Clone, Debug)]
pub struct MatcapMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub matcap: TextureSlot,
    pub tint: u32,
}

pub const NORMAL_MATERIAL_KIND: &str = "NormalMaterial";

#[derive(Clone, Debug)]
pub struct NormalMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
}

pub const TOON_MATERIAL_KIND: &str = "ToonMaterial";

#[derive(Clone, Debug)]
pub struct ToonMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
    pub ramp: TextureSlot,
    pub steps: u32,
}

pub const UNLIT_MATERIAL_KIND: &str = "UnlitMaterial";

#[derive(Clone, Debug)]
pub struct UnlitMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
}

pub const VERTEX_COLOR_MATERIAL_KIND: &str = "VertexColorMaterial";

#[derive(Clone, Debug)]
pub struct VertexColorMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub tint: u32,
}

pub const WIREFRAME_MATERIAL_KIND: &str = "WireframeMaterial";

#[derive(Clone, Debug)]
pub struct WireframeMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub color: u32,
    pub thickness: f32,
}

// ── PBR materials ────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct StandardPbrMaterialProperties {
    pub alpha_map: TextureSlot,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
    pub metallic: f32,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: f32,
    pub roughness: f32,
}

pub const STANDARD_PBR_MATERIAL_KIND: &str = "StandardPbrMaterial";

#[derive(Clone, Debug)]
pub struct StandardPbrMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub alpha_map: TextureSlot,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
    pub metallic: f32,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: f32,
    pub roughness: f32,
}

pub const SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND: &str = "SpecularGlossinessPbrMaterial";

#[derive(Clone, Debug)]
pub struct SpecularGlossinessPbrMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
    pub glossiness: f32,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: f32,
    pub specular: u32,
    pub specular_glossiness_map: TextureSlot,
}

// ── Extended PBR material ────────────────────────────────────────────────────

pub const EXTENDED_PBR_MATERIAL_KIND: &str = "ExtendedPbrMaterial";

#[derive(Clone, Debug)]
pub struct ExtendedPbrMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub extensions: Vec<PbrExtension>,
    pub standard: StandardPbrMaterialProperties,
}

// ── Custom shader material ───────────────────────────────────────────────────

pub const CUSTOM_SHADER_MATERIAL_KIND: &str = "CustomShaderMaterial";

// flight-lint: allow(contract-vocabulary) D16 uniforms/textures are open bags per TS CustomShaderMaterial.textures: Record<string, Texture> | null and uniforms: Record<string, number | number[]> | null
#[derive(Clone, Debug)]
pub struct CustomShaderMaterial {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub shader_key: String,
    // flight-lint: allow(contract-vocabulary) open bag of named texture bindings per TS Record<string, Texture> | null
    pub textures: Option<std::collections::HashMap<String, Ref<Texture>>>,
    // flight-lint: allow(contract-vocabulary) open bag of scalar/vector uniforms per TS Record<string, number | number[]> | null
    pub uniforms: Option<std::collections::HashMap<String, UniformValue>>,
}

#[derive(Clone, Debug)]
pub enum UniformValue {
    Scalar(f32),
    // flight-lint: allow(contract-vocabulary) TS number[] uniform arrays
    // flight-lint: allow(enum-payload-named) TS number[] maps directly to Vec<f32>; a wrapper struct adds no semantic value
    Array(Vec<f32>),
}

// ── PBR extensions ───────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub enum PbrExtension {
    Anisotropy(AnisotropyPbrExtension),
    Clearcoat(ClearcoatPbrExtension),
    Iridescence(IridescencePbrExtension),
    Sheen(SheenPbrExtension),
    Specular(SpecularPbrExtension),
    TransmissionVolume(TransmissionVolumePbrExtension),
    WrappedDiffuse(WrappedDiffusePbrExtension),
}

pub const ANISOTROPY_PBR_EXTENSION_KIND: &str = "AnisotropyPbrExtension";

#[derive(Clone, Debug)]
pub struct AnisotropyPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub anisotropy_map: TextureSlot,
    pub anisotropy_map_uv_set: PbrUvSet,
    pub anisotropy_rotation: f32,
    pub anisotropy_strength: f32,
}

pub const CLEARCOAT_PBR_EXTENSION_KIND: &str = "ClearcoatPbrExtension";

#[derive(Clone, Debug)]
pub struct ClearcoatPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub clearcoat: f32,
    pub clearcoat_map: TextureSlot,
    pub clearcoat_map_uv_set: PbrUvSet,
    pub clearcoat_normal_map: TextureSlot,
    pub clearcoat_normal_map_uv_set: PbrUvSet,
    pub clearcoat_normal_scale: f32,
    pub clearcoat_roughness: f32,
    pub clearcoat_roughness_map: TextureSlot,
    pub clearcoat_roughness_map_uv_set: PbrUvSet,
}

pub const IRIDESCENCE_PBR_EXTENSION_KIND: &str = "IridescencePbrExtension";

#[derive(Clone, Debug)]
pub struct IridescencePbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub iridescence: f32,
    pub iridescence_ior: f32,
    pub iridescence_map: TextureSlot,
    pub iridescence_map_uv_set: PbrUvSet,
    pub iridescence_thickness_map: TextureSlot,
    pub iridescence_thickness_map_uv_set: PbrUvSet,
    pub iridescence_thickness_max: f32,
    pub iridescence_thickness_min: f32,
}

pub const SHEEN_PBR_EXTENSION_KIND: &str = "SheenPbrExtension";

#[derive(Clone, Debug)]
pub struct SheenPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub sheen_color: u32,
    pub sheen_color_map: TextureSlot,
    pub sheen_color_map_uv_set: PbrUvSet,
    pub sheen_roughness: f32,
    pub sheen_roughness_map: TextureSlot,
    pub sheen_roughness_map_uv_set: PbrUvSet,
}

pub const SPECULAR_PBR_EXTENSION_KIND: &str = "SpecularPbrExtension";

#[derive(Clone, Debug)]
pub struct SpecularPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub specular: f32,
    pub specular_color: u32,
    pub specular_color_map: TextureSlot,
    pub specular_color_map_uv_set: PbrUvSet,
    pub specular_map: TextureSlot,
    pub specular_map_uv_set: PbrUvSet,
}

pub const TRANSMISSION_VOLUME_PBR_EXTENSION_KIND: &str = "TransmissionVolumePbrExtension";

#[derive(Clone, Debug)]
pub struct TransmissionVolumePbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub attenuation_color: u32,
    pub attenuation_distance: f32,
    pub ior: f32,
    pub thickness: f32,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: PbrUvSet,
    pub transmission: f32,
    pub transmission_map: TextureSlot,
    pub transmission_map_uv_set: PbrUvSet,
}

pub const WRAPPED_DIFFUSE_PBR_EXTENSION_KIND: &str = "WrappedDiffusePbrExtension";

#[derive(Clone, Debug)]
pub struct WrappedDiffusePbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub thickness: f32,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: PbrUvSet,
    pub wrapped_diffuse_color: u32,
    pub wrapped_diffuse_map: TextureSlot,
    pub wrapped_diffuse_map_uv_set: PbrUvSet,
    pub wrapped_diffuse_strength: f32,
}

// ── ColorScaleBias ───────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct ColorScaleBias {
    runtime: EntityRuntimeSlot,
    pub red_scale: f32,
    pub green_scale: f32,
    pub blue_scale: f32,
    pub alpha_scale: f32,
    pub red_bias: f32,
    pub green_bias: f32,
    pub blue_bias: f32,
    pub alpha_bias: f32,
}

// ── Options types ────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Default)]
pub struct StandardMaterialOptions {
    pub name: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct ColorScaleBiasOptions {
    pub red_scale: Option<f32>,
    pub green_scale: Option<f32>,
    pub blue_scale: Option<f32>,
    pub alpha_scale: Option<f32>,
    pub red_bias: Option<f32>,
    pub green_bias: Option<f32>,
    pub blue_bias: Option<f32>,
    pub alpha_bias: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct BlinnPhongMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub alpha_map: TextureSlot,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub shininess: Option<f32>,
    pub specular: Option<u32>,
    pub specular_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct LambertMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct PhongMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub shininess: Option<f32>,
    pub specular: Option<u32>,
    pub specular_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct DepthMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub far: Option<f32>,
    pub near: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct EmissiveMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct MatcapMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub matcap: TextureSlot,
    pub tint: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct NormalMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ToonMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
    pub ramp: TextureSlot,
    pub steps: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct UnlitMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct VertexColorMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub tint: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct WireframeMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub color: Option<u32>,
    pub thickness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct StandardPbrMaterialPropertiesOptions {
    pub alpha_map: TextureSlot,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
    pub metallic: Option<f32>,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: Option<f32>,
    pub roughness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct StandardPbrMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub alpha_map: TextureSlot,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
    pub metallic: Option<f32>,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: Option<f32>,
    pub roughness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SpecularGlossinessPbrMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
    pub glossiness: Option<f32>,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: Option<f32>,
    pub specular: Option<u32>,
    pub specular_glossiness_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct ExtendedPbrMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub extensions: Option<Vec<PbrExtension>>,
    pub standard: Option<StandardPbrMaterialProperties>,
}

#[derive(Clone, Debug, Default)]
pub struct CustomShaderMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub shader_key: Option<String>,
    pub textures: Option<std::collections::HashMap<String, Ref<Texture>>>,
    pub uniforms: Option<std::collections::HashMap<String, UniformValue>>,
}

#[derive(Clone, Debug, Default)]
pub struct AnisotropyPbrExtensionOptions {
    pub anisotropy_map: TextureSlot,
    pub anisotropy_map_uv_set: Option<PbrUvSet>,
    pub anisotropy_rotation: Option<f32>,
    pub anisotropy_strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ClearcoatPbrExtensionOptions {
    pub clearcoat: Option<f32>,
    pub clearcoat_map: TextureSlot,
    pub clearcoat_map_uv_set: Option<PbrUvSet>,
    pub clearcoat_normal_map: TextureSlot,
    pub clearcoat_normal_map_uv_set: Option<PbrUvSet>,
    pub clearcoat_normal_scale: Option<f32>,
    pub clearcoat_roughness: Option<f32>,
    pub clearcoat_roughness_map: TextureSlot,
    pub clearcoat_roughness_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct IridescencePbrExtensionOptions {
    pub iridescence: Option<f32>,
    pub iridescence_ior: Option<f32>,
    pub iridescence_map: TextureSlot,
    pub iridescence_map_uv_set: Option<PbrUvSet>,
    pub iridescence_thickness_map: TextureSlot,
    pub iridescence_thickness_map_uv_set: Option<PbrUvSet>,
    pub iridescence_thickness_max: Option<f32>,
    pub iridescence_thickness_min: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SheenPbrExtensionOptions {
    pub sheen_color: Option<u32>,
    pub sheen_color_map: TextureSlot,
    pub sheen_color_map_uv_set: Option<PbrUvSet>,
    pub sheen_roughness: Option<f32>,
    pub sheen_roughness_map: TextureSlot,
    pub sheen_roughness_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct SpecularPbrExtensionOptions {
    pub specular: Option<f32>,
    pub specular_color: Option<u32>,
    pub specular_color_map: TextureSlot,
    pub specular_color_map_uv_set: Option<PbrUvSet>,
    pub specular_map: TextureSlot,
    pub specular_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct TransmissionVolumePbrExtensionOptions {
    pub attenuation_color: Option<u32>,
    pub attenuation_distance: Option<f32>,
    pub ior: Option<f32>,
    pub thickness: Option<f32>,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: Option<PbrUvSet>,
    pub transmission: Option<f32>,
    pub transmission_map: TextureSlot,
    pub transmission_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct WrappedDiffusePbrExtensionOptions {
    pub thickness: Option<f32>,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: Option<PbrUvSet>,
    pub wrapped_diffuse_color: Option<u32>,
    pub wrapped_diffuse_map: TextureSlot,
    pub wrapped_diffuse_map_uv_set: Option<PbrUvSet>,
    pub wrapped_diffuse_strength: Option<f32>,
}

pub struct GlassExtendedPbrMaterialOptions {
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub standard: Option<StandardPbrMaterialPropertiesOptions>,
    pub transmission_volume: Option<TransmissionVolumePbrExtensionOptions>,
}

// ── Free functions ──────────────────────────────────────────────────────────

// flight-lint: allow(conform-extra) D5: Rust free-function constructor for caller-owned context; TS uses module-scoped state via set/enable
pub fn create_material_conversion_context(
    guard: MaterialConversionGuard,
) -> MaterialConversionContext {
    return MaterialConversionContext { guard };
}

// ── Impl blocks ─────────────────────────────────────────────────────────────

// flight-lint: allow(sugar-delegates) D16 open-family: base type self-implements its own family trait
impl MaterialData for MaterialDataFields {
    fn material_data_fields(&self) -> &MaterialDataFields {
        return self;
    }
    fn material_data_fields_mut(&mut self) -> &mut MaterialDataFields {
        return self;
    }
}

impl MaterialConversionContext {
    pub fn new(guard: MaterialConversionGuard) -> Self {
        return create_material_conversion_context(guard);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Material2DFields delegates to inner Material
impl std::ops::Deref for Material2DFields {
    type Target = Material;

    fn deref(&self) -> &Material {
        return &self.material;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Material2DFields delegates to inner Material
impl std::ops::DerefMut for Material2DFields {
    fn deref_mut(&mut self) -> &mut Material {
        return &mut self.material;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Entity runtime delegates through Material base
impl flight_entity::Entity for Material2DFields {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.material);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.material);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family: Material2DFields self-implements Material2D trait
impl Material2D for Material2DFields {
    fn material2d_fields(&self) -> &Material2DFields {
        return self;
    }

    fn material2d_fields_mut(&mut self) -> &mut Material2DFields {
        return self;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: StandardMaterial delegates to inner Material2DFields
impl std::ops::Deref for StandardMaterial {
    type Target = Material2DFields;

    fn deref(&self) -> &Material2DFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: StandardMaterial delegates to inner Material2DFields
impl std::ops::DerefMut for StandardMaterial {
    fn deref_mut(&mut self) -> &mut Material2DFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Entity runtime delegates through Material2DFields base
impl flight_entity::Entity for StandardMaterial {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.fields);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family: StandardMaterial implements Material2D trait
impl Material2D for StandardMaterial {
    fn material2d_fields(&self) -> &Material2DFields {
        return &self.fields;
    }

    fn material2d_fields_mut(&mut self) -> &mut Material2DFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: TintMaterialData delegates to inner MaterialDataFields
impl std::ops::Deref for TintMaterialData {
    type Target = MaterialDataFields;

    fn deref(&self) -> &MaterialDataFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: TintMaterialData delegates to inner MaterialDataFields
impl std::ops::DerefMut for TintMaterialData {
    fn deref_mut(&mut self) -> &mut MaterialDataFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Entity runtime delegates through MaterialDataFields base
impl flight_entity::Entity for TintMaterialData {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.fields);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: MaterialData trait accessor for TintMaterialData
impl MaterialData for TintMaterialData {
    fn material_data_fields(&self) -> &MaterialDataFields {
        return &self.fields;
    }

    fn material_data_fields_mut(&mut self) -> &mut MaterialDataFields {
        return &mut self.fields;
    }
}

// ── D18 sugar delegates ─────────────────────────────────────────────────────

// flight-lint: allow(sugar-delegates) D18 receiver sugar: Material methods delegate to free functions
impl Material {
    pub fn new(kind: Kind) -> Self {
        return crate::material::create_material(kind);
    }

    pub fn clone_material(&self) -> Self {
        return crate::material::clone_material(self);
    }

    pub fn copy_from(&mut self, source: &Material) {
        crate::material::copy_material(self, source);
    }

    pub fn equals(&self, other: &Material) -> bool {
        return crate::material::equals_material(self, other);
    }

    pub fn initialize(&mut self, kind: Kind) {
        crate::material::initialize_material(self, kind);
    }

    pub fn of_kind<'a>(material: Option<&'a Material>, kind: &str) -> Option<&'a Material> {
        return crate::material::get_material_of_kind(material, kind);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: Material3D methods delegate to free functions
impl Material3D {
    pub fn new(kind: Kind, opts: Option<&crate::material3d::Material3DOptions>) -> Self {
        return crate::material3d::create_material3d(kind, opts);
    }

    pub fn alpha_mode(&self) -> MaterialAlphaMode {
        return crate::material3d::get_material3d_alpha_mode(self);
    }

    pub fn initialize(&mut self, kind: Kind, opts: Option<&crate::material3d::Material3DOptions>) {
        crate::material3d::initialize_material3d(self, kind, opts);
    }

    pub fn is_blended(&self) -> bool {
        return crate::material3d::is_material3d_blended(self);
    }

    pub fn is_masked(&self) -> bool {
        return crate::material3d::is_material3d_masked(self);
    }

    pub fn is_opaque(&self) -> bool {
        return crate::material3d::is_material3d_opaque(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: StandardMaterial methods delegate to free functions
impl StandardMaterial {
    pub fn new(options: Option<&StandardMaterialOptions>) -> Self {
        return crate::standard_material::create_standard_material(options);
    }

    pub fn initialize(&mut self, options: Option<&StandardMaterialOptions>) {
        crate::standard_material::initialize_standard_material(self, options);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ColorScaleBias methods delegate to free functions
impl ColorScaleBias {
    pub fn new(opts: Option<&ColorScaleBiasOptions>) -> Self {
        return crate::color_scale_bias::create_color_scale_bias(opts);
    }

    pub fn clone_color_scale_bias(&self) -> Self {
        return crate::color_scale_bias::clone_color_scale_bias(self);
    }

    pub fn concat(&mut self, a: &ColorScaleBias, b: &ColorScaleBias) {
        crate::color_scale_bias::concat_color_scale_bias(self, a, b);
    }

    pub fn initialize(&mut self, opts: Option<&ColorScaleBiasOptions>) {
        crate::color_scale_bias::initialize_color_scale_bias(self, opts);
    }

    pub fn copy_from(&mut self, source: &ColorScaleBias) {
        crate::color_scale_bias::copy_color_scale_bias(self, source);
    }

    pub fn copy_to_arrays(&self, out_color_scales: &mut Vec<f32>, out_color_biases: &mut Vec<f32>) {
        crate::color_scale_bias::copy_color_scale_bias_to_arrays(
            out_color_scales,
            out_color_biases,
            self,
        );
    }

    pub fn equals(&self, other: &ColorScaleBias) -> bool {
        return crate::color_scale_bias::equals_color_scale_bias(self, other);
    }

    pub fn equals_biases(&self, other: &ColorScaleBias, compare_alpha: bool) -> bool {
        return crate::color_scale_bias::equals_color_scale_bias_biases(self, other, compare_alpha);
    }

    pub fn equals_scales(&self, other: &ColorScaleBias, compare_alpha: bool) -> bool {
        return crate::color_scale_bias::equals_color_scale_bias_scales(self, other, compare_alpha);
    }

    pub fn bias_rgb(&self) -> u32 {
        return crate::color_scale_bias::get_color_scale_bias_bias_rgb(self);
    }

    pub fn bias_rgba(&self) -> u32 {
        return crate::color_scale_bias::get_color_scale_bias_bias_rgba(self);
    }

    pub fn invert_from(&mut self, source: &ColorScaleBias) {
        crate::color_scale_bias::invert_color_scale_bias(self, source);
    }

    pub fn is_identity(&self, compare_alpha_scale: bool) -> bool {
        return crate::color_scale_bias::is_identity_color_scale_bias(self, compare_alpha_scale);
    }

    pub fn set_values(
        &mut self,
        red_scale: f32,
        green_scale: f32,
        blue_scale: f32,
        alpha_scale: f32,
        red_bias: f32,
        green_bias: f32,
        blue_bias: f32,
        alpha_bias: f32,
    ) {
        crate::color_scale_bias::set_color_scale_bias(
            self,
            red_scale,
            green_scale,
            blue_scale,
            alpha_scale,
            red_bias,
            green_bias,
            blue_bias,
            alpha_bias,
        );
    }

    pub fn set_bias_rgb(&mut self, value: u32) {
        crate::color_scale_bias::set_color_scale_bias_bias_rgb(self, value);
    }

    pub fn set_bias_rgba(&mut self, value: u32) {
        crate::color_scale_bias::set_color_scale_bias_bias_rgba(self, value);
    }

    pub fn set_identity(&mut self) {
        crate::color_scale_bias::set_color_scale_bias_identity(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: BlinnPhongMaterial constructor delegates to free function
impl BlinnPhongMaterial {
    pub fn new(opts: Option<&BlinnPhongMaterialOptions>) -> Self {
        return crate::classic_materials::create_blinn_phong_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: LambertMaterial constructor delegates to free function
impl LambertMaterial {
    pub fn new(opts: Option<&LambertMaterialOptions>) -> Self {
        return crate::classic_materials::create_lambert_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: DepthMaterial constructor delegates to free function
impl DepthMaterial {
    pub fn new(opts: Option<&DepthMaterialOptions>) -> Self {
        return crate::unlit_materials::create_depth_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: EmissiveMaterial constructor delegates to free function
impl EmissiveMaterial {
    pub fn new(opts: Option<&EmissiveMaterialOptions>) -> Self {
        return crate::unlit_materials::create_emissive_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: MatcapMaterial constructor delegates to free function
impl MatcapMaterial {
    pub fn new(opts: Option<&MatcapMaterialOptions>) -> Self {
        return crate::unlit_materials::create_matcap_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: NormalMaterial constructor delegates to free function
impl NormalMaterial {
    pub fn new(opts: Option<&NormalMaterialOptions>) -> Self {
        return crate::unlit_materials::create_normal_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ToonMaterial constructor delegates to free function
impl ToonMaterial {
    pub fn new(opts: Option<&ToonMaterialOptions>) -> Self {
        return crate::unlit_materials::create_toon_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: UnlitMaterial constructor delegates to free function
impl UnlitMaterial {
    pub fn new(opts: Option<&UnlitMaterialOptions>) -> Self {
        return crate::unlit_materials::create_unlit_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: VertexColorMaterial constructor delegates to free function
impl VertexColorMaterial {
    pub fn new(opts: Option<&VertexColorMaterialOptions>) -> Self {
        return crate::unlit_materials::create_vertex_color_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: WireframeMaterial constructor delegates to free function
impl WireframeMaterial {
    pub fn new(opts: Option<&WireframeMaterialOptions>) -> Self {
        return crate::unlit_materials::create_wireframe_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: StandardPbrMaterial constructor delegates to free function
impl StandardPbrMaterial {
    pub fn new(opts: Option<&StandardPbrMaterialOptions>) -> Self {
        return crate::pbr_materials::create_standard_pbr_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: CustomShaderMaterial constructor delegates to free function
impl CustomShaderMaterial {
    pub fn new(opts: Option<&CustomShaderMaterialOptions>) -> Self {
        return crate::custom_shader_material::create_custom_shader_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: AnisotropyPbrExtension methods delegate to free functions
impl AnisotropyPbrExtension {
    pub fn new(opts: Option<&AnisotropyPbrExtensionOptions>) -> Self {
        return crate::anisotropy_pbr_extension::create_anisotropy_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::anisotropy_pbr_extension::is_valid_anisotropy_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ClearcoatPbrExtension methods delegate to free functions
impl ClearcoatPbrExtension {
    pub fn new(opts: Option<&ClearcoatPbrExtensionOptions>) -> Self {
        return crate::clearcoat_pbr_extension::create_clearcoat_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::clearcoat_pbr_extension::is_valid_clearcoat_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: IridescencePbrExtension methods delegate to free functions
impl IridescencePbrExtension {
    pub fn new(opts: Option<&IridescencePbrExtensionOptions>) -> Self {
        return crate::iridescence_pbr_extension::create_iridescence_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::iridescence_pbr_extension::is_valid_iridescence_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: SheenPbrExtension methods delegate to free functions
impl SheenPbrExtension {
    pub fn new(opts: Option<&SheenPbrExtensionOptions>) -> Self {
        return crate::sheen_pbr_extension::create_sheen_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::sheen_pbr_extension::is_valid_sheen_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: SpecularPbrExtension methods delegate to free functions
impl SpecularPbrExtension {
    pub fn new(opts: Option<&SpecularPbrExtensionOptions>) -> Self {
        return crate::specular_pbr_extension::create_specular_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::specular_pbr_extension::is_valid_specular_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: TransmissionVolumePbrExtension methods delegate to free functions
impl TransmissionVolumePbrExtension {
    pub fn new(opts: Option<&TransmissionVolumePbrExtensionOptions>) -> Self {
        return crate::transmission_volume_pbr_extension::create_transmission_volume_pbr_extension(
            opts,
        );
    }

    pub fn is_valid(&self) -> bool {
        return crate::transmission_volume_pbr_extension::is_valid_transmission_volume_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: WrappedDiffusePbrExtension methods delegate to free functions
impl WrappedDiffusePbrExtension {
    pub fn new(opts: Option<&WrappedDiffusePbrExtensionOptions>) -> Self {
        return crate::wrapped_diffuse_pbr_extension::create_wrapped_diffuse_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::wrapped_diffuse_pbr_extension::is_valid_wrapped_diffuse_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ExtendedPbrMaterial constructor delegates to free function
impl ExtendedPbrMaterial {
    pub fn new(opts: Option<&ExtendedPbrMaterialOptions>) -> Self {
        return crate::extended_pbr_material::create_extended_pbr_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: PhongMaterial methods delegate to free functions
impl PhongMaterial {
    pub fn new(opts: Option<&PhongMaterialOptions>) -> Self {
        return crate::classic_materials::create_phong_material(opts);
    }

    pub fn convert_to_standard_pbr(
        &self,
        opts: Option<&StandardPbrMaterialOptions>,
        ctx: Option<&MaterialConversionContext>,
    ) -> StandardPbrMaterial {
        return crate::phong_to_pbr::convert_phong_to_standard_pbr_material(self, opts, ctx);
    }

    pub fn explain_conversion(&self) -> MaterialConversionExplanation {
        return crate::explain_material_conversion::explain_phong_conversion(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: SpecularGlossinessPbrMaterial methods delegate to free functions
impl SpecularGlossinessPbrMaterial {
    pub fn new(opts: Option<&SpecularGlossinessPbrMaterialOptions>) -> Self {
        return crate::pbr_materials::create_specular_glossiness_pbr_material(opts);
    }

    pub fn convert_to_standard_pbr(
        &self,
        out: &mut StandardPbrMaterialProperties,
        ctx: Option<&MaterialConversionContext>,
    ) {
        crate::pbr_materials::convert_specular_glossiness_to_standard_pbr(out, self, ctx);
    }

    pub fn explain_conversion(&self) -> MaterialConversionExplanation {
        return crate::explain_material_conversion::explain_specular_glossiness_conversion(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: StandardPbrMaterialProperties methods delegate to free functions
impl StandardPbrMaterialProperties {
    pub fn new(opts: Option<&StandardPbrMaterialPropertiesOptions>) -> Self {
        return crate::pbr_materials::create_standard_pbr_material_properties(opts);
    }

    pub fn clamp(&mut self) -> &mut Self {
        return crate::material_validation::clamp_standard_pbr_material_properties(self);
    }
}

// ── Default impls & entity registrations ─────────────────────────────────────

impl Default for Material {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: String::new(),
            name: None,
        };
    }
}

flight_entity::impl_entity!(Material);

impl Default for Material2DFields {
    fn default() -> Self {
        return Self {
            material: Material::default(),
        };
    }
}

flight_entity::impl_entity!(MaterialDataFields);

impl Default for TintMaterialData {
    fn default() -> Self {
        return Self {
            fields: MaterialDataFields::default(),
            tint: 0,
        };
    }
}

impl Default for Material3D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: String::new(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
        };
    }
}

flight_entity::impl_entity!(Material3D);

impl Default for StandardMaterial {
    fn default() -> Self {
        let mut fields = Material2DFields::default();
        fields.kind = STANDARD_MATERIAL_KIND.to_string();
        return Self { fields };
    }
}

impl Default for BlinnPhongMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: BLINN_PHONG_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            alpha_map: None,
            diffuse: 0xffffffff,
            diffuse_map: None,
            normal_map: None,
            normal_scale: 1.0,
            shininess: 32.0,
            specular: 0xffffffff,
            specular_map: None,
        };
    }
}

flight_entity::impl_entity!(BlinnPhongMaterial);

impl Default for LambertMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: LAMBERT_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            diffuse: 0xffffffff,
            diffuse_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
        };
    }
}

flight_entity::impl_entity!(LambertMaterial);

impl Default for PhongMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: PHONG_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            diffuse: 0xffffffff,
            diffuse_map: None,
            normal_map: None,
            normal_scale: 1.0,
            shininess: 32.0,
            specular: 0xffffffff,
            specular_map: None,
        };
    }
}

flight_entity::impl_entity!(PhongMaterial);

impl Default for DepthMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: DEPTH_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            far: 1.0,
            near: 0.0,
        };
    }
}

flight_entity::impl_entity!(DepthMaterial);

impl Default for EmissiveMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: EMISSIVE_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            emissive: 0xffffffff,
            emissive_map: None,
            emissive_strength: 1.0,
        };
    }
}

flight_entity::impl_entity!(EmissiveMaterial);

impl Default for MatcapMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: MATCAP_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            matcap: None,
            tint: 0xffffffff,
        };
    }
}

flight_entity::impl_entity!(MatcapMaterial);

impl Default for NormalMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: NORMAL_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            normal_map: None,
            normal_scale: 1.0,
        };
    }
}

flight_entity::impl_entity!(NormalMaterial);

impl Default for ToonMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: TOON_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            base_color: 0xffffffff,
            base_color_map: None,
            ramp: None,
            steps: 3,
        };
    }
}

flight_entity::impl_entity!(ToonMaterial);

impl Default for UnlitMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: UNLIT_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            base_color: 0xffffffff,
            base_color_map: None,
        };
    }
}

flight_entity::impl_entity!(UnlitMaterial);

impl Default for VertexColorMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: VERTEX_COLOR_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            tint: 0xffffffff,
        };
    }
}

flight_entity::impl_entity!(VertexColorMaterial);

impl Default for WireframeMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: WIREFRAME_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            color: 0xffffffff,
            thickness: 1.0,
        };
    }
}

flight_entity::impl_entity!(WireframeMaterial);

impl Default for StandardPbrMaterialProperties {
    fn default() -> Self {
        return Self {
            alpha_map: None,
            base_color: 0xffffffff,
            base_color_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
            emissive_strength: 1.0,
            metallic: 0.0,
            metallic_roughness_map: None,
            normal_map: None,
            normal_scale: 1.0,
            occlusion_map: None,
            occlusion_strength: 1.0,
            roughness: 1.0,
        };
    }
}

impl Default for StandardPbrMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: STANDARD_PBR_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            alpha_map: None,
            base_color: 0xffffffff,
            base_color_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
            emissive_strength: 1.0,
            metallic: 0.0,
            metallic_roughness_map: None,
            normal_map: None,
            normal_scale: 1.0,
            occlusion_map: None,
            occlusion_strength: 1.0,
            roughness: 1.0,
        };
    }
}

flight_entity::impl_entity!(StandardPbrMaterial);

impl Default for SpecularGlossinessPbrMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            diffuse: 0xffffffff,
            diffuse_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
            emissive_strength: 1.0,
            glossiness: 1.0,
            normal_map: None,
            normal_scale: 1.0,
            occlusion_map: None,
            occlusion_strength: 1.0,
            specular: 0xffffffff,
            specular_glossiness_map: None,
        };
    }
}

flight_entity::impl_entity!(SpecularGlossinessPbrMaterial);

impl Default for ExtendedPbrMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: EXTENDED_PBR_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            extensions: Vec::new(),
            standard: StandardPbrMaterialProperties::default(),
        };
    }
}

flight_entity::impl_entity!(ExtendedPbrMaterial);

impl Default for CustomShaderMaterial {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: CUSTOM_SHADER_MATERIAL_KIND.to_string(),
            name: None,
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            double_sided: false,
            shader_key: String::new(),
            textures: None,
            uniforms: None,
        };
    }
}

flight_entity::impl_entity!(CustomShaderMaterial);

impl PbrExtension {
    pub fn kind(&self) -> &str {
        return crate::pbr_extension::get_pbr_extension_kind(self);
    }
}

impl Default for AnisotropyPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: ANISOTROPY_PBR_EXTENSION_KIND.to_string(),
            anisotropy_map: None,
            anisotropy_map_uv_set: 0,
            anisotropy_rotation: 0.0,
            anisotropy_strength: 0.0,
        };
    }
}

flight_entity::impl_entity!(AnisotropyPbrExtension);

impl Default for ClearcoatPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: CLEARCOAT_PBR_EXTENSION_KIND.to_string(),
            clearcoat: 0.0,
            clearcoat_map: None,
            clearcoat_map_uv_set: 0,
            clearcoat_normal_map: None,
            clearcoat_normal_map_uv_set: 0,
            clearcoat_normal_scale: 1.0,
            clearcoat_roughness: 0.0,
            clearcoat_roughness_map: None,
            clearcoat_roughness_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(ClearcoatPbrExtension);

impl Default for IridescencePbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: IRIDESCENCE_PBR_EXTENSION_KIND.to_string(),
            iridescence: 0.0,
            iridescence_ior: 1.3,
            iridescence_map: None,
            iridescence_map_uv_set: 0,
            iridescence_thickness_map: None,
            iridescence_thickness_map_uv_set: 0,
            iridescence_thickness_max: 400.0,
            iridescence_thickness_min: 100.0,
        };
    }
}

flight_entity::impl_entity!(IridescencePbrExtension);

impl Default for SheenPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: SHEEN_PBR_EXTENSION_KIND.to_string(),
            sheen_color: 0x000000ff,
            sheen_color_map: None,
            sheen_color_map_uv_set: 0,
            sheen_roughness: 0.0,
            sheen_roughness_map: None,
            sheen_roughness_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(SheenPbrExtension);

impl Default for SpecularPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: SPECULAR_PBR_EXTENSION_KIND.to_string(),
            specular: 1.0,
            specular_color: 0xffffffff,
            specular_color_map: None,
            specular_color_map_uv_set: 0,
            specular_map: None,
            specular_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(SpecularPbrExtension);

impl Default for TransmissionVolumePbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string(),
            attenuation_color: 0xffffffff,
            attenuation_distance: f32::INFINITY,
            ior: 1.5,
            thickness: 0.0,
            thickness_map: None,
            thickness_map_uv_set: 0,
            transmission: 0.0,
            transmission_map: None,
            transmission_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(TransmissionVolumePbrExtension);

impl Default for WrappedDiffusePbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: WRAPPED_DIFFUSE_PBR_EXTENSION_KIND.to_string(),
            thickness: 0.0,
            thickness_map: None,
            thickness_map_uv_set: 0,
            wrapped_diffuse_color: 0xffffffff,
            wrapped_diffuse_map: None,
            wrapped_diffuse_map_uv_set: 0,
            wrapped_diffuse_strength: 0.0,
        };
    }
}

flight_entity::impl_entity!(WrappedDiffusePbrExtension);

impl Default for ColorScaleBias {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            red_scale: 1.0,
            green_scale: 1.0,
            blue_scale: 1.0,
            alpha_scale: 1.0,
            red_bias: 0.0,
            green_bias: 0.0,
            blue_bias: 0.0,
            alpha_bias: 0.0,
        };
    }
}

flight_entity::impl_entity!(ColorScaleBias);
