use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::AdjustmentSignatureValue;
use crate::contract::initialize_color_matrix_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_color_blind_simulation_adjustment() {
        let a = ColorBlindSimulationAdjustment::new(Some(&ColorBlindSimulationAdjustmentOptions { type_: Some(ColorBlindType::Tritanopia) }));
        let b = create_color_blind_simulation_adjustment(Some(&ColorBlindSimulationAdjustmentOptions { type_: Some(ColorBlindType::Tritanopia) }));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Color-blindness type.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ColorBlindType {
    Protanopia,
    Protanomaly,
    Deuteranopia,
    Deuteranomaly,
    Tritanopia,
    Tritanomaly,
    Achromatopsia,
    Achromatomaly,
}

/// Color-vision-deficiency simulation as a matrix-tier adjustment.
#[derive(Debug, Clone)]
pub struct ColorBlindSimulationAdjustment {
    fields: AdjustmentFields,
    pub color_blind_type: ColorBlindType,
}

/// Options for `create_color_blind_simulation_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct ColorBlindSimulationAdjustmentOptions {
    pub type_: Option<ColorBlindType>,
}

pub fn create_color_blind_simulation_adjustment(options: Option<&ColorBlindSimulationAdjustmentOptions>) -> ColorBlindSimulationAdjustment {
    let mut out: ColorBlindSimulationAdjustment = allocate_entity();
    initialize_color_blind_simulation_adjustment(&mut out, options);
    return out;
}

pub fn initialize_color_blind_simulation_adjustment(out: &mut ColorBlindSimulationAdjustment, options: Option<&ColorBlindSimulationAdjustmentOptions>) {
    let color_blind_type = options.and_then(|o| o.type_).unwrap_or(ColorBlindType::Deuteranopia);
    let m = get_color_blind_matrix(color_blind_type);
    let color_matrix = [
        m[0], m[1], m[2], 0.0, 0.0,
        m[3], m[4], m[5], 0.0, 0.0,
        m[6], m[7], m[8], 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.color_blind_type = color_blind_type;
    initialize_color_matrix_adjustment(out, "ColorBlindSimulationAdjustment", color_matrix);
}

/// Row-major 3x3 RGB->RGB coefficients per deficiency (HCIRN / Wickline simulation set).
fn get_color_blind_matrix(t: ColorBlindType) -> [f32; 9] {
    return match t {
        ColorBlindType::Protanopia => [0.567, 0.433, 0.0, 0.558, 0.442, 0.0, 0.0, 0.242, 0.758],
        ColorBlindType::Protanomaly => [0.817, 0.183, 0.0, 0.333, 0.667, 0.0, 0.0, 0.125, 0.875],
        ColorBlindType::Deuteranopia => [0.625, 0.375, 0.0, 0.7, 0.3, 0.0, 0.0, 0.3, 0.7],
        ColorBlindType::Deuteranomaly => [0.8, 0.2, 0.0, 0.258, 0.742, 0.0, 0.0, 0.142, 0.858],
        ColorBlindType::Tritanopia => [0.95, 0.05, 0.0, 0.0, 0.433, 0.567, 0.0, 0.475, 0.525],
        ColorBlindType::Tritanomaly => [0.967, 0.033, 0.0, 0.0, 0.733, 0.267, 0.0, 0.183, 0.817],
        ColorBlindType::Achromatopsia => [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
        ColorBlindType::Achromatomaly => [0.618, 0.32, 0.062, 0.163, 0.775, 0.062, 0.163, 0.32, 0.516],
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ColorBlindType string union; TS exports no get_/parse_ free functions
pub fn get_color_blind_type_string(value: ColorBlindType) -> &'static str {
    return match value {
        ColorBlindType::Protanopia => "protanopia",
        ColorBlindType::Deuteranopia => "deuteranopia",
        ColorBlindType::Tritanopia => "tritanopia",
        ColorBlindType::Protanomaly => "protanomaly",
        ColorBlindType::Deuteranomaly => "deuteranomaly",
        ColorBlindType::Tritanomaly => "tritanomaly",
        ColorBlindType::Achromatopsia => "achromatopsia",
        ColorBlindType::Achromatomaly => "achromatomaly",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ColorBlindType string union; TS exports no get_/parse_ free functions
pub fn parse_color_blind_type(value: &str) -> Option<ColorBlindType> {
    return match value {
        "protanopia" => Some(ColorBlindType::Protanopia),
        "deuteranopia" => Some(ColorBlindType::Deuteranopia),
        "tritanopia" => Some(ColorBlindType::Tritanopia),
        "protanomaly" => Some(ColorBlindType::Protanomaly),
        "deuteranomaly" => Some(ColorBlindType::Deuteranomaly),
        "tritanomaly" => Some(ColorBlindType::Tritanomaly),
        "achromatopsia" => Some(ColorBlindType::Achromatopsia),
        "achromatomaly" => Some(ColorBlindType::Achromatomaly),
        _ => None,
    };
}

impl Default for ColorBlindSimulationAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            color_blind_type: ColorBlindType::Deuteranopia,
        };
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of the ColorBlindType string)
impl AdjustmentSignatureValue for ColorBlindType {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        get_color_blind_type_string(*self).to_string().write_adjustment_signature_value(out);
    }
}

impl ColorBlindSimulationAdjustment {
    pub fn new(options: Option<&ColorBlindSimulationAdjustmentOptions>) -> Self {
        return create_color_blind_simulation_adjustment(options);
    }
}

crate::impl_adjustment!(ColorBlindSimulationAdjustment, "type" => color_blind_type);
