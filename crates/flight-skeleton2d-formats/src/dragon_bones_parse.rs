use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::create_skeleton_2d;
use serde_json::Value;

use crate::dragon_bones_parse_helpers::number_or;
use crate::types::{DragonBonesRegistry, DragonBonesSectionContext, JsonRecord, Skeleton2DImport};

const DRAGON_BONES_COMPATIBLE_VERSION: &str = "5.5";
const DEFAULT_DRAGON_BONES_FRAME_RATE: f32 = 24.0;

fn check_dragon_bones_version(
    doc: &serde_json::Map<String, Value>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> bool {
    let resolved = doc
        .get("compatibleVersion")
        .and_then(Value::as_str)
        .or_else(|| doc.get("version").and_then(Value::as_str));
    let Some(resolved) = resolved else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "dragonbones.version-missing",
            "parseDragonBonesSkeleton",
            Some(HashMap::new()),
        );
        return false;
    };
    if resolved != DRAGON_BONES_COMPATIBLE_VERSION {
        let mut detail = HashMap::new();
        detail.insert(
            "version".to_string(),
            ImportDiagnosticDetailValue::String(resolved.to_string()),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "dragonbones.version-unsupported",
            "parseDragonBonesSkeleton",
            Some(detail),
        );
        return false;
    }
    return true;
}

pub fn parse_dragon_bones_skeleton_with_registry(
    json: &str,
    registry: &DragonBonesRegistry,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    let doc: Value = serde_json::from_str(json).ok()?;
    let record = JsonRecord::from(doc.as_object()?.clone());
    let armatures = record.get("armature")?.as_array()?;
    if armatures.is_empty() {
        return None;
    }
    let mut diagnostics = diagnostics;
    if !check_dragon_bones_version(&record, diagnostics.as_deref_mut()) {
        return None;
    }
    if armatures.len() > 1 {
        let mut detail = HashMap::new();
        detail.insert(
            "armatures".to_string(),
            ImportDiagnosticDetailValue::Number((armatures.len() - 1) as f32),
        );
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "dragonbones.multi-armature-unsupported",
            "parseDragonBonesSkeleton",
            Some(detail),
        );
    }
    let armature = JsonRecord::from(armatures.first()?.as_object()?.clone());
    let frame_rate = positive_number(armature.get("frameRate"))
        .or_else(|| positive_number(record.get("frameRate")))
        .unwrap_or(DEFAULT_DRAGON_BONES_FRAME_RATE);
    let slot_order = armature
        .get("slot")
        .and_then(Value::as_array)
        .map(|slots| {
            slots
                .iter()
                .enumerate()
                .filter_map(|(index, slot)| {
                    Some((slot.as_object()?.get("name")?.as_str()?.to_string(), index))
                })
                .collect()
        })
        .unwrap_or_default();
    let mut context = DragonBonesSectionContext {
        animations: Vec::new(),
        armature: &armature,
        bone_index_by_name: HashMap::new(),
        bones: Vec::new(),
        diagnostics,
        display_table: HashMap::new(),
        doc: &record,
        frame_rate,
        raw_index_to_output: Vec::new(),
        registry,
        skins: Vec::new(),
        slot_order,
        slots: Vec::new(),
    };
    for entry in &registry.section_handlers {
        (entry.handle)(&mut context);
    }
    let mut skeleton = create_skeleton_2d(context.bones, Some(context.slots));
    if !context.skins.is_empty() {
        skeleton.skins = Some(context.skins);
    }
    return Some(Skeleton2DImport {
        animations: context.animations,
        skeleton,
    });
}

fn positive_number(value: Option<&Value>) -> Option<f32> {
    let number = number_or(value, 0.0);
    return (number.is_finite() && number > 0.0).then_some(number);
}
