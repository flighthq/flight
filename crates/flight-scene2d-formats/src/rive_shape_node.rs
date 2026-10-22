use std::sync::{Arc, LazyLock, Mutex, RwLock, Weak};

use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene2d::{Node2D, Node2DRef, create_display_object};
use flight_shape::{Shape, clear_shape_commands, create_shape};

use crate::rive_import_registry::{
    get_rive_core_object_handler, register_rive_core_object_handler,
};
use crate::rive_shape_paint::{append_rive_shape_geometry, append_rive_shape_paint};
use crate::rive_shape_path::create_rive_path_record;
use crate::types::*;

struct RiveShapeBinding {
    node: Weak<RwLock<dyn Node2D>>,
    shape: Weak<RwLock<Shape>>,
}

// flight-lint: allow(hidden-state) source-equivalent weak side tables retain the typed handle behind an open Node2D reference without retaining either node strongly
static RIVE_SHAPE_BINDINGS: LazyLock<Mutex<Vec<RiveShapeBinding>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

pub fn import_rive_n_sliced_node_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let object = context.artboard.objects.get(index)?;
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Recover,
        "rive.nine-slice-substituted",
        "importRiveNSlicedNodeComponent",
        Some(std::collections::HashMap::from([
            (
                "substitutedAs".to_string(),
                ImportDiagnosticDetailValue::String("container".to_string()),
            ),
            (
                "typeKey".to_string(),
                ImportDiagnosticDetailValue::Number(object.type_key as f32),
            ),
        ])),
    );
    let node = create_display_object();
    node.write().unwrap().name = Some(read_rive_shape_name(object));
    return Some(node);
}

pub fn import_rive_shape_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let source = context.artboard.objects.get(index)?;
    let shape = create_shape();
    {
        use flight_node::contract::Node;
        shape.write().unwrap().node_fields_mut().name = Some(read_rive_shape_name(source));
    }
    let node: Node2DRef = shape.clone();
    let mut bindings = RIVE_SHAPE_BINDINGS.lock().unwrap();
    remove_expired_rive_shape_bindings(&mut bindings);
    bindings.push(RiveShapeBinding {
        node: Arc::downgrade(&node),
        shape: Arc::downgrade(&shape),
    });
    return Some(node);
}

fn read_rive_shape_name(source: &RiveCoreObject) -> String {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == RIVE_NAME)
        .and_then(|property| match &property.value {
            RiveValue::String(value) => Some(value.clone()),
            _ => None,
        })
        .unwrap_or_default();
}

fn rebuild_rive_shape(
    artboard: &RiveArtboardGraph,
    registry: &RiveImportRegistry,
    shape_index: usize,
    shape: &Ref<Shape>,
    path_indices: &[usize],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RivePathRecord> {
    let records = path_indices
        .iter()
        .filter_map(|path_index| create_rive_path_record(artboard, *path_index, None))
        .collect::<Vec<_>>();
    clear_shape_commands(shape);
    if get_rive_core_object_handler(registry, RIVE_SHAPE_PAINT).is_none() {
        append_rive_shape_geometry(shape, &records);
        return records;
    }
    append_rive_shape_paint(
        shape,
        artboard,
        shape_index,
        &records,
        diagnostics.as_deref_mut(),
    );
    return records;
}

// flight-lint: allow(hashmap-iteration) shape indices are sorted before the observable rebuild pass
pub fn rebuild_rive_shapes(context: &mut RiveArtboardImportContext<'_>) {
    *context.animation_artboard.write().unwrap() = context.artboard.clone();
    let mut shape_indices = context.shape_paths.keys().copied().collect::<Vec<_>>();
    shape_indices.sort_unstable();
    for shape_index in shape_indices {
        let Some(Some(node)) = context.nodes.get(shape_index) else {
            continue;
        };
        let Some(shape) = resolve_rive_shape(node) else {
            continue;
        };
        let path_indices = context.shape_paths[&shape_index]
            .iter()
            .map(|record| record.path_index)
            .collect::<Vec<_>>();
        let artboard = context.animation_artboard.clone();
        let registry = context.registry.clone();
        let rebuild_shape = shape.clone();
        let rebuild_paths = path_indices.clone();
        context.rebuilds.insert(
            shape_index,
            Arc::new(move || {
                let artboard = artboard.read().unwrap();
                rebuild_rive_shape(
                    &artboard,
                    &registry,
                    shape_index,
                    &rebuild_shape,
                    &rebuild_paths,
                    None,
                );
            }),
        );
        let records = rebuild_rive_shape(
            context.artboard,
            context.registry,
            shape_index,
            &shape,
            &path_indices,
            context.diagnostics.as_deref_mut(),
        );
        context.shape_paths.insert(shape_index, records);
    }
}

pub fn register_rive_shape_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_SHAPE,
        Arc::new(RiveCoreObjectHandler {
            apply_artboard: Some(Arc::new(rebuild_rive_shapes)),
            apply_document: None,
            import_component: Some(Arc::new(import_rive_shape_component)),
        }),
    );
    register_rive_core_object_handler(
        registry,
        RIVE_N_SLICED_NODE,
        Arc::new(RiveCoreObjectHandler {
            apply_artboard: None,
            apply_document: None,
            import_component: Some(Arc::new(import_rive_n_sliced_node_component)),
        }),
    );
}

fn remove_expired_rive_shape_bindings(bindings: &mut Vec<RiveShapeBinding>) {
    bindings
        .retain(|binding| binding.node.strong_count() != 0 && binding.shape.strong_count() != 0);
}

fn resolve_rive_shape(node: &Node2DRef) -> Option<Ref<Shape>> {
    let mut bindings = RIVE_SHAPE_BINDINGS.lock().unwrap();
    remove_expired_rive_shape_bindings(&mut bindings);
    return bindings.iter().find_map(|binding| {
        let candidate = binding.node.upgrade()?;
        if !Arc::ptr_eq(&candidate, node) {
            return None;
        }
        return binding.shape.upgrade();
    });
}

const RIVE_SHAPE: i32 = 3;
const RIVE_SHAPE_PAINT: i32 = 21;
const RIVE_N_SLICED_NODE: i32 = 508;
const RIVE_NAME: u64 = 4;
