use std::collections::HashMap;

use flight_entity::Uint8Array;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::create_skeleton_2d;

use crate::spine_binary_animations_handler::skip_spine_binary_animations_section;
use crate::spine_binary_bones_handler::skip_spine_binary_bones_section;
use crate::spine_binary_parse_helpers::*;
use crate::spine_binary_reader::*;
use crate::spine_binary_registry::get_spine_binary_section_handler;
use crate::spine_binary_skins_handler::skip_spine_binary_skins_section;
use crate::spine_binary_slots_handler::skip_spine_binary_slots_section;
use crate::spine_binary_stub_handlers::*;
use crate::types::*;

fn dispatch(
    context: &mut SpineBinarySectionContext<'_>,
    kind: &str,
    skip: for<'a> fn(&mut SpineBinarySectionContext<'a>),
) {
    if let Some(handler) = get_spine_binary_section_handler(context.registry, kind) {
        handler(context);
    } else {
        skip(context);
        let mut detail = HashMap::new();
        detail.insert(
            "section".to_string(),
            ImportDiagnosticDetailValue::String(kind.to_string()),
        );
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "spine.binary-section-unregistered",
            "parseSpineSkeletonBinaryWithRegistry",
            Some(detail),
        );
    }
}

fn is_supported_version(version: &str) -> bool {
    let mut parts = version.split('.');
    return matches!((parts.next(), parts.next()), (Some("4"), Some("1")));
}

pub fn parse_spine_skeleton_binary_with_registry(
    bytes: &Uint8Array,
    registry: &SpineBinaryRegistry,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Skeleton2DImport> {
    let mut reader = create_spine_binary_reader(bytes);
    skip_spine_binary_bytes(&mut reader, SPINE_BINARY_HASH_BYTES);
    let version = read_spine_binary_string(&mut reader);
    let mut diagnostics = diagnostics;
    let Some(version) = version.filter(|_| !is_spine_binary_reader_overrun(&reader)) else {
        reject_bytes(
            diagnostics.as_deref_mut(),
            "spine.binary-header-unreadable",
            bytes.len(),
        );
        return None;
    };
    if !is_supported_version(&version) {
        let mut detail = HashMap::new();
        detail.insert(
            "version".to_string(),
            ImportDiagnosticDetailValue::String(version),
        );
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "spine.binary-version-unsupported",
            "parseSpineSkeletonBinary",
            Some(detail),
        );
        return None;
    }
    skip_spine_binary_bytes(&mut reader, SPINE_BINARY_BOUNDS_BYTES);
    let nonessential = read_spine_binary_boolean(&mut reader);
    if nonessential {
        skip_spine_binary_bytes(&mut reader, SPINE_BINARY_FPS_BYTES);
        read_spine_binary_string(&mut reader);
        read_spine_binary_string(&mut reader);
    }
    let string_count = read_spine_binary_varint(&mut reader) as usize;
    let mut strings = Vec::new();
    for _ in 0..string_count {
        if is_spine_binary_reader_overrun(&reader) {
            break;
        }
        strings.push(read_spine_binary_string(&mut reader));
    }
    let mut context = SpineBinarySectionContext {
        animations: Vec::new(),
        attachment_names: Vec::new(),
        bones: Vec::new(),
        diagnostics,
        nonessential,
        reader,
        registry,
        skins: Vec::new(),
        slots: Vec::new(),
        strings,
    };
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_BONES,
        skip_spine_binary_bones_section,
    );
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_SLOTS,
        skip_spine_binary_slots_section,
    );
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_IK_CONSTRAINTS,
        skip_spine_binary_ik_constraints_section,
    );
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_TRANSFORM_CONSTRAINTS,
        skip_spine_binary_transform_constraints_section,
    );
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_PATH_CONSTRAINTS,
        skip_spine_binary_path_constraints_section,
    );
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_SKINS,
        skip_spine_binary_skins_section,
    );
    if let Some(setup) = context
        .skins
        .iter()
        .find(|skin| skin.name == SPINE_BINARY_DEFAULT_SKIN_NAME)
    {
        for entry in &setup.attachments {
            let index = entry.slot_index;
            if index >= 0
                && (index as usize) < context.slots.len()
                && context
                    .attachment_names
                    .get(index as usize)
                    .and_then(Option::as_deref)
                    == Some(&entry.name)
            {
                context.slots[index as usize].attachment = Some(entry.attachment.clone());
            }
        }
    }
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_EVENTS,
        skip_spine_binary_events_section,
    );
    dispatch(
        &mut context,
        SPINE_SECTION_KIND_ANIMATIONS,
        skip_spine_binary_animations_section,
    );
    if is_spine_binary_reader_overrun(&context.reader) {
        let mut detail = HashMap::new();
        detail.insert(
            "bones".to_string(),
            ImportDiagnosticDetailValue::Number(context.bones.len() as f32),
        );
        detail.insert(
            "slots".to_string(),
            ImportDiagnosticDetailValue::Number(context.slots.len() as f32),
        );
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "spine.binary-truncated",
            "parseSpineSkeletonBinary",
            Some(detail),
        );
    } else if context.reader.offset < bytes.len() {
        let mut detail = HashMap::new();
        detail.insert(
            "bytes".to_string(),
            ImportDiagnosticDetailValue::Number((bytes.len() - context.reader.offset) as f32),
        );
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "spine.binary-tail-unparsed",
            "parseSpineSkeletonBinary",
            Some(detail),
        );
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

fn reject_bytes(diagnostics: Option<&mut Vec<ImportDiagnostic>>, kind: &str, bytes: usize) {
    let mut detail = HashMap::new();
    detail.insert(
        "bytes".to_string(),
        ImportDiagnosticDetailValue::Number(bytes as f32),
    );
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Reject,
        kind,
        "parseSpineSkeletonBinary",
        Some(detail),
    );
}
