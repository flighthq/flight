//! Free functions for the [`SurfaceMaterial`] trailer shared by every 3D
//! surface material.
//!
//! Concrete material struct types (`BlinnPhongMaterial`, `UnlitMaterial`,
//! `StandardPbrMaterial`, and the rest of the surface-material taxonomy) live
//! in `flighthq-types`, per the header-layer convention — this module only
//! owns the trailer defaults and the alpha-mode query functions shared across
//! all of them. Their constructors live in `classic_materials.rs`,
//! `unlit_materials.rs`, `pbr_materials.rs`, and `pbr_extension_materials.rs`.

use flighthq_types::{
    AlphaType, BlendMode, KindId, MaterialAlphaMode, SurfaceMaterial, SurfaceMaterialLike,
};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Builds a [`SurfaceMaterialLike`] carrying `kind` and the shared trailer at
/// its defaults: opaque, single-sided, straight alpha, Normal blend, a 0.5
/// mask cutoff. Every 3D material constructor starts from this and adds its
/// own maps and scalars.
pub fn create_surface_material(kind: KindId) -> SurfaceMaterialLike {
    SurfaceMaterialLike {
        kind,
        alpha_cutoff: DEFAULT_ALPHA_CUTOFF,
        alpha_mode: DEFAULT_ALPHA_MODE,
        alpha_type: DEFAULT_ALPHA_TYPE,
        blend_mode: BlendMode::Normal,
        double_sided: DEFAULT_DOUBLE_SIDED,
    }
}

/// Returns the alpha mode of the material. The alpha mode controls how a
/// material resolves coverage: `Opaque` ignores base-color alpha, `Mask`
/// hard-cuts at `alpha_cutoff`, `Blend` alpha-blends. Callers typically branch
/// on this to configure blend state.
pub fn get_material_alpha_mode(source: &dyn SurfaceMaterial) -> MaterialAlphaMode {
    source.alpha_mode()
}

/// Returns `true` when the material's alpha mode is `Blend`. Blended
/// materials require a sorted draw order and a GPU blend equation.
pub fn is_material_blended(source: &dyn SurfaceMaterial) -> bool {
    source.alpha_mode() == MaterialAlphaMode::Blend
}

/// Returns `true` when the material's alpha mode is `Mask`. Masked materials
/// discard fragments whose alpha is below `alpha_cutoff`; no blend state is
/// required.
pub fn is_material_masked(source: &dyn SurfaceMaterial) -> bool {
    source.alpha_mode() == MaterialAlphaMode::Mask
}

/// Returns `true` when the material's alpha mode is `Opaque`. Opaque
/// materials ignore the base-color alpha channel; no blend state or discard
/// is required.
pub fn is_material_opaque(source: &dyn SurfaceMaterial) -> bool {
    source.alpha_mode() == MaterialAlphaMode::Opaque
}

const DEFAULT_ALPHA_CUTOFF: f32 = 0.5;
const DEFAULT_ALPHA_MODE: MaterialAlphaMode = MaterialAlphaMode::Opaque;
const DEFAULT_ALPHA_TYPE: AlphaType = AlphaType::Straight;
const DEFAULT_DOUBLE_SIDED: bool = false;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_types::StandardPbrMaterial;

    use super::*;

    // `StandardPbrMaterial` already implements `SurfaceMaterial` in
    // `flighthq-types`, so it is a convenient concrete trait-object source for
    // these tests without depending on any sibling module in this crate.
    fn surface_material_with_mode(mode: MaterialAlphaMode) -> StandardPbrMaterial {
        StandardPbrMaterial {
            alpha_mode: mode,
            ..StandardPbrMaterial::default()
        }
    }

    // create_surface_material
    #[test]
    fn create_surface_material_carries_the_given_kind() {
        let kind = KindId::new();
        let m = create_surface_material(kind);
        assert_eq!(m.kind, kind);
    }

    #[test]
    fn create_surface_material_applies_defaults() {
        let m = create_surface_material(KindId::new());
        assert_eq!(m.alpha_cutoff, 0.5);
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(m.alpha_type, AlphaType::Straight);
        assert_eq!(m.blend_mode, BlendMode::Normal);
        assert!(!m.double_sided);
    }

    // get_material_alpha_mode
    #[test]
    fn get_material_alpha_mode_returns_the_mode() {
        let source = surface_material_with_mode(MaterialAlphaMode::Blend);
        assert_eq!(get_material_alpha_mode(&source), MaterialAlphaMode::Blend);
    }

    // is_material_blended
    #[test]
    fn is_material_blended_true_for_blend() {
        assert!(is_material_blended(&surface_material_with_mode(
            MaterialAlphaMode::Blend
        )));
    }

    #[test]
    fn is_material_blended_false_for_opaque() {
        assert!(!is_material_blended(&surface_material_with_mode(
            MaterialAlphaMode::Opaque
        )));
    }

    // is_material_masked
    #[test]
    fn is_material_masked_true_for_mask() {
        assert!(is_material_masked(&surface_material_with_mode(
            MaterialAlphaMode::Mask
        )));
    }

    #[test]
    fn is_material_masked_false_for_blend() {
        assert!(!is_material_masked(&surface_material_with_mode(
            MaterialAlphaMode::Blend
        )));
    }

    // is_material_opaque
    #[test]
    fn is_material_opaque_true_for_opaque() {
        assert!(is_material_opaque(&surface_material_with_mode(
            MaterialAlphaMode::Opaque
        )));
    }

    #[test]
    fn is_material_opaque_false_for_mask() {
        assert!(!is_material_opaque(&surface_material_with_mode(
            MaterialAlphaMode::Mask
        )));
    }
}
