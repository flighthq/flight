use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Uint8Array, allocate_entity};
use flight_image::{
    EmbeddedImageResourceReferenceValue, ImageResourceReference,
    create_embedded_image_resource_reference,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_node::{NodeRef, add_node_child, get_node_child_at, get_node_child_count};
use flight_path_boolean::PathBooleanKernel;
use flight_scene2d::{
    Node2DRef, PartialNode2D, Scene2DSlotReference, as_node2d_ref, create_display_object,
};
use flight_texture::Texture;

use crate::rive_asset_binding::{
    get_rive_image_asset_index, get_rive_image_texture, get_rive_nested_artboard_index,
};
use crate::rive_import::create_scene2d_from_rive_document;
use crate::types::*;

fn create_rive_image_resources(
    imported: &RiveDocumentImportResult,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<ImageResourceReference> {
    let mut references = Vec::new();
    for index in 0..imported.assets.len() {
        let asset = &imported.assets[index];
        if asset.kind != RIVE_IMAGE_ASSET_KIND {
            continue;
        }
        let Some(bytes) = &asset.bytes else {
            continue;
        };
        let mime_type = to_rive_mime_type(bytes, index, diagnostics.as_deref_mut());
        let reference =
            create_embedded_image_resource_reference(Arc::new(RwLock::new(bytes.clone())));
        {
            let mut reference = reference.write().unwrap();
            reference.mime_type = mime_type;
            reference.textures = collect_rive_textures_for_asset(imported, index);
        }
        references.push(ImageResourceReference::Embedded(
            EmbeddedImageResourceReferenceValue { reference },
        ));
    }
    return references;
}

fn create_rive_slots(artboards: &[RiveArtboardImport]) -> Vec<Scene2DSlotReference> {
    let mut slots = Vec::new();
    for artboard in artboards {
        collect_rive_slots(&artboard.root, artboards, &mut slots);
    }
    return slots;
}

// flight-lint: allow(conform-array) D9 array negotiation: TS Readonly<Uint8Array> maps to the canonical byte slice lane
pub fn create_scene2d_document_from_rive_document(
    path_boolean_kernel: &PathBooleanKernel,
    source: &Uint8Array,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<RiveScene2DDocumentResult> {
    let imported =
        create_scene2d_from_rive_document(path_boolean_kernel, source, diagnostics.as_deref_mut());
    if imported.artboards.is_empty() {
        return None;
    }
    let root: Node2DRef = create_display_object(Some(&PartialNode2D {
        name: Some("Rive".to_string()),
        ..Default::default()
    }));
    for artboard in &imported.artboards {
        let root_ref: NodeRef = root.clone();
        let artboard_ref: NodeRef = artboard.root.clone();
        add_node_child(&root_ref, &artboard_ref);
    }
    let image_resources = create_rive_image_resources(&imported, diagnostics.as_deref_mut());
    let slots = create_rive_slots(&imported.artboards);
    let mut out: RiveScene2DDocumentResult = allocate_entity();
    initialize_rive_scene2d_document_result(&mut out, root, imported, image_resources, slots);
    return Some(out);
}

pub fn initialize_rive_scene2d_document_result(
    out: &mut RiveScene2DDocumentResult,
    root: Node2DRef,
    imported: RiveDocumentImportResult,
    image_resources: Vec<ImageResourceReference>,
    slots: Vec<Scene2DSlotReference>,
) {
    out.image_resources = image_resources;
    out.imported = imported;
    out.root = root;
    out.slots = slots;
}

fn collect_rive_slots(
    node: &Node2DRef,
    artboards: &[RiveArtboardImport],
    slots: &mut Vec<Scene2DSlotReference>,
) {
    let nested = get_rive_nested_artboard_index(node);
    if let Ok(index) = usize::try_from(nested) {
        let target = artboards.get(index);
        let node_name = node
            .read()
            .unwrap()
            .node_fields()
            .name
            .clone()
            .filter(|name| !name.is_empty());
        let mut slot: Scene2DSlotReference = allocate_entity();
        slot.content = None;
        slot.linkage = target.map(|target| target.name.clone());
        slot.name = node_name
            .or_else(|| target.map(|target| target.name.clone()))
            .unwrap_or_default();
        slot.required = false;
        slot.target = node.clone();
        slots.push(slot);
    }
    let node_ref: NodeRef = node.clone();
    for index in 0..get_node_child_count(&node_ref) {
        let Some(child) =
            get_node_child_at(&node_ref, index as i32).and_then(|child| as_node2d_ref(&child))
        else {
            continue;
        };
        collect_rive_slots(&child, artboards, slots);
    }
}

fn collect_rive_textures_for_asset(
    imported: &RiveDocumentImportResult,
    asset_index: usize,
) -> Vec<flight_entity::Ref<Texture>> {
    let mut textures = Vec::new();
    for artboard in &imported.artboards {
        collect_rive_textures_from_node(&artboard.root, asset_index, &mut textures);
    }
    return textures;
}

fn collect_rive_textures_from_node(
    node: &Node2DRef,
    asset_index: usize,
    textures: &mut Vec<flight_entity::Ref<Texture>>,
) {
    if get_rive_image_asset_index(node) == asset_index as i32 {
        if let Some(texture) = get_rive_image_texture(node) {
            textures.push(texture);
        }
    }
    let node_ref: NodeRef = node.clone();
    for index in 0..get_node_child_count(&node_ref) {
        let Some(child) =
            get_node_child_at(&node_ref, index as i32).and_then(|child| as_node2d_ref(&child))
        else {
            continue;
        };
        collect_rive_textures_from_node(&child, asset_index, textures);
    }
}

fn to_rive_mime_type(
    bytes: &Uint8Array,
    asset_index: usize,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<String> {
    if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47]) {
        return Some("image/png".to_string());
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg".to_string());
    }
    if bytes.starts_with(&[0x52, 0x49, 0x46, 0x46]) {
        return Some("image/webp".to_string());
    }
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        "rive.image-mime-type-undetected",
        "toRiveMimeType",
        Some(HashMap::from([(
            "assetIndex".to_string(),
            ImportDiagnosticDetailValue::Number(asset_index as f32),
        )])),
    );
    return None;
}

const RIVE_IMAGE_ASSET_KIND: &str = "ImageAsset";
