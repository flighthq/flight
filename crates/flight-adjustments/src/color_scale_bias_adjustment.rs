use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// A per-channel scale + bias adjustment carrying both the legible ColorScaleBias payload and its
/// equivalent 4x5 diagonal color matrix.
#[derive(Debug, Clone)]
pub struct ColorScaleBiasAdjustment {
    runtime: EntityRuntimeSlot,
    pub color_scale_bias: ColorScaleBias,
    pub color_matrix: [f32; 20],
}

/// Per-channel scale and bias for color adjustment resolution.
#[derive(Debug, Clone)]
pub struct ColorScaleBias {
    runtime: EntityRuntimeSlot,
    pub red_scale: f32,
    pub green_scale: f32,
    pub blue_scale: f32,
    pub alpha_scale: f32,
    pub red_bias: f32,
    pub green_bias: f32,
    pub blue_bias: f32,
    pub alpha_bias: f32,
}

pub fn create_color_scale_bias() -> ColorScaleBias {
    let mut out: ColorScaleBias = allocate_entity();
    initialize_color_scale_bias(&mut out, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
    return out;
}

pub fn create_color_scale_bias_adjustment(color_scale_bias: &ColorScaleBias) -> ColorScaleBiasAdjustment {
    let mut out: ColorScaleBiasAdjustment = allocate_entity();
    initialize_color_scale_bias_adjustment(&mut out, color_scale_bias);
    return out;
}

pub fn initialize_color_scale_bias(
    out: &mut ColorScaleBias,
    red_scale: f32,
    green_scale: f32,
    blue_scale: f32,
    alpha_scale: f32,
    red_bias: f32,
    green_bias: f32,
    blue_bias: f32,
    alpha_bias: f32,
) {
    out.red_scale = red_scale;
    out.green_scale = green_scale;
    out.blue_scale = blue_scale;
    out.alpha_scale = alpha_scale;
    out.red_bias = red_bias;
    out.green_bias = green_bias;
    out.blue_bias = blue_bias;
    out.alpha_bias = alpha_bias;
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

impl Default for ColorScaleBias {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            red_scale: 1.0,
            green_scale: 1.0,
            blue_scale: 1.0,
            alpha_scale: 1.0,
            red_bias: 0.0,
            green_bias: 0.0,
            blue_bias: 0.0,
            alpha_bias: 0.0,
        };
    }
}

flight_entity::impl_entity!(ColorScaleBias);
flight_entity::impl_entity!(ColorScaleBiasAdjustment);
