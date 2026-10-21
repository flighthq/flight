use flight_entity::{EntityRuntimeSlot, allocate_entity};
use crate::contract::Adjustment;

/// A generic color-matrix adjustment carrying a 4x5 color matrix.
#[derive(Debug, Clone)]
pub struct ColorMatrixAdjustment {
    runtime: EntityRuntimeSlot,
    pub color_matrix: [f32; 20],
}

pub fn create_color_matrix_adjustment(color_matrix: [f32; 20]) -> ColorMatrixAdjustment {
    let mut out: ColorMatrixAdjustment = allocate_entity();
    initialize_color_matrix_adjustment(&mut out, color_matrix);
    return out;
}

pub fn initialize_color_matrix_adjustment(out: &mut ColorMatrixAdjustment, color_matrix: [f32; 20]) {
    out.color_matrix = color_matrix;
}

/// Returns the 4x5 color matrix a stack operation contributes to the fused matrix-tier pass, or None if
/// it is not a matrix-tier adjustment.
pub fn get_adjustment_color_matrix(operation: &Adjustment) -> Option<&[f32; 20]> {
    return match operation {
        Adjustment::BrightnessContrast(a) => Some(&a.color_matrix),
        Adjustment::ChannelMixer(a) => Some(&a.color_matrix),
        Adjustment::ColorBlindSimulation(a) => Some(&a.color_matrix),
        Adjustment::ColorMatrix(a) => Some(&a.color_matrix),
        Adjustment::ColorScaleBias(a) => Some(&a.color_matrix),
        Adjustment::Exposure(a) => Some(&a.color_matrix),
        Adjustment::Grayscale(a) => Some(&a.color_matrix),
        Adjustment::Invert(a) => Some(&a.color_matrix),
        Adjustment::Sepia(a) => Some(&a.color_matrix),
        Adjustment::Tint(a) => Some(&a.color_matrix),
        Adjustment::ColorGrade(_) => None,
        Adjustment::HueSaturation(_) => None,
        Adjustment::LiftGammaGain(_) => None,
        Adjustment::LookupTableGrade(_) => None,
    };
}

/// Type guard: true when the adjustment contributes a fusable 4x5 color matrix.
pub fn is_color_matrix_adjustment(operation: &Adjustment) -> bool {
    return get_adjustment_color_matrix(operation).is_some();
}

impl Default for ColorMatrixAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(ColorMatrixAdjustment);
