use std::collections::HashMap;

use flight_entity::{Uint8Array, allocate_entity};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_materials::{
    BLEND_MODE_DARKEN, BLEND_MODE_LIGHTEN, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL,
    BLEND_MODE_SCREEN,
};
use flight_math::RAD_TO_DEG;
use flight_node::{NodeRef, add_node_child};
use flight_scene2d::{Node2DRef, create_display_object};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_document::parse_rive_document;
use crate::rive_import_registry::{
    apply_rive_artboard_handlers, apply_rive_document_handlers,
    create_rive_artboard_import_context, create_rive_document_import_context,
    get_rive_core_object_handler,
};
use crate::rive_object_graph::create_rive_object_graph;
use crate::types::*;

fn create_rive_artboard_import(
    registry: &RiveImportRegistry,
    artboard: &RiveArtboardGraph,
    objects: &[RiveCoreObject],
    font_names: &[String],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RiveArtboardImport {
    let source = &artboard.objects[0];
    let width = read_rive_number(source, RIVE_WIDTH, 0.0);
    let height = read_rive_number(source, RIVE_HEIGHT, 0.0);
    let name = read_rive_text(source, RIVE_NAME, "");
    let root = create_display_object();
    root.write().unwrap().name = Some(name.clone());
    let root: Node2DRef = root;
    apply_rive_transform(&root, source);
    {
        let mut root = root.write().unwrap();
        root.node2d_fields_mut().pivot_x = read_rive_number(source, RIVE_ORIGIN_X, 0.0) * width;
        root.node2d_fields_mut().pivot_y = read_rive_number(source, RIVE_ORIGIN_Y, 0.0) * height;
    }

    let mut context = create_rive_artboard_import_context(
        registry,
        artboard,
        objects,
        root.clone(),
        font_names,
        diagnostics,
    );
    for index in 1..artboard.objects.len() {
        let node = import_rive_component(&mut context, index);
        context.nodes.push(node);
    }
    apply_rive_artboard_handlers(&mut context);
    return RiveArtboardImport {
        advanced_blends: std::mem::take(&mut context.advanced_blends),
        animations: std::mem::take(&mut context.animations),
        height,
        layouts: std::mem::take(&mut context.layouts),
        name,
        root,
        skeleton: context.skeleton.take(),
        state_machines: std::mem::take(&mut context.state_machines),
        width,
    };
}

pub fn create_rive_document_import_result(
    registry: &RiveImportRegistry,
    source: &Uint8Array,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RiveDocumentImportResult {
    let mut out: RiveDocumentImportResult = allocate_entity();
    let Some(document) = parse_rive_document(source, diagnostics.as_deref_mut()) else {
        initialize_rive_document_import_result(&mut out, Vec::new(), Vec::new());
        return out;
    };
    let graph = create_rive_object_graph(&document, diagnostics.as_deref_mut());
    let assets = {
        let mut context = create_rive_document_import_context(
            registry,
            &document.objects,
            diagnostics.as_deref_mut(),
        );
        apply_rive_document_handlers(&mut context);
        std::mem::take(&mut context.assets)
    };
    let mut font_names = Vec::new();
    for index in 0..assets.len() {
        font_names.push(assets[index].name.clone());
    }
    let mut artboards = Vec::new();
    for artboard in &graph.artboards {
        artboards.push(create_rive_artboard_import(
            registry,
            artboard,
            &document.objects,
            &font_names,
            diagnostics.as_deref_mut(),
        ));
    }
    initialize_rive_document_import_result(&mut out, artboards, assets);
    return out;
}

fn create_rive_unregistered_node(
    context: &mut RiveArtboardImportContext<'_>,
    object: &RiveCoreObject,
) -> Option<Node2DRef> {
    if !is_rive_type(object.type_key, RIVE_NODE_TYPE_KEY) {
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "rive.core-type-unregistered",
            "createRiveUnregisteredNode",
            Some(HashMap::from([(
                "typeKey".to_string(),
                ImportDiagnosticDetailValue::Number(object.type_key as f32),
            )])),
        );
        return None;
    }
    if is_rive_type(object.type_key, RIVE_DRAWABLE_TYPE_KEY) {
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "rive.drawable-kind-unsupported",
            "createRiveUnregisteredNode",
            Some(HashMap::from([(
                "typeKey".to_string(),
                ImportDiagnosticDetailValue::Number(object.type_key as f32),
            )])),
        );
    }
    let node = create_display_object();
    node.write().unwrap().name = Some(read_rive_text(object, RIVE_NAME, ""));
    return Some(node);
}

pub fn initialize_rive_document_import_result(
    out: &mut RiveDocumentImportResult,
    artboards: Vec<RiveArtboardImport>,
    assets: Vec<RiveFileAsset>,
) {
    out.artboards = artboards;
    out.assets = assets;
}

fn advanced_rive_blend_modes() -> HashMap<i32, &'static str> {
    return HashMap::from([
        (15, "Overlay"),
        (18, "ColorDodge"),
        (19, "ColorBurn"),
        (20, "HardLight"),
        (21, "SoftLight"),
        (22, "Difference"),
        (23, "Exclusion"),
        (25, "Hue"),
        (26, "Saturation"),
        (27, "Color"),
        (28, "Luminosity"),
    ]);
}

