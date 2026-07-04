//! Constructors and kind ids for glTF PBR extension surface materials:
//! [`AnisotropyPbrMaterial`], [`ClearcoatPbrMaterial`],
//! [`IridescencePbrMaterial`], [`SheenPbrMaterial`], [`SpecularPbrMaterial`],
//! [`SubsurfacePbrMaterial`], [`TransmissionVolumePbrMaterial`].

use flighthq_types::{
    AnisotropyPbrMaterial, ClearcoatPbrMaterial, IridescencePbrMaterial, KindId, SheenPbrMaterial,
    SpecularPbrMaterial, StandardPbrMaterialProperties, SubsurfacePbrMaterial, Texture,
    TransmissionVolumePbrMaterial,
};

use crate::surface_material::create_surface_material;

// ---------------------------------------------------------------------------
// Kind constants
// ---------------------------------------------------------------------------

/// Stable `KindId` for [`AnisotropyPbrMaterial`].
pub fn anisotropy_pbr_material_kind() -> KindId {
    KindId::of::<AnisotropyPbrMaterial>()
}

/// Stable `KindId` for [`ClearcoatPbrMaterial`].
pub fn clearcoat_pbr_material_kind() -> KindId {
    KindId::of::<ClearcoatPbrMaterial>()
}

/// Stable `KindId` for [`IridescencePbrMaterial`].
pub fn iridescence_pbr_material_kind() -> KindId {
    KindId::of::<IridescencePbrMaterial>()
}

/// Stable `KindId` for [`SheenPbrMaterial`].
pub fn sheen_pbr_material_kind() -> KindId {
    KindId::of::<SheenPbrMaterial>()
}

/// Stable `KindId` for [`SpecularPbrMaterial`].
pub fn specular_pbr_material_kind() -> KindId {
    KindId::of::<SpecularPbrMaterial>()
}

/// Stable `KindId` for [`SubsurfacePbrMaterial`].
pub fn subsurface_pbr_material_kind() -> KindId {
    KindId::of::<SubsurfacePbrMaterial>()
}

/// Stable `KindId` for [`TransmissionVolumePbrMaterial`].
pub fn transmission_volume_pbr_material_kind() -> KindId {
    KindId::of::<TransmissionVolumePbrMaterial>()
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`create_anisotropy_pbr_material`]. `anisotropy_strength`
/// defaults to 0 (isotropic), `anisotropy_rotation` to 0, the map to `None`.
/// `standard` defaults to [`StandardPbrMaterialProperties::default`].
#[derive(Clone, Debug, Default)]
pub struct AnisotropyPbrMaterialOptions {
    pub anisotropy_map: Option<Texture>,
    pub anisotropy_rotation: Option<f32>,
    pub anisotropy_strength: Option<f32>,
    pub standard: Option<StandardPbrMaterialProperties>,
}

/// Options for [`create_clearcoat_pbr_material`]. `clearcoat` defaults to 0
/// (disabled), `clearcoat_roughness` to 0, all maps to `None`. `standard`
/// defaults to [`StandardPbrMaterialProperties::default`].
#[derive(Clone, Debug, Default)]
pub struct ClearcoatPbrMaterialOptions {
    pub clearcoat: Option<f32>,
    pub clearcoat_map: Option<Texture>,
    pub clearcoat_normal_map: Option<Texture>,
    pub clearcoat_roughness: Option<f32>,
    pub clearcoat_roughness_map: Option<Texture>,
    pub standard: Option<StandardPbrMaterialProperties>,
}

/// Options for [`create_iridescence_pbr_material`]. `iridescence` defaults to
/// 0 (disabled), `iridescence_ior` to 1.3, the thickness range to glTF's
/// 100-400 nm, all maps to `None`. `standard` defaults to
/// [`StandardPbrMaterialProperties::default`].
#[derive(Clone, Debug, Default)]
pub struct IridescencePbrMaterialOptions {
    pub iridescence: Option<f32>,
    pub iridescence_ior: Option<f32>,
    pub iridescence_map: Option<Texture>,
    pub iridescence_thickness_map: Option<Texture>,
    pub iridescence_thickness_max: Option<f32>,
    pub iridescence_thickness_min: Option<f32>,
    pub standard: Option<StandardPbrMaterialProperties>,
}

