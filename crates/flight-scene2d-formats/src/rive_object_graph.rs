use flight_entity::allocate_entity;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::types::{RiveArtboardGraph, RiveCoreObject, RiveDocument, RiveObjectGraph, RiveValue};

pub fn create_rive_object_graph(
    document: &RiveDocument,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RiveObjectGraph {
    let mut out: RiveObjectGraph = allocate_entity();
    initialize_rive_object_graph(&mut out, document, diagnostics);
    return out;
}

pub fn initialize_rive_object_graph(
    out: &mut RiveObjectGraph,
    document: &RiveDocument,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let mut artboards = Vec::<RiveArtboardGraph>::new();
    let mut current = None;
    for (index, object) in document.objects.iter().enumerate() {
        if object.type_key == RIVE_ARTBOARD_TYPE_KEY {
            if let Some(previous) = artboards.last_mut() {
                previous.stream_end = index;
            }
            artboards.push(RiveArtboardGraph {
                objects: vec![object.clone()],
                parent_indices: Vec::new(),
                stream_end: document.objects.len(),
                stream_start: index,
            });
            current = Some(artboards.len() - 1);
            continue;
        }
        let is_component = i32::try_from(object.type_key)
            .is_ok_and(|key| is_rive_core_type_derived_from(key, RIVE_COMPONENT_TYPE_KEY));
        if !is_component {
            continue;
        }
        if let Some(current) = current {
            artboards[current].objects.push(object.clone());
        }
    }
    for artboard in &mut artboards {
        resolve_rive_parent_indices(artboard, diagnostics.as_deref_mut());
    }
    out.artboards = artboards;
}

fn has_rive_parent_cycle(parents: &[i32], start: usize) -> bool {
    let mut slow = start as i32;
    let mut fast = start as i32;
    loop {
        if fast == RIVE_NO_PARENT {
            return false;
        }
        fast = parents[fast as usize];
        if fast == RIVE_NO_PARENT {
            return false;
        }
        fast = parents[fast as usize];
        slow = parents[slow as usize];
        if fast == slow {
            return true;
        }
    }
}

fn read_rive_parent_index(
    object: &RiveCoreObject,
    count: usize,
    index: usize,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> i32 {
    let Some(property) = object
        .properties
        .iter()
        .find(|candidate| candidate.key == RIVE_PARENT_ID_PROPERTY_KEY)
    else {
        report_rive_graph_drop(
            diagnostics,
            "rive.component-without-parent",
            "readRiveParentIndex",
            index,
            None,
        );
        return RIVE_NO_PARENT;
    };
    let parent = match property.value {
        RiveValue::Uint(value) => i32::try_from(value).ok(),
        RiveValue::Color(value) => i32::try_from(value).ok(),
        RiveValue::Double(value)
            if value.is_finite()
                && value.fract() == 0.0
                && value >= i32::MIN as f32
                && value <= i32::MAX as f32 =>
        {
            Some(value as i32)
        }
        _ => None,
    };
    let Some(parent) = parent else {
        report_rive_graph_drop(
            diagnostics,
            "rive.unresolved-parent",
            "readRiveParentIndex",
            index,
            None,
        );
        return RIVE_NO_PARENT;
    };
    if parent == index as i32 || parent < 0 || parent as usize >= count {
        report_rive_graph_drop(
            diagnostics,
            "rive.unresolved-parent",
            "readRiveParentIndex",
            index,
            Some(parent),
        );
        return RIVE_NO_PARENT;
    }
    return parent;
}

fn report_rive_graph_drop(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    kind: &str,
    origin: &str,
    index: usize,
    parent: Option<i32>,
) {
    let mut detail = std::collections::HashMap::from([(
        "index".to_string(),
        ImportDiagnosticDetailValue::Number(index as f32),
    )]);
    if let Some(parent) = parent {
        detail.insert(
            "parent".to_string(),
            ImportDiagnosticDetailValue::Number(parent as f32),
        );
    }
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        kind,
        origin,
        Some(detail),
    );
}

fn resolve_rive_parent_indices(
    artboard: &mut RiveArtboardGraph,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let count = artboard.objects.len();
    artboard.parent_indices.clear();
    artboard.parent_indices.reserve(count);
    for (index, object) in artboard.objects.iter().enumerate() {
        let parent = if index == 0 {
            RIVE_NO_PARENT
        } else {
            read_rive_parent_index(object, count, index, diagnostics.as_deref_mut())
        };
        artboard.parent_indices.push(parent);
    }
    for index in 1..count {
        if !has_rive_parent_cycle(&artboard.parent_indices, index) {
            continue;
        }
        report_rive_graph_drop(
            diagnostics.as_deref_mut(),
            "rive.parent-cycle",
            "resolveRiveParentIndices",
            index,
            None,
        );
        artboard.parent_indices[index] = RIVE_NO_PARENT;
    }
}

const RIVE_ARTBOARD_TYPE_KEY: u64 = 1;
const RIVE_COMPONENT_TYPE_KEY: i32 = 10;
const RIVE_NO_PARENT: i32 = -1;
const RIVE_PARENT_ID_PROPERTY_KEY: u64 = 5;
