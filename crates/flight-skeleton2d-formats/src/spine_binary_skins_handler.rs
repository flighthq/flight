use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    Attachment2DRef, AttachmentSkin2D, MESH_ATTACHMENT_2D_KIND, MeshAttachment2D,
    REGION_ATTACHMENT_2D_KIND, RegionAttachment2D, SkinAttachment2D, create_skin_2d,
};

use crate::spine_binary_parse_helpers::*;
use crate::spine_binary_reader::*;
use crate::types::{ByteReader, SpineBinarySectionContext, sorted_count_entries};

fn mesh_ref(
    name: Option<String>,
    skin: Option<Arc<RwLock<flight_skeleton2d::Skin2D>>>,
    triangles: Vec<u16>,
    uvs: Vec<f32>,
    vertex_count: usize,
    vertices: Option<Vec<f32>>,
) -> Attachment2DRef {
    let mut attachment: MeshAttachment2D = allocate_entity();
    attachment.kind = MESH_ATTACHMENT_2D_KIND.to_string();
    attachment.name = name;
    attachment.skin = skin;
    attachment.triangles = triangles;
    attachment.uvs = uvs;
    attachment.vertex_count = vertex_count;
    attachment.vertices = vertices;
    return Arc::new(RwLock::new(attachment));
}

fn parse_skins(context: &mut SpineBinarySectionContext<'_>, retain: bool) {
    let mut unmodeled: HashMap<String, usize> = HashMap::new();
    let default_slots = read_spine_binary_varint(&mut context.reader) as usize;
    if default_slots > 0 {
        let attachments = read_skin_body(context, default_slots, &mut unmodeled, retain);
        if retain {
            context.skins.push(AttachmentSkin2D {
                attachments,
                name: SPINE_BINARY_DEFAULT_SKIN_NAME.to_string(),
            });
        }
    }
    let alternates = read_spine_binary_varint(&mut context.reader) as usize;
    for _ in 0..alternates {
        if is_spine_binary_reader_overrun(&context.reader) {
            break;
        }
        let name = read_spine_binary_string_reference(&mut context.reader, &context.strings)
            .unwrap_or_default();
        for _ in 0..SPINE_BINARY_SKIN_REQUIREMENT_LISTS {
            let required = read_spine_binary_varint(&mut context.reader) as usize;
            for _ in 0..required {
                read_spine_binary_varint(&mut context.reader);
            }
        }
        let slot_count = read_spine_binary_varint(&mut context.reader) as usize;
        let attachments = read_skin_body(context, slot_count, &mut unmodeled, retain);
        if retain {
            context.skins.push(AttachmentSkin2D { attachments, name });
        }
    }
    if retain {
        for (kind, count) in sorted_count_entries(&unmodeled) {
            let mut detail = HashMap::new();
            detail.insert(
                "attachments".to_string(),
                ImportDiagnosticDetailValue::Number(count as f32),
            );
            report_import_diagnostic(
                context.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Skip,
                &format!("spine.{kind}-attachment-unsupported"),
                "parseSpineSkeletonBinary",
                Some(detail),
            );
        }
    }
}

