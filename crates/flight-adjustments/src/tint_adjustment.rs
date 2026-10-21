use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_matrix_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_tint_adjustment() {
        let a = TintAdjustment::new(0x80ff40ff);
        let b = create_tint_adjustment(0x80ff40ff);
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Builds a diagonal-affine tint from a packed `0xRRGGBBAA` color: each channel scale is that byte
/// divided by 255, with zero bias and no channel mixing. Matrix-tier.
#[derive(Debug, Clone)]
pub struct TintAdjustment {
    fields: AdjustmentFields,
}

pub fn create_tint_adjustment(rgba: u32) -> TintAdjustment {
    let mut out: TintAdjustment = allocate_entity();
    initialize_tint_adjustment(&mut out, rgba);
    return out;
}

pub fn initialize_tint_adjustment(out: &mut TintAdjustment, rgba: u32) {
    let red_scale = ((rgba >> 24) & 0xff) as f32 / 255.0;
    let green_scale = ((rgba >> 16) & 0xff) as f32 / 255.0;
    let blue_scale = ((rgba >> 8) & 0xff) as f32 / 255.0;
    let alpha_scale = (rgba & 0xff) as f32 / 255.0;
    let color_matrix = [
        red_scale, 0.0, 0.0, 0.0, 0.0,
        0.0, green_scale, 0.0, 0.0, 0.0,
        0.0, 0.0, blue_scale, 0.0, 0.0,
        0.0, 0.0, 0.0, alpha_scale, 0.0,
    ];
    initialize_color_matrix_adjustment(out, "TintAdjustment", color_matrix);
}

impl Default for TintAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
        };
    }
}

impl TintAdjustment {
    pub fn new(rgba: u32) -> Self {
        return create_tint_adjustment(rgba);
    }
}

crate::impl_adjustment!(TintAdjustment);
