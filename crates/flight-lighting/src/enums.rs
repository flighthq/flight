use crate::types::{LightUnit, Scene3DForwardLightSelectionReason};

// flight-lint: allow(conform-extra) D9 Rust string-table helper for the TS LightUnit string union
pub fn get_light_unit_string(value: LightUnit) -> &'static str {
    return match value {
        LightUnit::Candela => "Candela",
        LightUnit::Lumen => "Lumen",
        LightUnit::Lux => "Lux",
        LightUnit::Unitless => "Unitless",
    };
}

// flight-lint: allow(conform-extra) D9 Rust string-table helper for the TS selection explanation reason union
pub fn get_scene_3d_forward_light_selection_reason_string(
    value: Scene3DForwardLightSelectionReason,
) -> &'static str {
    return match value {
        Scene3DForwardLightSelectionReason::SelectionPrepared => "selection-prepared",
        Scene3DForwardLightSelectionReason::SelectionRequired => "selection-required",
        Scene3DForwardLightSelectionReason::WithinBudget => "within-budget",
    };
}

// flight-lint: allow(conform-extra) D9 Rust parser for the TS LightUnit string union
pub fn parse_light_unit(value: &str) -> Option<LightUnit> {
    return match value {
        "Candela" => Some(LightUnit::Candela),
        "Lumen" => Some(LightUnit::Lumen),
        "Lux" => Some(LightUnit::Lux),
        "Unitless" => Some(LightUnit::Unitless),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 Rust parser for the TS selection explanation reason union
pub fn parse_scene_3d_forward_light_selection_reason(
    value: &str,
) -> Option<Scene3DForwardLightSelectionReason> {
    return match value {
        "selection-prepared" => Some(Scene3DForwardLightSelectionReason::SelectionPrepared),
        "selection-required" => Some(Scene3DForwardLightSelectionReason::SelectionRequired),
        "within-budget" => Some(Scene3DForwardLightSelectionReason::WithinBudget),
        _ => None,
    };
}