fn read_attachment(
    context: &mut SpineBinarySectionContext<'_>,
    key: Option<&str>,
    unmodeled: &mut HashMap<String, usize>,
) -> Option<Attachment2DRef> {
    let name = read_spine_binary_string_reference(&mut context.reader, &context.strings)
        .or_else(|| key.map(str::to_string));
    let ordinal = read_spine_binary_byte(&mut context.reader) as usize;
    let kind = SPINE_BINARY_ATTACHMENT_TYPES.get(ordinal).copied();
    if kind == Some("region") {
        read_spine_binary_varint(&mut context.reader);
        let rotation = read_spine_binary_float(&mut context.reader);
        let x = read_spine_binary_float(&mut context.reader);
        let y = read_spine_binary_float(&mut context.reader);
        let scale_x = read_spine_binary_float(&mut context.reader);
        let scale_y = read_spine_binary_float(&mut context.reader);
        let width = read_spine_binary_float(&mut context.reader);
        let height = read_spine_binary_float(&mut context.reader);
        skip_spine_binary_bytes(&mut context.reader, SPINE_BINARY_COLOR_BYTES);
        skip_sequence(&mut context.reader);
        let mut attachment: RegionAttachment2D = allocate_entity();
        attachment.height = height;
        attachment.kind = REGION_ATTACHMENT_2D_KIND.to_string();
        attachment.name = name;
        attachment.rotation = rotation;
        attachment.scale_x = scale_x;
        attachment.scale_y = scale_y;
        attachment.width = width;
        attachment.x = x;
        attachment.y = y;
        return Some(Arc::new(RwLock::new(attachment)));
    }
    if kind == Some("mesh") {
        return Some(read_mesh(context, name));
    }
    *unmodeled
        .entry(kind.unwrap_or("unknown").to_string())
        .or_default() += 1;
    match kind {
        Some("boundingbox") => {
            let count = read_spine_binary_varint(&mut context.reader) as usize;
            read_vertices(&mut context.reader, count);
            if context.nonessential {
                skip_spine_binary_bytes(&mut context.reader, 4);
            }
        }
        Some("clipping") => {
            read_spine_binary_varint(&mut context.reader);
            let count = read_spine_binary_varint(&mut context.reader) as usize;
            read_vertices(&mut context.reader, count);
            if context.nonessential {
                skip_spine_binary_bytes(&mut context.reader, 4);
            }
        }
        Some("point") => {
            skip_spine_binary_bytes(&mut context.reader, 12);
            if context.nonessential {
                skip_spine_binary_bytes(&mut context.reader, 4);
            }
        }
        Some("linkedmesh") => {
            read_spine_binary_varint(&mut context.reader);
            skip_spine_binary_bytes(&mut context.reader, 4);
            read_spine_binary_varint(&mut context.reader);
            read_spine_binary_varint(&mut context.reader);
            read_spine_binary_boolean(&mut context.reader);
            skip_sequence(&mut context.reader);
            if context.nonessential {
                skip_spine_binary_bytes(&mut context.reader, 8);
            }
        }
        Some("path") => {
            skip_spine_binary_bytes(&mut context.reader, 2);
            let count = read_spine_binary_varint(&mut context.reader) as usize;
            read_vertices(&mut context.reader, count);
            skip_spine_binary_bytes(&mut context.reader, count / 3 * 4);
            if context.nonessential {
                skip_spine_binary_bytes(&mut context.reader, 4);
            }
        }
        None => {
            let overrun = context.reader.view.len().saturating_add(1);
            skip_spine_binary_bytes(&mut context.reader, overrun);
        }
        _ => {}
    }
    return None;
}

fn read_mesh(context: &mut SpineBinarySectionContext<'_>, name: Option<String>) -> Attachment2DRef {
    read_spine_binary_varint(&mut context.reader);
    skip_spine_binary_bytes(&mut context.reader, 4);
    let vertex_count = read_spine_binary_varint(&mut context.reader) as usize;
    if !has_spine_binary_bytes(&context.reader, vertex_count.saturating_mul(8)) {
        return reject_mesh(context, name, "vertexCount", vertex_count);
    }
    let uvs = (0..vertex_count * 2)
        .map(|_| read_spine_binary_float(&mut context.reader))
        .collect::<Vec<_>>();
    let triangle_count = read_spine_binary_varint(&mut context.reader) as usize;
    if !has_spine_binary_bytes(&context.reader, triangle_count.saturating_mul(2)) {
        return reject_mesh(context, name, "triangleCount", triangle_count);
    }
    let triangles = (0..triangle_count)
        .map(|_| read_spine_binary_unsigned_short(&mut context.reader))
        .collect();
    let (skin, vertices) = read_vertices(&mut context.reader, vertex_count);
    read_spine_binary_varint(&mut context.reader);
    skip_sequence(&mut context.reader);
    if context.nonessential {
        let edges = read_spine_binary_varint(&mut context.reader) as usize;
        skip_spine_binary_bytes(
            &mut context.reader,
            edges.saturating_mul(2).saturating_add(8),
        );
    }
    return mesh_ref(name, skin, triangles, uvs, vertex_count, vertices);
}

