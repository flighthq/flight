use std::collections::HashMap;
use std::sync::Arc;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene2d::{Node2DRef, create_display_object};

use crate::rive_asset_binding::{create_rive_image_sprite, mark_rive_nested_artboard};
use crate::rive_core_types::{get_rive_core_type_name, is_rive_core_type_derived_from};
use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

pub fn create_rive_file_assets(
    objects: &[RiveCoreObject],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveFileAsset> {
    let mut assets = Vec::new();
    for object in objects {
        let type_key = i32::try_from(object.type_key).ok();
        if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_FILE_ASSET)) {
            assets.push(RiveFileAsset {
                bytes: None,
                cdn_base_url: read_rive_text(object, RIVE_ASSET_CDN_BASE_URL, ""),
                height: read_rive_number(object, RIVE_ASSET_HEIGHT, 0.0),
                kind: type_key
                    .and_then(get_rive_core_type_name)
                    .unwrap_or("")
                    .to_string(),
                name: read_rive_text(object, RIVE_ASSET_NAME, ""),
                width: read_rive_number(object, RIVE_ASSET_WIDTH, 0.0),
            });
            continue;
        }
        if object.type_key != RIVE_FILE_ASSET_CONTENTS as u64 {
            continue;
        }
        let bytes = read_rive_bytes(object, RIVE_ASSET_BYTES);
        if assets.is_empty() {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.asset-contents-unowned",
                "createRiveFileAssets",
                Some(HashMap::from([(
                    "bytes".to_string(),
                    ImportDiagnosticDetailValue::Number(
                        bytes.as_ref().map_or(0, |bytes| bytes.len()) as f32,
                    ),
                )])),
            );
            continue;
        }
        assets.last_mut().expect("asset exists").bytes = bytes;
    }
    return assets;
}

pub fn import_rive_image_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let object = context.artboard.objects.get(index)?;
    return Some(create_rive_image_sprite(
        &read_rive_text(object, RIVE_NAME, ""),
        read_rive_number(object, RIVE_IMAGE_ASSET_ID, -1.0) as i32,
    ));
}

pub fn import_rive_nested_artboard_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let object = context.artboard.objects.get(index)?;
    let node = create_display_object();
    node.write().unwrap().name = Some(read_rive_text(object, RIVE_NAME, ""));
    let node: Node2DRef = node;
    mark_rive_nested_artboard(
        &node,
        read_rive_number(object, RIVE_NESTED_ARTBOARD_ID, -1.0) as i32,
    );
    return Some(node);
}

fn read_rive_bytes(source: &RiveCoreObject, key: u64) -> Option<Box<[u8]>> {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .and_then(|property| match &property.value {
            RiveValue::Bytes(value) => Some(value.clone()),
            _ => None,
        });
}

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f32) -> f32 {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or(fallback, |property| match property.value {
            RiveValue::Uint(value) => value as f32,
            RiveValue::Double(value) => value,
            RiveValue::Color(value) => value as f32,
            _ => fallback,
        });
}

fn read_rive_text(source: &RiveCoreObject, key: u64, fallback: &str) -> String {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or_else(
            || fallback.to_string(),
            |property| match &property.value {
                RiveValue::String(value) => value.clone(),
                _ => fallback.to_string(),
            },
        );
}

pub fn register_rive_asset_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_FILE_ASSET,
        Arc::new(RiveCoreObjectHandler {
            apply_document: Some(Arc::new(|context| {
                context.assets.extend(create_rive_file_assets(
                    context.objects,
                    context.diagnostics.as_deref_mut(),
                ));
            })),
            ..RiveCoreObjectHandler::default()
        }),
    );
    register_rive_core_object_handler(
        registry,
        RIVE_IMAGE,
        Arc::new(RiveCoreObjectHandler {
            import_component: Some(Arc::new(import_rive_image_component)),
            ..RiveCoreObjectHandler::default()
        }),
    );
    register_rive_core_object_handler(
        registry,
        RIVE_NESTED_ARTBOARD,
        Arc::new(RiveCoreObjectHandler {
            import_component: Some(Arc::new(import_rive_nested_artboard_component)),
            ..RiveCoreObjectHandler::default()
        }),
    );
    register_rive_core_object_handler(
        registry,
        RIVE_NESTED_ANIMATION,
        Arc::new(RiveCoreObjectHandler {
            import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
            ..RiveCoreObjectHandler::default()
        }),
    );
}

const RIVE_NESTED_ARTBOARD: i32 = 92;
const RIVE_NESTED_ANIMATION: i32 = 93;
const RIVE_IMAGE: i32 = 100;
const RIVE_FILE_ASSET: i32 = 103;
const RIVE_FILE_ASSET_CONTENTS: i32 = 106;

const RIVE_NAME: u64 = 4;
const RIVE_NESTED_ARTBOARD_ID: u64 = 197;
const RIVE_ASSET_NAME: u64 = 203;
const RIVE_IMAGE_ASSET_ID: u64 = 206;
const RIVE_ASSET_HEIGHT: u64 = 207;
const RIVE_ASSET_WIDTH: u64 = 208;
const RIVE_ASSET_BYTES: u64 = 212;
const RIVE_ASSET_CDN_BASE_URL: u64 = 362;
