//! Constructors and kind ids for classic (non-PBR) surface materials:
//! [`BlinnPhongMaterial`], [`LambertMaterial`], [`PhongMaterial`].

use flighthq_types::{BlinnPhongMaterial, KindId, LambertMaterial, PhongMaterial, Texture};

use crate::surface_material::create_surface_material;

// ---------------------------------------------------------------------------
// Kind constants
// ---------------------------------------------------------------------------

/// Stable `KindId` for [`BlinnPhongMaterial`].
pub fn blinn_phong_material_kind() -> KindId {
    KindId::of::<BlinnPhongMaterial>()
}

/// Stable `KindId` for [`LambertMaterial`].
pub fn lambert_material_kind() -> KindId {
    KindId::of::<LambertMaterial>()
}

/// Stable `KindId` for [`PhongMaterial`].
pub fn phong_material_kind() -> KindId {
    KindId::of::<PhongMaterial>()
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`create_blinn_phong_material`]. Mirrors the TS
/// `Partial<BlinnPhongMaterial>` opts object; every field defaults as it does
/// in TS (`diffuse`/`specular` white, `shininess` 32, `normal_scale` 1, all
/// maps absent).
#[derive(Clone, Debug, Default)]
pub struct BlinnPhongMaterialOptions {
    pub diffuse: Option<u32>,
    pub diffuse_map: Option<Texture>,
    pub normal_map: Option<Texture>,
    pub normal_scale: Option<f32>,
    pub shininess: Option<f32>,
    pub specular: Option<u32>,
    pub specular_map: Option<Texture>,
}

/// Options for [`create_lambert_material`]. Mirrors the TS
/// `Partial<LambertMaterial>` opts object; `diffuse` defaults to white,
/// `emissive` to opaque black (no self-illumination), both maps absent.
#[derive(Clone, Debug, Default)]
pub struct LambertMaterialOptions {
    pub diffuse: Option<u32>,
    pub diffuse_map: Option<Texture>,
    pub emissive: Option<u32>,
    pub emissive_map: Option<Texture>,
}

/// Options for [`create_phong_material`]. Mirrors the TS
/// `Partial<PhongMaterial>` opts object; every field defaults as it does in
/// TS (`diffuse`/`specular` white, `shininess` 32, `normal_scale` 1, all maps
/// absent).
#[derive(Clone, Debug, Default)]
pub struct PhongMaterialOptions {
    pub diffuse: Option<u32>,
    pub diffuse_map: Option<Texture>,
    pub normal_map: Option<Texture>,
    pub normal_scale: Option<f32>,
    pub shininess: Option<f32>,
    pub specular: Option<u32>,
    pub specular_map: Option<Texture>,
}

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Classic Blinn-Phong material: diffuse plus a half-vector specular lobe.
/// `diffuse`/`specular` default to white, `shininess` to 32, `normal_scale`
/// to 1, all maps to `None`.
pub fn create_blinn_phong_material(options: &BlinnPhongMaterialOptions) -> BlinnPhongMaterial {
    let trailer = create_surface_material(blinn_phong_material_kind());
    BlinnPhongMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        diffuse: options.diffuse.unwrap_or(0xffffffff),
        diffuse_map: options.diffuse_map.clone(),
        normal_map: options.normal_map.clone(),
        normal_scale: options.normal_scale.unwrap_or(1.0),
        shininess: options.shininess.unwrap_or(32.0),
        specular: options.specular.unwrap_or(0xffffffff),
        specular_map: options.specular_map.clone(),
    }
}

/// Classic diffuse-only Lambertian material. `diffuse` defaults to white,
/// `emissive` to opaque black (no self-illumination), both maps to `None`.
pub fn create_lambert_material(options: &LambertMaterialOptions) -> LambertMaterial {
    let trailer = create_surface_material(lambert_material_kind());
    LambertMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        diffuse: options.diffuse.unwrap_or(0xffffffff),
        diffuse_map: options.diffuse_map.clone(),
        emissive: options.emissive.unwrap_or(0x000000ff),
        emissive_map: options.emissive_map.clone(),
    }
}

