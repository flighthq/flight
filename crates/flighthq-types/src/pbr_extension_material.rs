//! glTF PBR extension surface material header types: [`AnisotropyPbrMaterial`],
//! [`ClearcoatPbrMaterial`], [`IridescencePbrMaterial`], [`SheenPbrMaterial`],
//! [`SpecularPbrMaterial`], [`SubsurfacePbrMaterial`],
//! [`TransmissionVolumePbrMaterial`], [`SpecularGlossinessPbrMaterial`].
//!
//! Ports `@flighthq/types`' `AnisotropyPbrMaterial.ts` /
//! `ClearcoatPbrMaterial.ts` / `IridescencePbrMaterial.ts` /
//! `SheenPbrMaterial.ts` / `SpecularPbrMaterial.ts` /
//! `SubsurfacePbrMaterial.ts` / `TransmissionVolumePbrMaterial.ts` /
//! `SpecularGlossinessPbrMaterial.ts`. Every extension composes (not
//! inherits) a [`StandardPbrMaterialProperties`] `standard` block, matching
//! the TS design (D4). Constructors and kind ids live in `flighthq-materials`
//! (`pbr_extension_materials.rs` / `pbr_materials.rs`).

use crate::alpha::AlphaType;
use crate::blend::BlendMode;
use crate::entity::Entity;
use crate::kind::KindId;
use crate::material::Material;
use crate::pbr_material::{MaterialAlphaMode, StandardPbrMaterialProperties, SurfaceMaterial};
use crate::texture::Texture;

/// KHR_materials_anisotropy: a directionally-stretched specular lobe (brushed
/// metal, hair). Requires mesh tangents. Composes the `standard` base block.
/// `anisotropy_strength` is the lobe stretch `[0,1]`, `anisotropy_rotation`
/// rotates the tangent-space direction (radians), and `anisotropy_map`
/// supplies a per-texel direction + strength.
#[derive(Clone, Debug)]
pub struct AnisotropyPbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub anisotropy_map: Option<Texture>,
    pub anisotropy_rotation: f32,
    pub anisotropy_strength: f32,
    pub standard: StandardPbrMaterialProperties,
}

impl Entity for AnisotropyPbrMaterial {}

impl Material for AnisotropyPbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for AnisotropyPbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// KHR_materials_clearcoat: a second specular lobe over the base PBR layer
/// (car paint, lacquer). Composes the `standard` base block. `clearcoat` is
/// the layer strength `[0,1]`, `clearcoat_roughness` its roughness; the maps
/// modulate them and `clearcoat_normal_map` perturbs the clearcoat normal
/// independently of the base.
#[derive(Clone, Debug)]
pub struct ClearcoatPbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub clearcoat: f32,
    pub clearcoat_map: Option<Texture>,
    pub clearcoat_normal_map: Option<Texture>,
    pub clearcoat_roughness: f32,
    pub clearcoat_roughness_map: Option<Texture>,
    pub standard: StandardPbrMaterialProperties,
}

impl Entity for ClearcoatPbrMaterial {}

impl Material for ClearcoatPbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for ClearcoatPbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// KHR_materials_iridescence: thin-film interference producing
/// view-dependent rainbow shifts (soap bubble, oil slick). Composes the
/// `standard` base block. `iridescence` is the effect strength `[0,1]` (with
/// `iridescence_map`); `iridescence_ior` is the thin-film index of
/// refraction; `iridescence_thickness_min`/`iridescence_thickness_max` bound
/// the film thickness in nanometers, interpolated by
/// `iridescence_thickness_map`.
#[derive(Clone, Debug)]
pub struct IridescencePbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub iridescence: f32,
    pub iridescence_ior: f32,
    pub iridescence_map: Option<Texture>,
    pub iridescence_thickness_map: Option<Texture>,
    pub iridescence_thickness_max: f32,
    pub iridescence_thickness_min: f32,
    pub standard: StandardPbrMaterialProperties,
}

impl Entity for IridescencePbrMaterial {}