/// Options for [`create_sheen_pbr_material`]. `sheen_color` defaults to
/// opaque black (disabled), `sheen_roughness` to 0, maps to `None`.
/// `standard` defaults to [`StandardPbrMaterialProperties::default`].
#[derive(Clone, Debug, Default)]
pub struct SheenPbrMaterialOptions {
    pub sheen_color: Option<u32>,
    pub sheen_color_map: Option<Texture>,
    pub sheen_roughness: Option<f32>,
    pub sheen_roughness_map: Option<Texture>,
    pub standard: Option<StandardPbrMaterialProperties>,
}

/// Options for [`create_specular_pbr_material`]. `specular` defaults to 1
/// (full), `specular_color` to white, maps to `None`. `standard` defaults to
/// [`StandardPbrMaterialProperties::default`].
#[derive(Clone, Debug, Default)]
pub struct SpecularPbrMaterialOptions {
    pub specular: Option<f32>,
    pub specular_color: Option<u32>,
    pub specular_color_map: Option<Texture>,
    pub specular_map: Option<Texture>,
    pub standard: Option<StandardPbrMaterialProperties>,
}

/// Options for [`create_subsurface_pbr_material`]. `subsurface` defaults to 0
/// (disabled), `subsurface_color` to white, `thickness` to 0, maps to `None`.
/// `standard` defaults to [`StandardPbrMaterialProperties::default`].
#[derive(Clone, Debug, Default)]
pub struct SubsurfacePbrMaterialOptions {
    pub standard: Option<StandardPbrMaterialProperties>,
    pub subsurface: Option<f32>,
    pub subsurface_color: Option<u32>,
    pub subsurface_map: Option<Texture>,
    pub thickness: Option<f32>,
    pub thickness_map: Option<Texture>,
}

/// Options for [`create_transmission_volume_pbr_material`]. `transmission`
/// defaults to 0 (opaque), `thickness` to 0, `attenuation_color` to white,
/// `attenuation_distance` to `f32::INFINITY` (no absorption), `ior` to
/// glTF's 1.5, maps to `None`. `standard` defaults to
/// [`StandardPbrMaterialProperties::default`].
#[derive(Clone, Debug, Default)]
pub struct TransmissionVolumePbrMaterialOptions {
    pub attenuation_color: Option<u32>,
    pub attenuation_distance: Option<f32>,
    pub ior: Option<f32>,
    pub standard: Option<StandardPbrMaterialProperties>,
    pub thickness: Option<f32>,
    pub thickness_map: Option<Texture>,
    pub transmission: Option<f32>,
    pub transmission_map: Option<Texture>,
}

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// KHR_materials_anisotropy: a directionally-stretched specular lobe.
/// `anisotropy_strength` defaults to 0 (isotropic), `anisotropy_rotation` to
/// 0, the map to `None`. Composes a default `standard` block.
pub fn create_anisotropy_pbr_material(
    options: &AnisotropyPbrMaterialOptions,
) -> AnisotropyPbrMaterial {
    let trailer = create_surface_material(anisotropy_pbr_material_kind());
    AnisotropyPbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        anisotropy_map: options.anisotropy_map.clone(),
        anisotropy_rotation: options.anisotropy_rotation.unwrap_or(0.0),
        anisotropy_strength: options.anisotropy_strength.unwrap_or(0.0),
        standard: options.standard.clone().unwrap_or_default(),
    }
}

/// KHR_materials_clearcoat: a second specular lobe over the base PBR layer.
/// `clearcoat` defaults to 0 (disabled), `clearcoat_roughness` to 0, all maps
/// to `None`. Composes a default `standard` block.
pub fn create_clearcoat_pbr_material(
    options: &ClearcoatPbrMaterialOptions,
) -> ClearcoatPbrMaterial {
    let trailer = create_surface_material(clearcoat_pbr_material_kind());
    ClearcoatPbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        clearcoat: options.clearcoat.unwrap_or(0.0),
        clearcoat_map: options.clearcoat_map.clone(),
        clearcoat_normal_map: options.clearcoat_normal_map.clone(),
        clearcoat_roughness: options.clearcoat_roughness.unwrap_or(0.0),
        clearcoat_roughness_map: options.clearcoat_roughness_map.clone(),
        standard: options.standard.clone().unwrap_or_default(),
    }
}

