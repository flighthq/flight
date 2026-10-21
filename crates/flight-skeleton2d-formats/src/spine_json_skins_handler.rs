use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    Attachment2DRef, AttachmentSkin2D, MESH_ATTACHMENT_2D_KIND, MeshAttachment2D,
    REGION_ATTACHMENT_2D_KIND, RegionAttachment2D, SkinAttachment2D, Slot2D, create_skin_2d,
};
use serde_json::Value;

use crate::spine_parse_helpers::{index_of_spine_slot, number_or};
use crate::types::{JsonRecord, SpineJsonSectionContext};

fn float_array(value: Option<&Value>) -> Vec<f32> {
    return value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .map(|value| value.as_f64().unwrap_or(0.0) as f32)
                .collect()
        })
        .unwrap_or_default();
}

fn parse_spine_attachment(
    name: &str,
    raw: &JsonRecord,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Attachment2DRef> {
    let kind = raw.get("type").and_then(Value::as_str).unwrap_or("region");
    if kind == "region" {
        let mut attachment: RegionAttachment2D = allocate_entity();
        attachment.height = number_or(raw.get("height"), 0.0);
        attachment.kind = REGION_ATTACHMENT_2D_KIND.to_string();
        attachment.name = Some(name.to_string());
        attachment.rotation = number_or(raw.get("rotation"), 0.0);
        attachment.scale_x = number_or(raw.get("scaleX"), 1.0);
        attachment.scale_y = number_or(raw.get("scaleY"), 1.0);
        attachment.width = number_or(raw.get("width"), 0.0);
        attachment.x = number_or(raw.get("x"), 0.0);
        attachment.y = number_or(raw.get("y"), 0.0);
        return Some(Arc::new(RwLock::new(attachment)));
    }
    if kind == "mesh" {
        return Some(parse_spine_mesh_attachment(name, raw, diagnostics));
    }
    let mut detail = HashMap::new();
    detail.insert("name".to_string(), ImportDiagnosticDetailValue::Number(1.0));
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Skip,
        &format!("spine.{kind}-attachment-unsupported"),
        "parseSpineAttachment",
        Some(detail),
    );
    return None;
}

fn parse_spine_mesh_attachment(
    name: &str,
    raw: &JsonRecord,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Attachment2DRef {
    let uvs = float_array(raw.get("uvs"));
    let triangles = u16_array(raw.get("triangles"));
    let raw_vertices = float_array(raw.get("vertices"));
    let vertex_count = uvs.len() / 2;
    let (skin, vertices) = if raw_vertices.len() == vertex_count * 2 {
        (None, Some(raw_vertices))
    } else {
        (
            Some(Arc::new(RwLock::new(parse_spine_weighted_vertices(
                &raw_vertices,
                vertex_count,
                diagnostics,
            )))),
            None,
        )
    };
    let mut attachment: MeshAttachment2D = allocate_entity();
    attachment.kind = MESH_ATTACHMENT_2D_KIND.to_string();
    attachment.name = Some(name.to_string());
    attachment.skin = skin;
    attachment.triangles = triangles;
    attachment.uvs = uvs;
    attachment.vertex_count = vertex_count;
    attachment.vertices = vertices;
    return Arc::new(RwLock::new(attachment));
}

fn parse_spine_skins(
    raw: Option<&Value>,
    slots: &[Slot2D],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<AttachmentSkin2D> {
    let mut named: Vec<(String, &Value)> = Vec::new();
    if let Some(array) = raw.and_then(Value::as_array) {
        for skin in array.iter().filter_map(Value::as_object) {
            let name = skin
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("default")
                .to_string();
            if let Some(attachments) = skin.get("attachments") {
                named.push((name, attachments));
            }
        }
    } else if let Some(object) = raw.and_then(Value::as_object) {
        named.extend(object.iter().map(|(name, value)| (name.clone(), value)));
    }
    let mut skins = Vec::new();
    for (name, raw_attachments) in named {
        let Some(slot_groups) = raw_attachments.as_object() else {
            continue;
        };
        let mut attachments = Vec::new();
        for (slot_name, slot_attachments) in slot_groups {
            let Some(slot_attachments) = slot_attachments.as_object() else {
                continue;
            };
            let slot_index = index_of_spine_slot(slots, slot_name);
            for (attachment_name, raw_attachment) in slot_attachments {
                let Some(raw_attachment) = raw_attachment.as_object() else {
                    continue;
                };
                let attachment = parse_spine_attachment(
                    attachment_name,
                    raw_attachment,
                    diagnostics.as_deref_mut(),
                );
                if let Some(attachment) = attachment.filter(|_| slot_index >= 0) {
                    attachments.push(SkinAttachment2D {
                        attachment,
                        name: attachment_name.clone(),
                        slot_index,
                    });
                }
            }
        }
        skins.push(AttachmentSkin2D { attachments, name });
    }
    return skins;
}

fn parse_spine_weighted_vertices(
    raw: &[f32],
    vertex_count: usize,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> flight_skeleton2d::Skin2D {
    let mut influence_counts = vec![0_u16; vertex_count];
    let mut influences = Vec::new();
    let mut offset = 0_usize;
    let mut truncated = false;
    for count in &mut influence_counts {
        if offset >= raw.len() {
            truncated = true;
            break;
        }
        let declared = raw[offset] as i32;
        offset += 1;
        let available = (raw.len() - offset) / 4;
        let actual = declared.max(0) as usize;
        let actual = actual.min(available).min(u16::MAX as usize);
        if actual as i32 != declared {
            truncated = true;
        }
        *count = actual as u16;
        influences.extend_from_slice(&raw[offset..offset + actual * 4]);
        offset += actual * 4;
    }
    if truncated {
        let mut detail = HashMap::new();
        detail.insert(
            "vertices".to_string(),
            ImportDiagnosticDetailValue::Number(1.0),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "spine.weighted-vertices-truncated",
            "parseSpineWeightedVertices",
            Some(detail),
        );
    }
    return create_skin_2d(influence_counts, influences);
}

pub fn spine_json_skins_section_handler(context: &mut SpineJsonSectionContext<'_>) {
    let skins = parse_spine_skins(
        context.doc.get("skins"),
        &context.slots,
        context.diagnostics.as_deref_mut(),
    );
    context.skins.extend(skins);
}

fn u16_array(value: Option<&Value>) -> Vec<u16> {
    return value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .map(|value| value.as_u64().unwrap_or(0) as u16)
                .collect()
        })
        .unwrap_or_default();
}
