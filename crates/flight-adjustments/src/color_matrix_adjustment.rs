use flight_entity::allocate_entity;

use crate::contract::Adjustment;
use crate::contract::AdjustmentFields;
use crate::contract::initialize_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_color_matrix_adjustment() {
        let matrix = [0.5; 20];
        let a = ColorMatrixAdjustment::new(matrix);
        let b = create_color_matrix_adjustment(matrix);
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// An authored generic color-matrix adjustment (kind `ColorMatrixAdjustment`), carrying only its 4x5
/// color matrix.
#[derive(Debug, Clone, Default)]
pub struct ColorMatrixAdjustment {
    fields: AdjustmentFields,
}

// flight-lint: allow(conform-array) user-approved: fixed 4x5 color matrix buffer → Float32Array (D0 exception)
pub fn create_color_matrix_adjustment(color_matrix: [f32; 20]) -> ColorMatrixAdjustment {
    let mut out: ColorMatrixAdjustment = allocate_entity();
    initialize_color_matrix_adjustment(&mut out, "ColorMatrixAdjustment", color_matrix);
    return out;
}

// flight-lint: allow(conform-array) user-approved: fixed 4x5 color matrix buffer → Float32Array (D0 exception)
pub fn initialize_color_matrix_adjustment<T: Adjustment>(
    out: &mut T,
    kind: &str,
    color_matrix: [f32; 20],
) {
    initialize_adjustment(out, kind);
    out.adjustment_fields_mut().color_matrix = Some(color_matrix);
}

/// Returns the 4x5 color matrix an operation contributes to the fused matrix-tier pass, or None when
/// it carries none (a LUT-tier or non-pointwise operation). Structural: reads `color_matrix`, never the
/// kind.
// flight-lint: allow(conform-array) user-approved: fixed 4x5 color matrix buffer → Float32Array (D0 exception)
pub fn get_adjustment_color_matrix(operation: &dyn Adjustment) -> Option<&[f32; 20]> {
    return operation.adjustment_fields().color_matrix.as_ref();
}

/// Type guard: true when the operation contributes a fusable 4x5 color matrix.
pub fn is_color_matrix_adjustment(operation: &dyn Adjustment) -> bool {
    return get_adjustment_color_matrix(operation).is_some();
}

impl ColorMatrixAdjustment {
    // flight-lint: allow(conform-array) user-approved: fixed 4x5 color matrix buffer → Float32Array (D0 exception)
    pub fn new(color_matrix: [f32; 20]) -> Self {
        return create_color_matrix_adjustment(color_matrix);
    }
}

crate::impl_adjustment!(ColorMatrixAdjustment);
