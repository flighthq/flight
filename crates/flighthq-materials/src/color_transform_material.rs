//! Constructors for color transform materials.

use flighthq_types::{
    ColorTransform, ColorTransformMaterial, KindId, UniformColorTransformMaterial,
};

use crate::color_transform::create_color_transform;

// ---------------------------------------------------------------------------
// Kind constants
// ---------------------------------------------------------------------------

/// Stable `KindId` for [`ColorTransformMaterial`].
pub fn color_transform_material_kind() -> KindId {
    KindId::of::<ColorTransformMaterial>()
}

/// Stable `KindId` for [`UniformColorTransformMaterial`].
pub fn uniform_color_transform_material_kind() -> KindId {
    KindId::of::<UniformColorTransformMaterial>()
}

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new per-instance [`ColorTransformMaterial`].
///
/// Carries no stored color transform value. The backend material renderer reads
/// each node's `HasColorTransform` trait and packs it as per-instance attribute
/// data (8 floats: 4 multiplier + 4 offset), keeping many independently-tinted
/// nodes in one batch.
pub fn create_color_transform_material() -> ColorTransformMaterial {
    ColorTransformMaterial {
        kind: color_transform_material_kind(),
    }
}

/// Returns a new per-batch [`UniformColorTransformMaterial`] using the given
/// color transform, or an identity transform when `None` is passed.
///
/// The transform uploads as a single GPU uniform for the whole batch. A
/// different value breaks the batch, making this cheapest for tinting a whole
/// group or layer. Use [`create_color_transform_material`] when many nodes need
/// distinct tints in one batch.
pub fn create_uniform_color_transform_material(
    color_transform: Option<ColorTransform>,
) -> UniformColorTransformMaterial {
    UniformColorTransformMaterial {
        kind: uniform_color_transform_material_kind(),
        color_transform: color_transform.unwrap_or_else(create_color_transform),
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

    // color_transform_material_kind
    #[test]
    fn color_transform_material_kind_is_stable() {
        assert_eq!(
            color_transform_material_kind(),
            color_transform_material_kind()
        );
    }

    // create_color_transform_material
    #[test]
    fn create_color_transform_material_has_correct_kind() {
        let m = create_color_transform_material();
        assert_eq!(m.kind(), color_transform_material_kind());
    }

    // create_uniform_color_transform_material
    #[test]
    fn create_uniform_color_transform_material_defaults_to_identity() {
        let m = create_uniform_color_transform_material(None);
        assert_eq!(m.kind(), uniform_color_transform_material_kind());
        assert_eq!(m.color_transform.red_multiplier, 1.0);
        assert_eq!(m.color_transform.green_multiplier, 1.0);
        assert_eq!(m.color_transform.alpha_multiplier, 1.0);
        assert_eq!(m.color_transform.red_offset, 0.0);
    }

    #[test]
    fn create_uniform_color_transform_material_carries_provided_transform() {
        let ct = create_color_transform_from(0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        let m = create_uniform_color_transform_material(Some(ct));
        assert_eq!(m.color_transform.red_multiplier, 0.5);
    }

    // uniform_color_transform_material_kind
    #[test]
    fn uniform_color_transform_material_kind_is_stable() {
        assert_eq!(
            uniform_color_transform_material_kind(),
            uniform_color_transform_material_kind()
        );
    }

    #[test]
    fn material_kinds_are_distinct() {
        assert_ne!(
            color_transform_material_kind(),
            uniform_color_transform_material_kind()
        );
    }
}
