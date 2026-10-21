use flight_entity::{EntityRuntimeSlot, allocate_entity};

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
    runtime: EntityRuntimeSlot,
    pub color_blind_type: ColorBlindType,
    pub color_matrix: [f32; 20],
}

pub fn create_color_blind_simulation_adjustment(color_blind_type: ColorBlindType) -> ColorBlindSimulationAdjustment {
    let mut out: ColorBlindSimulationAdjustment = allocate_entity();
    initialize_color_blind_simulation_adjustment(&mut out, color_blind_type);
    return out;
}

pub fn initialize_color_blind_simulation_adjustment(out: &mut ColorBlindSimulationAdjustment, color_blind_type: ColorBlindType) {
    let m = get_color_blind_matrix(color_blind_type);
    let color_matrix = [
        m[0], m[1], m[2], 0.0, 0.0,
        m[3], m[4], m[5], 0.0, 0.0,
        m[6], m[7], m[8], 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.color_blind_type = color_blind_type;
    out.color_matrix = color_matrix;
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

impl Default for ColorBlindSimulationAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            color_blind_type: ColorBlindType::Deuteranopia,
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(ColorBlindSimulationAdjustment);
