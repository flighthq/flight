use flight_entity::{EntityRuntimeSlot, allocate_entity};

// flight-lint: allow(unhomed) owner: materials (TS @flighthq/materials colorScaleBias.ts; not yet ported)
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

// flight-lint: allow(unhomed) owner: materials (TS @flighthq/materials colorScaleBias.ts; not yet ported)
pub fn create_color_scale_bias() -> ColorScaleBias {
    let mut out: ColorScaleBias = allocate_entity();
    initialize_color_scale_bias(&mut out, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
    return out;
}

// flight-lint: allow(unhomed) owner: materials (TS @flighthq/materials colorScaleBias.ts; not yet ported)
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