fn read_skin_body(
    context: &mut SpineBinarySectionContext<'_>,
    slot_count: usize,
    unmodeled: &mut HashMap<String, usize>,
    retain: bool,
) -> Vec<SkinAttachment2D> {
    let mut attachments = Vec::new();
    for _ in 0..slot_count {
        if is_spine_binary_reader_overrun(&context.reader) {
            break;
        }
        let slot_index = read_spine_binary_varint(&mut context.reader) as i32;
        let entries = read_spine_binary_varint(&mut context.reader) as usize;
        for _ in 0..entries {
            let key = read_spine_binary_string_reference(&mut context.reader, &context.strings);
            let attachment = read_attachment(context, key.as_deref(), unmodeled);
            if retain {
                if let (Some(attachment), Some(name)) = (attachment, key) {
                    attachments.push(SkinAttachment2D {
                        attachment,
                        name,
                        slot_index,
                    });
                }
            }
        }
    }
    return attachments;
}

fn read_vertices(
    reader: &mut ByteReader<'_>,
    vertex_count: usize,
) -> (
    Option<Arc<RwLock<flight_skeleton2d::Skin2D>>>,
    Option<Vec<f32>>,
) {
    if !read_spine_binary_boolean(reader) {
        return (
            None,
            Some(
                (0..vertex_count * 2)
                    .map(|_| read_spine_binary_float(reader))
                    .collect(),
            ),
        );
    }
    let mut bone_counts = vec![0_u16; vertex_count];
    let mut influences = Vec::new();
    for count in &mut bone_counts {
        if is_spine_binary_reader_overrun(reader) {
            break;
        }
        let value = read_spine_binary_varint(reader).min(u16::MAX as u32) as u16;
        *count = value;
        for _ in 0..value {
            influences.extend([
                read_spine_binary_varint(reader) as f32,
                read_spine_binary_float(reader),
                read_spine_binary_float(reader),
                read_spine_binary_float(reader),
            ]);
        }
    }
    return (
        Some(Arc::new(RwLock::new(create_skin_2d(
            bone_counts,
            influences,
        )))),
        None,
    );
}

fn reject_mesh(
    context: &mut SpineBinarySectionContext<'_>,
    name: Option<String>,
    field: &str,
    declared: usize,
) -> Attachment2DRef {
    let mut detail = HashMap::new();
    detail.insert(
        "attachment".to_string(),
        ImportDiagnosticDetailValue::String(name.clone().unwrap_or_default()),
    );
    detail.insert(
        "declared".to_string(),
        ImportDiagnosticDetailValue::Number(declared as f32),
    );
    detail.insert(
        "field".to_string(),
        ImportDiagnosticDetailValue::String(field.to_string()),
    );
    detail.insert(
        "remaining".to_string(),
        ImportDiagnosticDetailValue::Number(
            context
                .reader
                .view
                .len()
                .saturating_sub(context.reader.offset) as f32,
        ),
    );
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Drop,
        "spine.binary-count-unsatisfiable",
        "readSpineBinaryMeshAttachment",
        Some(detail),
    );
    let overrun = context.reader.view.len().saturating_add(1);
    skip_spine_binary_bytes(&mut context.reader, overrun);
    return mesh_ref(name, None, Vec::new(), Vec::new(), 0, None);
}

fn skip_sequence(reader: &mut ByteReader<'_>) {
    if read_spine_binary_boolean(reader) {
        for _ in 0..4 {
            read_spine_binary_varint(reader);
        }
    }
}

pub fn skip_spine_binary_skins_section(context: &mut SpineBinarySectionContext<'_>) {
    parse_skins(context, false);
}

pub fn spine_binary_skins_section_handler(context: &mut SpineBinarySectionContext<'_>) {
    parse_skins(context, true);
}
