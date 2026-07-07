//! PBR surface-material header types for the 3D scene render path.
//!
//! Ports `@flighthq/types`' `SurfaceMaterial` and `StandardPbrMaterial`: the
//! shared 3D surface trailer and the core glTF metallic-roughness PBR material.
//! These are the material fields the scene mesh-material registries
//! (`flighthq-scene-gl` / `flighthq-scene-wgpu`) read when binding the StandardPbr
//! uber-shader, so they live in the header rather than as backend-local stubs.

use crate::alpha::AlphaType;
use crate::blend::BlendMode;
use crate::entity::Entity;
use crate::kind::KindId;
use crate::material::Material;
use crate::texture::Texture;

/// How a material resolves coverage. Mirrors glTF: `Opaque` ignores `base_color`
/// alpha, `Mask` hard-cuts at `alpha_cutoff` (no blending), `Blend` alpha-blends.
/// Distinct from [`BlendMode`] (the blend equation) and from [`AlphaType`] (how a
/// texture's pixels encode alpha).
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum MaterialAlphaMode {
    #[default]
    Opaque,
    Mask,
    Blend,
}

/// Shared trailer for every 3D surface material (the fields common across the
/// surface-material taxonomy). Concrete materials extend this and add their own
/// maps/scalars. `alpha_cutoff` applies only when `alpha_mode` is
/// [`MaterialAlphaMode::Mask`]. `double_sided` disables back-face culling.
/// `blend_mode` reuses the 2D blend enum so additive/multiply are expressible.
/// `alpha_type` declares whether this material's blended output is premultiplied
/// or straight.
pub trait SurfaceMaterial: Material {
    fn alpha_cutoff(&self) -> f32;
    fn alpha_mode(&self) -> MaterialAlphaMode;
    fn alpha_type(&self) -> AlphaType;
    fn blend_mode(&self) -> BlendMode;
    fn double_sided(&self) -> bool;
}

/// A structural [`SurfaceMaterial`]-like value carrying only the shared trailer
/// (the `EntityWithoutRuntime<SurfaceMaterial>` analog, mirroring `MaterialLike`
/// for the plain [`Material`] trait). Every 3D material constructor starts from
/// this trailer at its defaults and extends it with its own maps and scalars.
#[derive(Clone, Debug)]
pub struct SurfaceMaterialLike {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
}

/// The metallic-roughness PBR field-block shared by [`StandardPbrMaterial`] and
/// composed (not inherited) by every PBR-extension material as their `standard`
/// block. Pure descriptor fields, no `kind` and no trailer. `base_color`/
/// `emissive` are packed sRGB-albedo RGBA; metallic-roughness, normal, and
/// occlusion maps are linear data. `occlusion_strength` and `normal_scale` scale
/// their map contributions; `emissive_strength` > 1 drives bloom.
#[derive(Clone, Debug)]
pub struct StandardPbrMaterialProperties {
    pub base_color: u32,
    pub base_color_map: Option<Texture>,
    pub emissive: u32,
    pub emissive_map: Option<Texture>,
    pub emissive_strength: f32,
    pub metallic: f32,
    pub metallic_roughness_map: Option<Texture>,
    pub normal_map: Option<Texture>,
    pub normal_scale: f32,
    pub occlusion_map: Option<Texture>,
    pub occlusion_strength: f32,
    pub roughness: f32,
}

// Defaults mirror `createStandardPbrMaterialProperties`: white `base_color`,
// fully dielectric (`metallic` 0) and fully rough (`roughness` 1), opaque-black
// `emissive` at unit strength, unit `normal_scale`/`occlusion_strength`, all maps
// absent.
impl Default for StandardPbrMaterialProperties {
    fn default() -> Self {
        Self {
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
        }
    }
}

/// Core glTF metallic-roughness PBR material: the
/// [`StandardPbrMaterialProperties`] block plus the shared surface trailer and its
/// kind. The StandardPbr mesh-material renderers read these fields to select the
/// uber-shader variant and upload its scalar/color/texture uniforms.
#[derive(Clone, Debug)]
pub struct StandardPbrMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub standard: StandardPbrMaterialProperties,
}

// Defaults mirror `createSurfaceMaterial` + `createStandardPbrMaterial`: opaque,
// single-sided, straight alpha, Normal blend, a 0.5 mask cutoff, the metallic-
// roughness property defaults, and the StandardPbr kind.
impl Default for StandardPbrMaterial {
    fn default() -> Self {
        Self {
            kind: standard_pbr_material_kind(),
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            alpha_type: AlphaType::Straight,
            blend_mode: BlendMode::Normal,
            double_sided: false,
            standard: StandardPbrMaterialProperties::default(),
        }
    }
}

impl Entity for StandardPbrMaterial {}

impl Material for StandardPbrMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for StandardPbrMaterial {
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

/// Name of the StandardPbr material kind. Mirrors the TS `StandardPbrMaterialKind`
/// string constant; the registries register the StandardPbr renderer against
/// [`standard_pbr_material_kind`].
pub const STANDARD_PBR_MATERIAL_KIND_NAME: &str = "StandardPbrMaterial";

/// The [`KindId`] the StandardPbr material registers against. Type-derived so
/// every crate that imports it resolves the same id (the Rust analog of the shared
/// TS `StandardPbrMaterialKind` string key).
pub fn standard_pbr_material_kind() -> KindId {
    KindId::of::<StandardPbrMaterialKindMarker>()
}

/// Zero-sized marker whose `TypeId` backs [`standard_pbr_material_kind`].
struct StandardPbrMaterialKindMarker;

#[cfg(test)]
mod tests {
    use super::*;

    // standard_pbr_material_kind

    #[test]
    fn standard_pbr_material_kind_is_stable() {
        assert_eq!(standard_pbr_material_kind(), standard_pbr_material_kind());
    }

    // StandardPbrMaterial

    #[test]
    fn standard_pbr_material_default_matches_the_metallic_roughness_defaults() {
        let material = StandardPbrMaterial::default();
        assert_eq!(material.kind, standard_pbr_material_kind());
        assert_eq!(material.alpha_cutoff, 0.5);
        assert_eq!(material.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(material.alpha_type, AlphaType::Straight);
        assert_eq!(material.blend_mode, BlendMode::Normal);
        assert!(!material.double_sided);
        assert_eq!(material.standard.base_color, 0xffffffff);
        assert_eq!(material.standard.metallic, 0.0);
        assert_eq!(material.standard.roughness, 1.0);
    }

    #[test]
    fn standard_pbr_material_reads_through_the_surface_material_trailer() {
        let material = StandardPbrMaterial::default();
        let surface: &dyn SurfaceMaterial = &material;
        assert_eq!(surface.alpha_mode(), MaterialAlphaMode::Opaque);
        assert!(!surface.double_sided());
        assert_eq!(surface.kind(), standard_pbr_material_kind());
    }

    // StandardPbrMaterialProperties

    #[test]
    fn standard_pbr_material_properties_default_is_white_dielectric_and_rough() {
        let properties = StandardPbrMaterialProperties::default();
        assert_eq!(properties.base_color, 0xffffffff);
        assert_eq!(properties.emissive, 0x000000ff);
        assert_eq!(properties.emissive_strength, 1.0);
        assert_eq!(properties.metallic, 0.0);
        assert_eq!(properties.roughness, 1.0);
        assert_eq!(properties.normal_scale, 1.0);
        assert_eq!(properties.occlusion_strength, 1.0);
        assert!(properties.base_color_map.is_none());
    }
}
