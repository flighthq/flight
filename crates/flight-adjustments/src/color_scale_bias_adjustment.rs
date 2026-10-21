use flight_entity::{EntityRuntimeSlot, allocate_entity};
use flight_unhomed::ColorScaleBias;

/// A per-channel scale + bias adjustment carrying both the legible ColorScaleBias payload and its
/// equivalent 4x5 diagonal color matrix.
#[derive(Debug, Clone)]
pub struct ColorScaleBiasAdjustment {
    runtime: EntityRuntimeSlot,
    pub color_scale_bias: ColorScaleBias,
    pub color_matrix: [f32; 20],
}

pub fn create_color_scale_bias_adjustment(color_scale_bias: &ColorScaleBias) -> ColorScaleBiasAdjustment {
    let mut out: ColorScaleBiasAdjustment = allocate_entity();
    initialize_color_scale_bias_adjustment(&mut out, color_scale_bias);
    return out;
}

pub fn initialize_color_scale_bias_adjustment(out: &mut ColorScaleBiasAdjustment, color_scale_bias: &ColorScaleBias) {
    let color_matrix = [
        color_scale_bias.red_scale, 0.0, 0.0, 0.0, color_scale_bias.red_bias,
        0.0, color_scale_bias.green_scale, 0.0, 0.0, color_scale_bias.green_bias,
        0.0, 0.0, color_scale_bias.blue_scale, 0.0, color_scale_bias.blue_bias,
        0.0, 0.0, 0.0, color_scale_bias.alpha_scale, color_scale_bias.alpha_bias,
    ];
    out.color_scale_bias = color_scale_bias.clone();
    out.color_matrix = color_matrix;
}

impl Default for ColorScaleBiasAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            color_scale_bias: ColorScaleBias::default(),
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(ColorScaleBiasAdjustment);