/// KHR_materials_iridescence: thin-film interference. `iridescence` defaults
/// to 0 (disabled), `iridescence_ior` to 1.3, the thickness range to glTF's
/// 100-400 nm, all maps to `None`. Composes a default `standard` block.
pub fn create_iridescence_pbr_material(
    options: &IridescencePbrMaterialOptions,
) -> IridescencePbrMaterial {
    let trailer = create_surface_material(iridescence_pbr_material_kind());
    IridescencePbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        iridescence: options.iridescence.unwrap_or(0.0),
        iridescence_ior: options.iridescence_ior.unwrap_or(1.3),
        iridescence_map: options.iridescence_map.clone(),
        iridescence_thickness_map: options.iridescence_thickness_map.clone(),
        iridescence_thickness_max: options.iridescence_thickness_max.unwrap_or(400.0),
        iridescence_thickness_min: options.iridescence_thickness_min.unwrap_or(100.0),
        standard: options.standard.clone().unwrap_or_default(),
    }
}

/// KHR_materials_sheen: a retroreflective cloth/fabric lobe. `sheen_color`
/// defaults to opaque black (disabled), `sheen_roughness` to 0, maps to
/// `None`. Composes a default `standard` block.
pub fn create_sheen_pbr_material(options: &SheenPbrMaterialOptions) -> SheenPbrMaterial {
    let trailer = create_surface_material(sheen_pbr_material_kind());
    SheenPbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        sheen_color: options.sheen_color.unwrap_or(0x000000ff),
        sheen_color_map: options.sheen_color_map.clone(),
        sheen_roughness: options.sheen_roughness.unwrap_or(0.0),
        sheen_roughness_map: options.sheen_roughness_map.clone(),
        standard: options.standard.clone().unwrap_or_default(),
    }
}

/// KHR_materials_specular: independent dielectric specular strength and
/// tint. `specular` defaults to 1 (full), `specular_color` to white, maps to
/// `None`. Composes a default `standard` block.
pub fn create_specular_pbr_material(options: &SpecularPbrMaterialOptions) -> SpecularPbrMaterial {
    let trailer = create_surface_material(specular_pbr_material_kind());
    SpecularPbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        specular: options.specular.unwrap_or(1.0),
        specular_color: options.specular_color.unwrap_or(0xffffffff),
        specular_color_map: options.specular_color_map.clone(),
        specular_map: options.specular_map.clone(),
        standard: options.standard.clone().unwrap_or_default(),
    }
}

/// Flight subsurface-scattering extension (wrapped-diffuse approximation).
/// `subsurface` defaults to 0 (disabled), `subsurface_color` to white,
/// `thickness` to 0, maps to `None`. Composes a default `standard` block.
pub fn create_subsurface_pbr_material(
    options: &SubsurfacePbrMaterialOptions,
) -> SubsurfacePbrMaterial {
    let trailer = create_surface_material(subsurface_pbr_material_kind());
    SubsurfacePbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        standard: options.standard.clone().unwrap_or_default(),
        subsurface: options.subsurface.unwrap_or(0.0),
        subsurface_color: options.subsurface_color.unwrap_or(0xffffffff),
        subsurface_map: options.subsurface_map.clone(),
        thickness: options.thickness.unwrap_or(0.0),
        thickness_map: options.thickness_map.clone(),
    }
}

