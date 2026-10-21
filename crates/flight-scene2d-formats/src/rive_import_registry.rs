use std::sync::Arc;

use flight_importdiagnostics::ImportDiagnostic;
use flight_scene2d::Node2DRef;

use crate::rive_core_types::get_rive_core_type_parent;
use crate::types::*;

pub fn create_rive_artboard_import_context<'a>(
    registry: &'a RiveImportRegistry,
    artboard: &'a RiveArtboardGraph,
    objects: &'a [RiveCoreObject],
    root: Node2DRef,
    font_names: &'a [String],
    diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
) -> RiveArtboardImportContext<'a> {
    let mut out = RiveArtboardImportContext {
        advanced_blends: Vec::new(),
        animation_artboard: Arc::new(std::sync::RwLock::new(artboard.clone())),
        animations: Vec::new(),
        artboard,
        diagnostics: None,
        font_names,
        layouts: Vec::new(),
        nodes: Vec::new(),
        objects,
        rebuilds: std::collections::HashMap::new(),
        registry,
        root: root.clone(),
        runtime: Default::default(),
        shape_paths: std::collections::HashMap::new(),
        skeleton: None,
        state_machines: Vec::new(),
    };
    initialize_rive_artboard_import_context(
        &mut out,
        registry,
        artboard,
        objects,
        root,
        font_names,
        diagnostics,
    );
    return out;
}

pub fn create_rive_document_import_context<'a>(
    registry: &'a RiveImportRegistry,
    objects: &'a [RiveCoreObject],
    diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
) -> RiveDocumentImportContext<'a> {
    let mut out = RiveDocumentImportContext {
        assets: Vec::new(),
        diagnostics: None,
        objects,
        registry,
        runtime: Default::default(),
    };
    initialize_rive_document_import_context(&mut out, registry, objects, diagnostics);
    return out;
}

pub fn create_rive_import_registry() -> RiveImportRegistry {
    return RiveImportRegistry::default();
}

pub fn initialize_rive_artboard_import_context<'a>(
    out: &mut RiveArtboardImportContext<'a>,
    registry: &'a RiveImportRegistry,
    artboard: &'a RiveArtboardGraph,
    objects: &'a [RiveCoreObject],
    root: Node2DRef,
    font_names: &'a [String],
    diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
) {
    out.advanced_blends.clear();
    out.animation_artboard = Arc::new(std::sync::RwLock::new(artboard.clone()));
    out.animations.clear();
    out.artboard = artboard;
    out.diagnostics = diagnostics;
    out.font_names = font_names;
    out.layouts.clear();
    out.nodes.clear();
    out.nodes.push(Some(root.clone()));
    out.objects = objects;
    out.rebuilds.clear();
    out.registry = registry;
    out.root = root;
    out.shape_paths.clear();
    out.skeleton = None;
    out.state_machines.clear();
}

pub fn initialize_rive_document_import_context<'a>(
    out: &mut RiveDocumentImportContext<'a>,
    registry: &'a RiveImportRegistry,
    objects: &'a [RiveCoreObject],
    diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
) {
    out.assets.clear();
    out.diagnostics = diagnostics;
    out.objects = objects;
    out.registry = registry;
}

pub fn apply_rive_artboard_handlers(context: &mut RiveArtboardImportContext<'_>) {
    let handlers = context
        .registry
        .handlers
        .iter()
        .map(|entry| entry.handle.clone())
        .collect::<Vec<_>>();
    let mut applied = Vec::<Arc<RiveCoreObjectHandler>>::new();
    for importer in handlers {
        let Some(apply) = &importer.apply_artboard else {
            continue;
        };
        if applied.iter().any(|seen| Arc::ptr_eq(seen, &importer)) {
            continue;
        }
        applied.push(importer.clone());
        apply(context);
    }
}

pub fn apply_rive_document_handlers(context: &mut RiveDocumentImportContext<'_>) {
    let handlers = context
        .registry
        .handlers
        .iter()
        .map(|entry| entry.handle.clone())
        .collect::<Vec<_>>();
    let mut applied = Vec::<Arc<RiveCoreObjectHandler>>::new();
    for importer in handlers {
        let Some(apply) = &importer.apply_document else {
            continue;
        };
        if applied.iter().any(|seen| Arc::ptr_eq(seen, &importer)) {
            continue;
        }
        applied.push(importer.clone());
        apply(context);
    }
}

pub fn get_rive_core_object_handler(
    registry: &RiveImportRegistry,
    type_key: i32,
) -> Option<Arc<RiveCoreObjectHandler>> {
    let mut current = Some(type_key);
    while let Some(key) = current {
        if key == RIVE_NO_PARENT {
            break;
        }
        if let Some(entry) = registry.handlers.iter().find(|entry| entry.type_key == key) {
            return Some(entry.handle.clone());
        }
        current = get_rive_core_type_parent(key);
    }
    return None;
}

pub fn import_rive_core_object_as_data() -> Option<Node2DRef> {
    return None;
}

pub fn register_rive_core_object_handler(
    registry: &mut RiveImportRegistry,
    type_key: i32,
    importer: Arc<RiveCoreObjectHandler>,
) {
    if let Some(entry) = registry
        .handlers
        .iter_mut()
        .find(|entry| entry.type_key == type_key)
    {
        entry.handle = importer;
        return;
    }
    registry.handlers.push(RiveCoreObjectHandlerEntry {
        handle: importer,
        type_key,
    });
}

const RIVE_NO_PARENT: i32 = -1;
