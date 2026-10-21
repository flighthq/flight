use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::AdjustmentSignatureValue;
use crate::contract::initialize_color_matrix_adjustment;
use flight_materials::ColorScaleBias;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_materials::color_scale_bias::create_color_scale_bias;

    #[test]
    fn new_matches_create_color_scale_bias_adjustment() {
        let a = ColorScaleBiasAdjustment::new(&create_color_scale_bias(None));
        let b = create_color_scale_bias_adjustment(&create_color_scale_bias(None));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// A per-channel scale + bias adjustment carrying both the legible ColorScaleBias payload and its
/// equivalent 4x5 diagonal color matrix.
#[derive(Debug, Clone)]
pub struct ColorScaleBiasAdjustment {
    fields: AdjustmentFields,
    pub color_scale_bias: ColorScaleBias,
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
    initialize_color_matrix_adjustment(out, "ColorScaleBiasAdjustment", color_matrix);
}

impl Default for ColorScaleBiasAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            color_scale_bias: ColorScaleBias::default(),
        };
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of the spread ColorScaleBias fields; the runtime symbol is not serialized)
impl AdjustmentSignatureValue for ColorScaleBias {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        out.push_str("{\"redScale\":");
        self.red_scale.write_adjustment_signature_value(out);
        self.green_scale.write_adjustment_signature_entry("greenScale", out);
        self.blue_scale.write_adjustment_signature_entry("blueScale", out);
        self.alpha_scale.write_adjustment_signature_entry("alphaScale", out);
        self.red_bias.write_adjustment_signature_entry("redBias", out);
        self.green_bias.write_adjustment_signature_entry("greenBias", out);
        self.blue_bias.write_adjustment_signature_entry("blueBias", out);
        self.alpha_bias.write_adjustment_signature_entry("alphaBias", out);
        out.push('}');
    }
}

impl ColorScaleBiasAdjustment {
    pub fn new(color_scale_bias: &ColorScaleBias) -> Self {
        return create_color_scale_bias_adjustment(color_scale_bias);
    }
}

crate::impl_adjustment!(ColorScaleBiasAdjustment, "colorScaleBias" => color_scale_bias);
