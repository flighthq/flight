//! Named presets for common real-world materials using glTF metallic-roughness
//! PBR values.
//!
//! These are thin wrappers over [`create_standard_pbr_material`] /
//! [`create_transmission_volume_pbr_material`] with canonical default
//! parameters. Each function is individually tree-shakable (importable on its
//! own).
//!
//! IOR and specular-tint values follow the glTF PBR extensions specification
//! and standard material-science references (BRDF Explorer, Substance
//! Painter's material presets, etc.).
//!
//! Each preset's own defining fields (the ones named in its doc comment)
//! always win over `options` — unlike the TS `Partial<T>` opts object, a Rust
//! options struct is not partial, so honoring a caller override on those
//! specific fields would silently discard the values that make the preset
//! recognizable. All other fields (maps, alpha mode, etc.) pass through from
//! `options` unchanged.

use flighthq_types::{StandardPbrMaterial, TransmissionVolumePbrMaterial};

use crate::pbr_extension_materials::{
    TransmissionVolumePbrMaterialOptions, create_transmission_volume_pbr_material,
};
use crate::pbr_materials::{StandardPbrMaterialOptions, create_standard_pbr_material};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Brushed aluminum: moderate roughness, fully metallic, warm gray base.
/// Metallic: 1 · roughness: 0.35 · base_color: `0xB0B0B0`
pub fn create_aluminum_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0xb0b0b0ff,
        metallic: 1.0,
        roughness: 0.35,
        ..options.clone()
    })
}

/// Solid carbon / black matte: very dark, dielectric, rough.
/// Metallic: 0 · roughness: 0.95 · base_color: `0x1A1A1A`
pub fn create_carbon_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0x1a1a1aff,
        metallic: 0.0,
        roughness: 0.95,
        ..options.clone()
    })
}

/// Clear glass preset (use with [`TransmissionVolumePbrMaterial`] for
/// transmission). Metallic: 0 · roughness: 0.0 · IOR: 1.5 · transmission: 1 ·
/// base_color: white.
pub fn create_glass_transmission_volume_pbr_material(
    options: &TransmissionVolumePbrMaterialOptions,
) -> TransmissionVolumePbrMaterial {
    create_transmission_volume_pbr_material(&TransmissionVolumePbrMaterialOptions {
        ior: Some(1.5),
        transmission: Some(1.0),
        ..options.clone()
    })
}

/// Gold: fully metallic, moderate roughness, warm saturated base color.
/// Metallic: 1 · roughness: 0.25 · base_color: `0xFFD700` (gold yellow in sRGB)
pub fn create_gold_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0xffd700ff,
        metallic: 1.0,
        roughness: 0.25,
        ..options.clone()
    })
}

/// Iron / cast iron: metallic, moderately rough, dark gray.
/// Metallic: 1 · roughness: 0.7 · base_color: `0x444444`
pub fn create_iron_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0x444444ff,
        metallic: 1.0,
        roughness: 0.7,
        ..options.clone()
    })
}

/// Marble: dielectric, very smooth, white with a hint of gray.
/// Metallic: 0 · roughness: 0.05 · base_color: `0xF5F5F5`
pub fn create_marble_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0xf5f5f5ff,
        metallic: 0.0,
        roughness: 0.05,
        ..options.clone()
    })
}

/// Hard glossy plastic: dielectric, smooth, neutral. Metallic: 0 · roughness:
/// 0.05 · base_color: `0xFFFFFF` (caller supplies tint via `options.base_color`).
pub fn create_plastic_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        metallic: 0.0,
        roughness: 0.05,
        ..options.clone()
    })
}

/// Matte rubber: dielectric, very rough, dark.
/// Metallic: 0 · roughness: 0.9 · base_color: `0x1C1C1C`
pub fn create_rubber_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0x1c1c1cff,
        metallic: 0.0,
        roughness: 0.9,
        ..options.clone()
    })
}

/// Silver: fully metallic, polished.
/// Metallic: 1 · roughness: 0.1 · base_color: `0xC0C0C0`
pub fn create_silver_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0xc0c0c0ff,
        metallic: 1.0,
        roughness: 0.1,
        ..options.clone()
    })
}

