use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    AttachmentSkin2D, Skeleton2DDrawOrderTimeline, Slot2D, create_skeleton_2d,
};
use serde::Serialize;
use serde_json::Value;

use crate::spine_draw_order::{SpineDrawOrderMove, resolve_spine_draw_ordering};
use crate::spine_parse_helpers::{SPINE_DEFAULT_SKIN_NAME, index_of_spine_slot, number_or};
use crate::types::{JsonRecord, Skeleton2DImport, SpineJsonRegistry, SpineJsonSectionContext};

pub fn parse_spine_draw_order_timeline<T: Serialize>(
    raw: Option<&T>,
    slots: &[Slot2D],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DDrawOrderTimeline> {
    let raw = raw.and_then(|value| serde_json::to_value(value).ok())?;
    let frames = raw.as_array()?;
    if frames.is_empty() {
        return None;
    }
    let mut times = Vec::new();
    let mut orderings = Vec::new();
    for frame in frames.iter().filter_map(Value::as_object) {
        let ordering = resolve_spine_draw_order(frame.get("offsets"), slots);
        let Some(ordering) = ordering else {
            let mut detail = HashMap::new();
            detail.insert(
                "time".to_string(),
                ImportDiagnosticDetailValue::Number(number_or(frame.get("time"), 0.0)),
            );
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "spine.draworder-keyframe-unresolved",
                "parseSpineDrawOrderTimeline",
                Some(detail),
            );
            continue;
        };
        times.push(number_or(frame.get("time"), 0.0));
        orderings.extend(ordering);
    }
    if times.is_empty() {
        return None;
    }
    return Some(Skeleton2DDrawOrderTimeline { orderings, times });
}

pub fn parse_spine_skeleton_with_registry(
    json: &str,
    registry: &SpineJsonRegistry,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    let doc: Value = serde_json::from_str(json).ok()?;
    let record = JsonRecord::from(doc.as_object()?.clone());
    let mut context = SpineJsonSectionContext {
        animations: Vec::new(),
        attachment_names: Vec::new(),
        bones: Vec::new(),
        diagnostics,
        doc: &record,
        registry,
        skins: Vec::new(),
        slots: Vec::new(),
    };
    for entry in &registry.section_handlers {
        (entry.handle)(&mut context);
    }
    resolve_spine_setup_attachments(
        &mut context.slots,
        &context.attachment_names,
        &context.skins,
    );
    let mut skeleton = create_skeleton_2d(context.bones, Some(context.slots));
    if !context.skins.is_empty() {
        skeleton.skins = Some(context.skins);
    }
    return Some(Skeleton2DImport {
        animations: context.animations,
        skeleton,
    });
}

fn resolve_spine_draw_order(raw: Option<&Value>, slots: &[Slot2D]) -> Option<Vec<f32>> {
    let mut moves = Vec::new();
    if let Some(offsets) = raw.and_then(Value::as_array) {
        for movement in offsets.iter().filter_map(Value::as_object) {
            let slot_index = movement
                .get("slot")
                .and_then(Value::as_str)
                .map(|name| index_of_spine_slot(slots, name))
                .unwrap_or(-1);
            if slot_index < 0 {
                return None;
            }
            moves.push(SpineDrawOrderMove {
                offset: number_or(movement.get("offset"), 0.0) as i32,
                slot_index,
            });
        }
    }
    let mut ordering = Vec::new();
    if !resolve_spine_draw_ordering(&mut ordering, &moves, slots.len() as i32) {
        return None;
    }
    return Some(ordering);
}

fn resolve_spine_setup_attachments(
    slots: &mut [Slot2D],
    attachment_names: &[Option<String>],
    skins: &[AttachmentSkin2D],
) {
    let Some(setup) = skins
        .iter()
        .find(|skin| skin.name == SPINE_DEFAULT_SKIN_NAME)
        .or_else(|| skins.first())
    else {
        return;
    };
    for entry in &setup.attachments {
        let index = entry.slot_index;
        if index >= 0
            && (index as usize) < slots.len()
            && attachment_names
                .get(index as usize)
                .and_then(Option::as_deref)
                == Some(entry.name.as_str())
        {
            slots[index as usize].attachment = Some(entry.attachment.clone());
        }
    }
}
