use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    Attachment2DRef, AttachmentSkin2D, MESH_ATTACHMENT_2D_KIND, MeshAttachment2D,
    REGION_ATTACHMENT_2D_KIND, RegionAttachment2D, SkinAttachment2D, create_skin_2d,
};
use serde_json::Value;

use crate::dragon_bones_parse_helpers::parse_dragon_bones_bone_transform;
use crate::types::{DragonBonesSectionContext, JsonRecord};

const DEFAULT_DRAGON_BONES_SKIN_NAME: &str = "default";

pub fn dragon_bones_skins_section_handler(context: &mut DragonBonesSectionContext<'_>) {
    let Some(raw) = context.armature.get("skin").and_then(Value::as_array) else {
        return;
    };
    for raw_skin in raw {
        let Some(skin) = raw_skin.as_object() else {
            continue;
        };
        let skin_name = skin
            .get("name")
            .and_then(Value::as_str)
            .filter(|name| !name.is_empty())
            .unwrap_or(DEFAULT_DRAGON_BONES_SKIN_NAME)
            .to_string();
        let Some(raw_slots) = skin.get("slot").and_then(Value::as_array) else {
            continue;
        };
        let mut attachments = Vec::new();
        for raw_slot in raw_slots {
            let Some(slot) = raw_slot.as_object() else {
                continue;
            };
            let Some(slot_name) = slot.get("name").and_then(Value::as_str) else {
                continue;
            };
            let displays = parse_display_list(
                slot.get("display"),
                &context.raw_index_to_output,
                context.diagnostics.as_deref_mut(),
            );
            if skin_name == DEFAULT_DRAGON_BONES_SKIN_NAME {
                context
                    .display_table
                    .insert(slot_name.to_string(), displays.clone());
            }
            let Some(slot_index) = context.slot_order.get(slot_name).copied() else {
                continue;
            };
            for display in displays.into_iter().flatten() {
                let display_name = display
                    .read()
                    .expect("attachment")
                    .name()
                    .map(str::to_string);
                if let Some(name) = display_name {
                    attachments.push(SkinAttachment2D {
                        attachment: display,
                        name,
                        slot_index: slot_index as i32,
                    });
                }
            }
        }
        context.skins.push(AttachmentSkin2D {
            attachments,
            name: skin_name,
        });
    }
}

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

fn parse_display(
    display: Option<&JsonRecord>,
    raw_index_to_output: &[i32],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Attachment2DRef> {
    let display = display?;
    let kind = display
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("image");
    if kind == "image" {
        let transform = parse_dragon_bones_bone_transform(display.get("transform"));
        let mut attachment: RegionAttachment2D = allocate_entity();
        attachment.height = 0.0;
        attachment.kind = REGION_ATTACHMENT_2D_KIND.to_string();
        attachment.name = display
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string);
        attachment.rotation = transform.rotation;
        attachment.scale_x = transform.scale_x;
        attachment.scale_y = transform.scale_y;
        attachment.width = 0.0;
        attachment.x = transform.x;
        attachment.y = transform.y;
        return Some(Arc::new(RwLock::new(attachment)));
    }
    if kind == "mesh" {
        return parse_mesh(display, raw_index_to_output, diagnostics);
    }
    report_one(
        diagnostics,
        ImportDiagnosticSeverity::Skip,
        &format!("dragonbones.{kind}-display-unsupported"),
        "parseDragonBonesDisplay",
        "displays",
    );
    return None;
}