/// Skin (light tone): dielectric, slight roughness, warm pinkish base.
/// Metallic: 0 · roughness: 0.4 · base_color: `0xFFCC99` (a neutral Caucasian
/// tone in sRGB)
pub fn create_skin_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0xffcc99ff,
        metallic: 0.0,
        roughness: 0.4,
        ..options.clone()
    })
}

/// Wood (unfinished): dielectric, rough, medium brown.
/// Metallic: 0 · roughness: 0.8 · base_color: `0x8B5A2B`
pub fn create_wood_standard_pbr_material(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterial {
    create_standard_pbr_material(&StandardPbrMaterialOptions {
        base_color: 0x8b5a2bff,
        metallic: 0.0,
        roughness: 0.8,
        ..options.clone()
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // create_aluminum_standard_pbr_material
    #[test]
    fn create_aluminum_standard_pbr_material_values() {
        let m = create_aluminum_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0xb0b0b0ff);
        assert_eq!(m.standard.metallic, 1.0);
        assert_eq!(m.standard.roughness, 0.35);
    }

    // create_carbon_standard_pbr_material
    #[test]
    fn create_carbon_standard_pbr_material_values() {
        let m = create_carbon_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0x1a1a1aff);
        assert_eq!(m.standard.metallic, 0.0);
        assert_eq!(m.standard.roughness, 0.95);
    }

    // create_glass_transmission_volume_pbr_material
    #[test]
    fn create_glass_transmission_volume_pbr_material_values() {
        let m = create_glass_transmission_volume_pbr_material(
            &TransmissionVolumePbrMaterialOptions::default(),
        );
        assert_eq!(m.ior, 1.5);
        assert_eq!(m.transmission, 1.0);
    }

    // create_gold_standard_pbr_material
    #[test]
    fn create_gold_standard_pbr_material_values() {
        let m = create_gold_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0xffd700ff);
        assert_eq!(m.standard.metallic, 1.0);
        assert_eq!(m.standard.roughness, 0.25);
    }

    // create_iron_standard_pbr_material
    #[test]
    fn create_iron_standard_pbr_material_values() {
        let m = create_iron_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0x444444ff);
        assert_eq!(m.standard.roughness, 0.7);
    }

    // create_marble_standard_pbr_material
    #[test]
    fn create_marble_standard_pbr_material_values() {
        let m = create_marble_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0xf5f5f5ff);
        assert_eq!(m.standard.roughness, 0.05);
    }

    // create_plastic_standard_pbr_material
    #[test]
    fn create_plastic_standard_pbr_material_values() {
        let m = create_plastic_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0xffffffff);
        assert_eq!(m.standard.roughness, 0.05);
    }

    #[test]
    fn create_plastic_standard_pbr_material_allows_a_tint_override() {
        let m = create_plastic_standard_pbr_material(&StandardPbrMaterialOptions {
            base_color: 0xff0000ff,
            ..Default::default()
        });
        assert_eq!(m.standard.base_color, 0xff0000ff);
        assert_eq!(m.standard.roughness, 0.05);
    }

    // create_rubber_standard_pbr_material
    #[test]
    fn create_rubber_standard_pbr_material_values() {
        let m = create_rubber_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0x1c1c1cff);
        assert_eq!(m.standard.roughness, 0.9);
    }

    // create_silver_standard_pbr_material
    #[test]
    fn create_silver_standard_pbr_material_values() {
        let m = create_silver_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0xc0c0c0ff);
        assert_eq!(m.standard.roughness, 0.1);
    }

    // create_skin_standard_pbr_material
    #[test]
    fn create_skin_standard_pbr_material_values() {
        let m = create_skin_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0xffcc99ff);
        assert_eq!(m.standard.roughness, 0.4);
    }

    // create_wood_standard_pbr_material
    #[test]
    fn create_wood_standard_pbr_material_values() {
        let m = create_wood_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.standard.base_color, 0x8b5a2bff);
        assert_eq!(m.standard.roughness, 0.8);
    }
}