impl Material for IridescencePbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for IridescencePbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// KHR_materials_sheen: a retroreflective sheen lobe for cloth/fabric.
/// Composes the `standard` base block. `sheen_color` is packed sRGB-albedo
/// RGBA, `sheen_color_map` tints it, `sheen_roughness` controls the lobe
/// width, and `sheen_roughness_map` modulates it.
#[derive(Clone, Debug)]
pub struct SheenPbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub sheen_color: u32,
    pub sheen_color_map: Option<Texture>,
    pub sheen_roughness: f32,
    pub sheen_roughness_map: Option<Texture>,
    pub standard: StandardPbrMaterialProperties,
}

impl Entity for SheenPbrMaterial {}

impl Material for SheenPbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for SheenPbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// KHR_materials_specular: independent control of the dielectric specular
/// reflection strength and tint. Composes the `standard` base block.
/// `specular` scales the specular reflection `[0,1]` (with `specular_map` in
/// its alpha); `specular_color` is packed sRGB-albedo RGBA tinting the F0
/// reflectance (with `specular_color_map`).
#[derive(Clone, Debug)]
pub struct SpecularPbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub specular: f32,
    pub specular_color: u32,
    pub specular_color_map: Option<Texture>,
    pub specular_map: Option<Texture>,
    pub standard: StandardPbrMaterialProperties,
}

impl Entity for SpecularPbrMaterial {}

impl Material for SpecularPbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for SpecularPbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// Flight subsurface-scattering extension (wrapped-diffuse approximation;
/// flagged non-interop — no glTF equivalent). Composes the `standard` base
/// block. `subsurface` is the scattering strength `[0,1]` (with
/// `subsurface_map`); `subsurface_color` is packed sRGB-albedo RGBA tinting
/// the scattered light; `thickness` is the local-space material thickness
/// (with `thickness_map`) that governs how far light penetrates.
#[derive(Clone, Debug)]
pub struct SubsurfacePbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub standard: StandardPbrMaterialProperties,
    pub subsurface: f32,
    pub subsurface_color: u32,
    pub subsurface_map: Option<Texture>,
    pub thickness: f32,
    pub thickness_map: Option<Texture>,
}

impl Entity for SubsurfacePbrMaterial {}

impl Material for SubsurfacePbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for SubsurfacePbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// KHR_materials_transmission + KHR_materials_volume: refractive, see-through
/// surfaces with volumetric absorption (glass, liquid). Composes the
/// `standard` base block. `transmission` is the surface transmission factor
/// `[0,1]` (with `transmission_map`); `thickness` is the volume thickness in
/// local units (with `thickness_map`); `attenuation_color` is packed
/// sRGB-albedo RGBA tinting transmitted light; `attenuation_distance` is the
/// absorption falloff distance; `ior` is the index of refraction.
#[derive(Clone, Debug)]
pub struct TransmissionVolumePbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub attenuation_color: u32,
    pub attenuation_distance: f32,
    pub ior: f32,
    pub standard: StandardPbrMaterialProperties,
    pub thickness: f32,
    pub thickness_map: Option<Texture>,
    pub transmission: f32,
    pub transmission_map: Option<Texture>,
}

impl Entity for TransmissionVolumePbrMaterial {}

impl Material for TransmissionVolumePbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for TransmissionVolumePbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// Legacy specular-glossiness PBR workflow (converted to metallic-roughness
/// at bind). `diffuse` and `specular` are packed sRGB-albedo RGBA;
/// `glossiness` is the inverse of roughness. `specular_glossiness_map` packs
/// specular in RGB and glossiness in A. `emissive`/`emissive_map`,
/// `normal_map`/`normal_scale`, and `occlusion_map`/`occlusion_strength`
/// match the standard block.
#[derive(Clone, Debug)]
pub struct SpecularGlossinessPbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub diffuse: u32,
    pub diffuse_map: Option<Texture>,
    pub emissive: u32,
    pub emissive_map: Option<Texture>,
    pub emissive_strength: f32,
    pub glossiness: f32,
    pub normal_map: Option<Texture>,
    pub normal_scale: f32,
    pub occlusion_map: Option<Texture>,
    pub occlusion_strength: f32,
    pub specular: u32,
    pub specular_glossiness_map: Option<Texture>,
}

impl Entity for SpecularGlossinessPbrMaterial {}

impl Material for SpecularGlossinessPbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for SpecularGlossinessPbrMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}