fn parse_display_list(
    raw: Option<&Value>,
    raw_index_to_output: &[i32],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Option<Attachment2DRef>> {
    let Some(raw) = raw.and_then(Value::as_array) else {
        return Vec::new();
    };
    return raw
        .iter()
        .map(|display| {
            parse_display(
                display.as_object(),
                raw_index_to_output,
                diagnostics.as_deref_mut(),
            )
        })
        .collect();
}

fn parse_mesh(
    display: &JsonRecord,
    raw_index_to_output: &[i32],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Attachment2DRef> {
    if display.contains_key("share") {
        report_one(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "dragonbones.shared-mesh-unsupported",
            "parseDragonBonesMeshDisplay",
            "displays",
        );
        return None;
    }
    if display.contains_key("weights") && !display.contains_key("bonePose") {
        report_one(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "dragonbones.legacy-weighted-mesh-unsupported",
            "parseDragonBonesMeshDisplay",
            "displays",
        );
        return None;
    }
    let uvs = float_array(display.get("uvs"));
    let vertex_count = uvs.len() / 2;
    let (skin, vertices) = if display.contains_key("weights") {
        (
            Some(Arc::new(RwLock::new(parse_weighted_skin(
                display,
                vertex_count,
                raw_index_to_output,
                diagnostics,
            )))),
            None,
        )
    } else {
        (None, Some(float_array(display.get("vertices"))))
    };
    let mut attachment: MeshAttachment2D = allocate_entity();
    attachment.kind = MESH_ATTACHMENT_2D_KIND.to_string();
    attachment.name = display
        .get("name")
        .and_then(Value::as_str)
        .map(str::to_string);
    attachment.skin = skin;
    attachment.triangles = u16_array(display.get("triangles"));
    attachment.uvs = uvs;
    attachment.vertex_count = vertex_count;
    attachment.vertices = vertices;
    return Some(Arc::new(RwLock::new(attachment)));
}

fn parse_weighted_skin(
    display: &JsonRecord,
    vertex_count: usize,
    raw_index_to_output: &[i32],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> flight_skeleton2d::Skin2D {
    let vertices = float_array(display.get("vertices"));
    let weights = float_array(display.get("weights"));
    let bone_pose = float_array(display.get("bonePose"));
    let slot_pose = float_array(display.get("slotPose"));
    let at = |values: &[f32], index: usize, fallback: f32| {
        values.get(index).copied().unwrap_or(fallback)
    };
    let (a, b, c, d, tx, ty) = (
        at(&slot_pose, 0, 1.0),
        at(&slot_pose, 1, 0.0),
        at(&slot_pose, 2, 0.0),
        at(&slot_pose, 3, 1.0),
        at(&slot_pose, 4, 0.0),
        at(&slot_pose, 5, 0.0),
    );
    let mut influence_counts = vec![0_u16; vertex_count];
    let mut influences = Vec::new();
    let mut offset = 0_usize;
    let mut recovered = false;
    for vertex in 0..vertex_count {
        if offset >= weights.len() {
            recovered = true;
            break;
        }
        let declared = weights[offset] as i32;
        offset += 1;
        let vx = at(&vertices, vertex * 2, 0.0);
        let vy = at(&vertices, vertex * 2 + 1, 0.0);
        let sx = a * vx + c * vy + tx;
        let sy = b * vx + d * vy + ty;
        let mut real = 0_u16;
        for _ in 0..declared.max(0) {
            if offset + 1 >= weights.len() {
                recovered = true;
                break;
            }
            let raw_bone = weights[offset] as i32;
            let weight = weights[offset + 1];
            offset += 2;
            let output_bone = raw_index_to_output
                .get(raw_bone.max(0) as usize)
                .copied()
                .unwrap_or(-1);
            let ordinal = bone_pose
                .chunks_exact(7)
                .position(|pose| pose[0] as i32 == raw_bone);
            let Some(ordinal) = ordinal.filter(|_| output_bone >= 0 && real < u16::MAX) else {
                recovered = true;
                continue;
            };
            let pose = &bone_pose[ordinal * 7..ordinal * 7 + 7];
            let det = pose[1] * pose[4] - pose[2] * pose[3];
            if det == 0.0 {
                recovered = true;
                continue;
            }
            let inv = 1.0 / det;
            let ia = pose[4] * inv;
            let ib = -pose[2] * inv;
            let ic = -pose[3] * inv;
            let id = pose[1] * inv;
            let itx = (pose[3] * pose[6] - pose[4] * pose[5]) * inv;
            let ity = (pose[2] * pose[5] - pose[1] * pose[6]) * inv;
            influences.extend([
                output_bone as f32,
                ia * sx + ic * sy + itx,
                ib * sx + id * sy + ity,
                weight,
            ]);
            real += 1;
        }
        influence_counts[vertex] = real;
    }
    if recovered {
        report_one(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "dragonbones.weighted-mesh-recovered",
            "parseDragonBonesWeightedMesh",
            "meshes",
        );
    }
    return create_skin_2d(influence_counts, influences);
}

fn report_one(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail_key: &str,
) {
    let mut detail = HashMap::new();
    detail.insert(
        detail_key.to_string(),
        ImportDiagnosticDetailValue::Number(1.0),
    );
    report_import_diagnostic(diagnostics, severity, kind, origin, Some(detail));
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
