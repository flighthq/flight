//! Free functions for [`Material`] — structural equality and construction.

use flighthq_types::{
    ColorTransformLike, KindId, Material, MaterialLike, UniformColorTransformMaterial,
};

use crate::color_transform::equals_color_transform;

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new base [`MaterialLike`] carrying the given `kind`.
///
/// Used for custom material kinds that do not carry extra data. Structural
/// equality for such materials degenerates to kind equality.
pub fn create_material(kind: KindId) -> MaterialLike {
    MaterialLike { kind }
}

/// Returns `true` if two [`UniformColorTransformMaterial`] values are structurally
/// equal (same kind and identical color transforms).
pub fn equals_uniform_color_transform_material(
    a: &UniformColorTransformMaterial,
    b: &UniformColorTransformMaterial,
) -> bool {
    a.kind() == b.kind()
        && equals_color_transform(
            &color_transform_to_like(&a.color_transform),
            &color_transform_to_like(&b.color_transform),
        )
}

/// Returns `true` if `a` and `b` have the same [`KindId`].
///
/// This covers structural equality for materials that carry no extra data
/// (such as [`ColorTransformMaterial`]): two instances of the same kind with
/// no distinguishing fields are equal.
pub fn equals_material_by_kind(a: &dyn Material, b: &dyn Material) -> bool {
    a.kind() == b.kind()
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Borrows a `ColorTransform` as a `ColorTransformLike` value for use with
/// the equality helpers that accept `&ColorTransformLike`.
fn color_transform_to_like(ct: &flighthq_types::ColorTransform) -> ColorTransformLike {
    ColorTransformLike {
        red_multiplier: ct.red_multiplier,
        green_multiplier: ct.green_multiplier,
        blue_multiplier: ct.blue_multiplier,
        alpha_multiplier: ct.alpha_multiplier,
        red_offset: ct.red_offset,
        green_offset: ct.green_offset,
        blue_offset: ct.blue_offset,
        alpha_offset: ct.alpha_offset,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_types::Material;

    use super::*;
    use crate::color_transform::create_color_transform_from;
    use crate::color_transform_material::{
        create_color_transform_material, create_uniform_color_transform_material,
    };

    // create_material
    #[test]
    fn create_material_carries_kind() {
        let kind = KindId::new();
        let m = create_material(kind);
        assert_eq!(m.kind, kind);
    }

    // equals_material_by_kind
    #[test]
    fn equals_material_by_kind_same_reference_is_true() {
        let m = create_color_transform_material();
        assert!(equals_material_by_kind(&m, &m));
    }

    #[test]
    fn equals_material_by_kind_different_kinds_is_false() {
        let a = create_color_transform_material();
        let b = create_uniform_color_transform_material(None);
        assert!(!equals_material_by_kind(&a, &b));
    }

    #[test]
    fn equals_material_by_kind_per_instance_same_kind_is_true() {
        let a = create_color_transform_material();
        let b = create_color_transform_material();
        assert!(equals_material_by_kind(&a, &b));
    }

    // equals_uniform_color_transform_material
    #[test]
    fn equals_uniform_color_transform_material_same_transform_is_true() {
        let a = create_uniform_color_transform_material(Some(create_color_transform_from(
            0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        )));
        let b = create_uniform_color_transform_material(Some(create_color_transform_from(
            0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        )));
        assert!(equals_uniform_color_transform_material(&a, &b));
    }

    #[test]
    fn equals_uniform_color_transform_material_different_transform_is_false() {
        let a = create_uniform_color_transform_material(Some(create_color_transform_from(
            0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        )));
        let b = create_uniform_color_transform_material(Some(create_color_transform_from(
            0.25, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        )));
        assert!(!equals_uniform_color_transform_material(&a, &b));
    }

    #[test]
    fn equals_uniform_color_transform_material_same_reference_is_true() {
        let a = create_uniform_color_transform_material(None);
        assert!(equals_uniform_color_transform_material(&a, &a));
    }
}