/// KHR_materials_transmission + KHR_materials_volume: refractive, see-through
/// surfaces. `transmission` defaults to 0 (opaque), `thickness` to 0,
/// `attenuation_color` to white, `attenuation_distance` to `f32::INFINITY`
/// (no absorption), `ior` to glTF's 1.5, maps to `None`. Composes a default
/// `standard` block.
pub fn create_transmission_volume_pbr_material(
    options: &TransmissionVolumePbrMaterialOptions,
) -> TransmissionVolumePbrMaterial {
    let trailer = create_surface_material(transmission_volume_pbr_material_kind());
    TransmissionVolumePbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        attenuation_color: options.attenuation_color.unwrap_or(0xffffffff),
        attenuation_distance: options.attenuation_distance.unwrap_or(f32::INFINITY),
        ior: options.ior.unwrap_or(1.5),
        standard: options.standard.clone().unwrap_or_default(),
        thickness: options.thickness.unwrap_or(0.0),
        thickness_map: options.thickness_map.clone(),
        transmission: options.transmission.unwrap_or(0.0),
        transmission_map: options.transmission_map.clone(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_types::Material;

    use super::*;

    // create_anisotropy_pbr_material
    #[test]
    fn create_anisotropy_pbr_material_applies_defaults() {
        let m = create_anisotropy_pbr_material(&AnisotropyPbrMaterialOptions::default());
        assert_eq!(m.kind(), anisotropy_pbr_material_kind());
        assert_eq!(m.anisotropy_strength, 0.0);
        assert_eq!(m.anisotropy_rotation, 0.0);
        assert!(m.anisotropy_map.is_none());
    }

    // create_clearcoat_pbr_material
    #[test]
    fn create_clearcoat_pbr_material_applies_defaults() {
        let m = create_clearcoat_pbr_material(&ClearcoatPbrMaterialOptions::default());
        assert_eq!(m.kind(), clearcoat_pbr_material_kind());
        assert_eq!(m.clearcoat, 0.0);
        assert_eq!(m.clearcoat_roughness, 0.0);
    }

    // create_iridescence_pbr_material
    #[test]
    fn create_iridescence_pbr_material_applies_defaults() {
        let m = create_iridescence_pbr_material(&IridescencePbrMaterialOptions::default());
        assert_eq!(m.kind(), iridescence_pbr_material_kind());
        assert_eq!(m.iridescence, 0.0);
        assert_eq!(m.iridescence_ior, 1.3);
        assert_eq!(m.iridescence_thickness_min, 100.0);
        assert_eq!(m.iridescence_thickness_max, 400.0);
    }

    // create_sheen_pbr_material
    #[test]
    fn create_sheen_pbr_material_applies_defaults() {
        let m = create_sheen_pbr_material(&SheenPbrMaterialOptions::default());
        assert_eq!(m.kind(), sheen_pbr_material_kind());
        assert_eq!(m.sheen_color, 0x000000ff);
        assert_eq!(m.sheen_roughness, 0.0);
    }

    // create_specular_pbr_material
    #[test]
    fn create_specular_pbr_material_applies_defaults() {
        let m = create_specular_pbr_material(&SpecularPbrMaterialOptions::default());
        assert_eq!(m.kind(), specular_pbr_material_kind());
        assert_eq!(m.specular, 1.0);
        assert_eq!(m.specular_color, 0xffffffff);
    }

    // create_subsurface_pbr_material
    #[test]
    fn create_subsurface_pbr_material_applies_defaults() {
        let m = create_subsurface_pbr_material(&SubsurfacePbrMaterialOptions::default());
        assert_eq!(m.kind(), subsurface_pbr_material_kind());
        assert_eq!(m.subsurface, 0.0);
        assert_eq!(m.subsurface_color, 0xffffffff);
        assert_eq!(m.thickness, 0.0);
    }

    // create_transmission_volume_pbr_material
    #[test]
    fn create_transmission_volume_pbr_material_applies_defaults() {
        let m = create_transmission_volume_pbr_material(
            &TransmissionVolumePbrMaterialOptions::default(),
        );
        assert_eq!(m.kind(), transmission_volume_pbr_material_kind());
        assert_eq!(m.transmission, 0.0);
        assert_eq!(m.ior, 1.5);
        assert!(m.attenuation_distance.is_infinite());
        assert_eq!(m.attenuation_color, 0xffffffff);
    }

    #[test]
    fn create_transmission_volume_pbr_material_carries_provided_values() {
        let m = create_transmission_volume_pbr_material(&TransmissionVolumePbrMaterialOptions {
            transmission: Some(1.0),
            ior: Some(1.33),
            ..Default::default()
        });
        assert_eq!(m.transmission, 1.0);
        assert_eq!(m.ior, 1.33);
    }

    // kind stability / uniqueness
    #[test]
    fn pbr_extension_kinds_are_stable() {
        assert_eq!(
            anisotropy_pbr_material_kind(),
            anisotropy_pbr_material_kind()
        );
        assert_eq!(clearcoat_pbr_material_kind(), clearcoat_pbr_material_kind());
        assert_eq!(
            iridescence_pbr_material_kind(),
            iridescence_pbr_material_kind()
        );
        assert_eq!(sheen_pbr_material_kind(), sheen_pbr_material_kind());
        assert_eq!(specular_pbr_material_kind(), specular_pbr_material_kind());
        assert_eq!(
            subsurface_pbr_material_kind(),
            subsurface_pbr_material_kind()
        );
        assert_eq!(
            transmission_volume_pbr_material_kind(),
            transmission_volume_pbr_material_kind()
        );
    }

    #[test]
    fn pbr_extension_kinds_are_distinct() {
        let kinds = [
            anisotropy_pbr_material_kind(),
            clearcoat_pbr_material_kind(),
            iridescence_pbr_material_kind(),
            sheen_pbr_material_kind(),
            specular_pbr_material_kind(),
            subsurface_pbr_material_kind(),
            transmission_volume_pbr_material_kind(),
        ];
        for (i, a) in kinds.iter().enumerate() {
            for (j, b) in kinds.iter().enumerate() {
                if i != j {
                    assert_ne!(a, b);
                }
            }
        }
    }
}