fn apply_rive_blend_mode(
    target: &Node2DRef,
    source: &RiveCoreObject,
    advanced: &mut Vec<RiveAdvancedBlend>,
) {
    if !is_rive_type(source.type_key, RIVE_DRAWABLE_TYPE_KEY) {
        return;
    }
    let value = read_rive_number(source, RIVE_BLEND_MODE, RIVE_BLEND_SRC_OVER);
    if let Some(mode) = fixed_rive_blend_modes().get(&(value as i32)) {
        target.write().unwrap().node2d_fields_mut().blend_mode = Some((*mode).to_string());
        return;
    }
    target.write().unwrap().node2d_fields_mut().blend_mode = Some(BLEND_MODE_NORMAL.to_string());
    if let Some(mode) = advanced_rive_blend_modes().get(&(value as i32)) {
        advanced.push(RiveAdvancedBlend {
            mode: (*mode).to_string(),
            node: target.clone(),
        });
    }
}

fn apply_rive_transform(target: &Node2DRef, source: &RiveCoreObject) {
    let mut target = target.write().unwrap();
    let fields = target.node2d_fields_mut();
    fields.x = read_rive_number(source, RIVE_X, read_rive_number(source, RIVE_X_LEGACY, 0.0));
    fields.y = read_rive_number(source, RIVE_Y, read_rive_number(source, RIVE_Y_LEGACY, 0.0));
    fields.rotation = read_rive_number(source, RIVE_ROTATION, 0.0) * RAD_TO_DEG;
    fields.scale_x = read_rive_number(source, RIVE_SCALE_X, 1.0);
    fields.scale_y = read_rive_number(source, RIVE_SCALE_Y, 1.0);
    fields.alpha = read_rive_number(source, RIVE_OPACITY, 1.0);
}

fn find_rive_display_parent(
    nodes: &[Option<Node2DRef>],
    parent_indices: &[i32],
    index: usize,
) -> Option<Node2DRef> {
    let mut parent = *parent_indices.get(index)?;
    while let Ok(parent_index) = usize::try_from(parent) {
        if let Some(Some(node)) = nodes.get(parent_index) {
            return Some(node.clone());
        }
        let Some(next) = parent_indices.get(parent_index) else {
            break;
        };
        parent = *next;
    }
    return None;
}

fn fixed_rive_blend_modes() -> HashMap<i32, &'static str> {
    return HashMap::from([
        (3, BLEND_MODE_NORMAL),
        (14, BLEND_MODE_SCREEN),
        (16, BLEND_MODE_DARKEN),
        (17, BLEND_MODE_LIGHTEN),
        (24, BLEND_MODE_MULTIPLY),
    ]);
}

fn import_rive_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let object = context.artboard.objects.get(index)?.clone();
    let handler = i32::try_from(object.type_key)
        .ok()
        .and_then(|type_key| get_rive_core_object_handler(context.registry, type_key));
    let node = if let Some(handler) = handler {
        handler
            .import_component
            .as_ref()
            .and_then(|import| import(context, index))
    } else {
        create_rive_unregistered_node(context, &object)
    }?;
    apply_rive_transform(&node, &object);
    apply_rive_blend_mode(&node, &object, &mut context.advanced_blends);
    let parent = find_rive_display_parent(&context.nodes, &context.artboard.parent_indices, index)
        .unwrap_or_else(|| context.root.clone());
    let parent_ref: NodeRef = parent;
    let node_ref: NodeRef = node.clone();
    add_node_child(&parent_ref, &node_ref);
    return Some(node);
}

fn is_rive_type(type_key: u64, ancestor: i32) -> bool {
    return i32::try_from(type_key)
        .is_ok_and(|type_key| is_rive_core_type_derived_from(type_key, ancestor));
}

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f32) -> f32 {
    let Some(property) = source
        .properties
        .iter()
        .find(|property| property.key == key)
    else {
        return fallback;
    };
    return match property.value {
        RiveValue::Uint(value) => value as f32,
        RiveValue::Double(value) => value,
        RiveValue::Color(value) => value as f32,
        _ => fallback,
    };
}

fn read_rive_text(source: &RiveCoreObject, key: u64, fallback: &str) -> String {
    let Some(property) = source
        .properties
        .iter()
        .find(|property| property.key == key)
    else {
        return fallback.to_string();
    };
    return match &property.value {
        RiveValue::String(value) => value.clone(),
        _ => fallback.to_string(),
    };
}

const RIVE_NODE_TYPE_KEY: i32 = 2;
const RIVE_DRAWABLE_TYPE_KEY: i32 = 13;

const RIVE_NAME: u64 = 4;
const RIVE_WIDTH: u64 = 7;
const RIVE_HEIGHT: u64 = 8;
const RIVE_X_LEGACY: u64 = 9;
const RIVE_Y_LEGACY: u64 = 10;
const RIVE_ORIGIN_X: u64 = 11;
const RIVE_ORIGIN_Y: u64 = 12;
const RIVE_X: u64 = 13;
const RIVE_Y: u64 = 14;
const RIVE_ROTATION: u64 = 15;
const RIVE_SCALE_X: u64 = 16;
const RIVE_SCALE_Y: u64 = 17;
const RIVE_OPACITY: u64 = 18;
const RIVE_BLEND_MODE: u64 = 23;
const RIVE_BLEND_SRC_OVER: f32 = 3.0;