/// Classic Phong material: diffuse plus a reflection-vector specular lobe.
/// `diffuse`/`specular` default to white, `shininess` to 32, `normal_scale`
/// to 1, all maps to `None`.
pub fn create_phong_material(options: &PhongMaterialOptions) -> PhongMaterial {
    let trailer = create_surface_material(phong_material_kind());
    PhongMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        diffuse: options.diffuse.unwrap_or(0xffffffff),
        diffuse_map: options.diffuse_map.clone(),
        normal_map: options.normal_map.clone(),
        normal_scale: options.normal_scale.unwrap_or(1.0),
        shininess: options.shininess.unwrap_or(32.0),
        specular: options.specular.unwrap_or(0xffffffff),
        specular_map: options.specular_map.clone(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_types::Material;

    use super::*;

    // blinn_phong_material_kind
    #[test]
    fn blinn_phong_material_kind_is_stable() {
        assert_eq!(blinn_phong_material_kind(), blinn_phong_material_kind());
    }

    // create_blinn_phong_material
    #[test]
    fn create_blinn_phong_material_applies_defaults() {
        let m = create_blinn_phong_material(&BlinnPhongMaterialOptions::default());
        assert_eq!(m.kind(), blinn_phong_material_kind());
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.shininess, 32.0);
        assert_eq!(m.normal_scale, 1.0);
        assert!(m.diffuse_map.is_none());
        assert!(m.normal_map.is_none());
        assert!(m.specular_map.is_none());
        assert!(!m.double_sided);
    }

    #[test]
    fn create_blinn_phong_material_carries_provided_values() {
        let m = create_blinn_phong_material(&BlinnPhongMaterialOptions {
            diffuse: Some(0x112233ff),
            shininess: Some(64.0),
            ..Default::default()
        });
        assert_eq!(m.diffuse, 0x112233ff);
        assert_eq!(m.shininess, 64.0);
    }

    // create_lambert_material
    #[test]
    fn create_lambert_material_applies_defaults() {
        let m = create_lambert_material(&LambertMaterialOptions::default());
        assert_eq!(m.kind(), lambert_material_kind());
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.emissive, 0x000000ff);
        assert!(m.diffuse_map.is_none());
        assert!(m.emissive_map.is_none());
    }

    #[test]
    fn create_lambert_material_carries_provided_values() {
        let m = create_lambert_material(&LambertMaterialOptions {
            emissive: Some(0xff0000ff),
            ..Default::default()
        });
        assert_eq!(m.emissive, 0xff0000ff);
    }

    // create_phong_material
    #[test]
    fn create_phong_material_applies_defaults() {
        let m = create_phong_material(&PhongMaterialOptions::default());
        assert_eq!(m.kind(), phong_material_kind());
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.shininess, 32.0);
        assert_eq!(m.normal_scale, 1.0);
    }

    #[test]
    fn create_phong_material_carries_provided_values() {
        let m = create_phong_material(&PhongMaterialOptions {
            specular: Some(0x00ff00ff),
            ..Default::default()
        });
        assert_eq!(m.specular, 0x00ff00ff);
    }

    // lambert_material_kind
    #[test]
    fn lambert_material_kind_is_stable() {
        assert_eq!(lambert_material_kind(), lambert_material_kind());
    }

    // phong_material_kind
    #[test]
    fn phong_material_kind_is_stable() {
        assert_eq!(phong_material_kind(), phong_material_kind());
    }

    #[test]
    fn classic_material_kinds_are_distinct() {
        assert_ne!(blinn_phong_material_kind(), lambert_material_kind());
        assert_ne!(lambert_material_kind(), phong_material_kind());
        assert_ne!(blinn_phong_material_kind(), phong_material_kind());
    }
}
