use std::sync::Arc;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_scene2d::{Node2DRef, create_display_object};

use crate::rive_import_registry::register_rive_core_object_handler;
use crate::types::*;

pub fn apply_rive_solo(
    nodes: &[Option<Node2DRef>],
    artboard: &RiveArtboardGraph,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    for (index, object) in artboard.objects.iter().enumerate() {
        if object.type_key != RIVE_SOLO_TYPE_KEY as u64 {
            continue;
        }
        let active = read_rive_solo_active_index(object);
        if active.and_then(|active| artboard.parent_indices.get(active).copied())
            != Some(index as i32)
        {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.solo-unresolved-active",
                "applyRiveSolo",
                None,
            );
            continue;
        }
        let active = active.expect("resolved active index");
        for (child, parent) in artboard.parent_indices.iter().enumerate() {
            if child == active || *parent != index as i32 {
                continue;
            }
            if let Some(Some(node)) = nodes.get(child) {
                node.write().unwrap().node2d_fields_mut().visible = false;
            }
        }
    }
}

pub fn import_rive_solo_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let node = create_display_object();
    node.write().unwrap().name = Some(read_rive_solo_name(&context.artboard.objects[index]));
    return Some(node);
}

fn read_rive_solo_active_index(object: &RiveCoreObject) -> Option<usize> {
    let property = object
        .properties
        .iter()
        .find(|candidate| candidate.key == RIVE_ACTIVE_COMPONENT_ID)?;
    return match property.value {
        RiveValue::Uint(value) => usize::try_from(value).ok(),
        RiveValue::Double(value) if value.is_finite() && value >= 0.0 && value.fract() == 0.0 => {
            Some(value as usize)
        }
        RiveValue::Color(value) => usize::try_from(value).ok(),
        _ => None,
    };
}

fn read_rive_solo_name(source: &RiveCoreObject) -> String {
    let Some(property) = source
        .properties
        .iter()
        .find(|candidate| candidate.key == RIVE_NAME)
    else {
        return String::new();
    };
    return match &property.value {
        RiveValue::String(value) => value.clone(),
        _ => String::new(),
    };
}

pub fn register_rive_solo_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_SOLO_TYPE_KEY,
        Arc::new(RiveCoreObjectHandler {
            apply_artboard: Some(Arc::new(|context| {
                apply_rive_solo(
                    &context.nodes,
                    context.artboard,
                    context.diagnostics.as_deref_mut(),
                );
            })),
            apply_document: None,
            import_component: Some(Arc::new(import_rive_solo_component)),
        }),
    );
}

const RIVE_SOLO_TYPE_KEY: i32 = 147;
const RIVE_NAME: u64 = 4;
const RIVE_ACTIVE_COMPONENT_ID: u64 = 296;
