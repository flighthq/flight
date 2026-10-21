use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::contract::Slot2D;
use serde_json::Value;

use crate::dragon_bones_parse_helpers::number_or;
use crate::types::DragonBonesSectionContext;

pub fn dragon_bones_slots_section_handler(context: &mut DragonBonesSectionContext<'_>) {
    let Some(raw) = context.armature.get("slot").and_then(Value::as_array) else {
        return;
    };
    for entry in raw {
        let Some(slot) = entry.as_object() else {
            continue;
        };
        let name = slot.get("name").and_then(Value::as_str).map(str::to_string);
        let bone_index = slot
            .get("parent")
            .and_then(Value::as_str)
            .and_then(|name| context.bone_index_by_name.get(name))
            .map(|index| *index as i32)
            .unwrap_or(-1);
        let display_index = number_or(slot.get("displayIndex"), 0.0) as i32;
        let attachment = name.as_ref().and_then(|name| {
            if display_index < 0 {
                return None;
            }
            context
                .display_table
                .get(name)
                .and_then(|displays| displays.get(display_index as usize))
                .cloned()
                .flatten()
        });
        let color = parse_dragon_bones_color(slot.get("color"), context.diagnostics.as_deref_mut());
        context.slots.push(Slot2D {
            attachment,
            deform: None,
            bone_index,
            color: Some(color),
            name,
        });
    }
}

fn parse_dragon_bones_color(
    raw: Option<&Value>,
    diagnostics: Option<&mut Vec<flight_importdiagnostics::ImportDiagnostic>>,
) -> u32 {
    let Some(color) = raw.and_then(Value::as_object) else {
        return u32::MAX;
    };
    let channel = |key: &str| {
        ((number_or(color.get(key), 100.0) / 100.0) * 255.0)
            .round()
            .clamp(0.0, 255.0) as u32
    };
    if ["rO", "gO", "bO", "aO"]
        .iter()
        .any(|key| number_or(color.get(*key), 0.0) != 0.0)
    {
        let mut detail = HashMap::new();
        detail.insert(
            "slots".to_string(),
            ImportDiagnosticDetailValue::Number(1.0),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "dragonbones.color-offset-unsupported",
            "parseDragonBonesColor",
            Some(detail),
        );
    }
    return (channel("rM") << 24) | (channel("gM") << 16) | (channel("bM") << 8) | channel("aM");
}
