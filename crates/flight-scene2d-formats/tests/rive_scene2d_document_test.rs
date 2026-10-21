use std::sync::Arc;

use flight_image::{EmbeddedImageResourceReference, ImageResourceReference};
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_node::{NodeRef, get_node_child_at, get_node_child_count};
use flight_path_boolean::MARTINEZ_PATH_BOOLEAN_KERNEL;
use flight_scene2d::{Node2DRef, SPRITE_KIND, as_node2d_ref, create_display_object};
use flight_scene2d_formats::contract::*;

use crate::rive_test_bytes::{TestObject, artboard, build_rive, bytes, object, text, uint};

const ASSET_BYTES: u64 = 212;
const ASSET_NAME: u64 = 203;
const FILE_ASSET_CONTENTS: u64 = 106;
const IMAGE: u64 = 100;
const IMAGE_ASSET: u64 = 105;
const IMAGE_ASSET_ID: u64 = 206;
const NAME: u64 = 4;
const NESTED_ARTBOARD: u64 = 92;
const NESTED_ARTBOARD_ID: u64 = 197;
const PARENT_ID: u64 = 5;

const PNG: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP: [u8; 8] = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0];

mod create_scene2d_document_from_rive_document {
    use super::*;

    #[test]
    fn carries_the_import_alongside_the_document_data() {
        let result = import(vec![artboard("Board")]);
        assert_eq!(result.imported.artboards.len(), 1);
        assert_eq!(result.imported.artboards[0].name, "Board");
    }

    #[test]
    fn detects_webp_assets() {
        let result = import(vec![
            object(IMAGE_ASSET, Vec::new()),
            object(FILE_ASSET_CONTENTS, vec![bytes(ASSET_BYTES, &WEBP)]),
            artboard("Board"),
        ]);
        assert_eq!(
            embedded(&result, 0).read().unwrap().mime_type.as_deref(),
            Some("image/webp")
        );
    }

    #[test]
    fn leaves_an_asset_with_no_bytes_out_of_the_resource_list() {
        let result = import(vec![
            object(IMAGE_ASSET, vec![text(ASSET_NAME, "external")]),
            artboard("Board"),
        ]);
        assert!(result.image_resources.is_empty());
    }

    #[test]
    fn lists_every_texture_waiting_on_an_asset() {
        let result = import(vec![
            object(IMAGE_ASSET, Vec::new()),
            object(FILE_ASSET_CONTENTS, vec![bytes(ASSET_BYTES, &PNG)]),
            artboard("Board"),
            object(IMAGE, vec![uint(PARENT_ID, 0), uint(IMAGE_ASSET_ID, 0)]),
            object(IMAGE, vec![uint(PARENT_ID, 0), uint(IMAGE_ASSET_ID, 0)]),
        ]);
        let reference = embedded(&result, 0);
        let textures = reference.read().unwrap().textures.clone();
        assert_eq!(textures.len(), 2);
        let board = child(&result.root, 0);
        let first = child(&board, 0);
        let second = child(&board, 1);
        assert_eq!(first.read().unwrap().node2d_fields().kind, SPRITE_KIND);
        assert!(Arc::ptr_eq(
            &textures[0],
            &get_rive_image_texture(&first).unwrap()
        ));
        assert!(Arc::ptr_eq(
            &textures[1],
            &get_rive_image_texture(&second).unwrap()
        ));
    }

    #[test]
    fn makes_a_slot_of_a_nested_artboard() {
        let result = import(vec![
            artboard("Host"),
            object(
                NESTED_ARTBOARD,
                vec![uint(PARENT_ID, 0), uint(NESTED_ARTBOARD_ID, 1)],
            ),
            artboard("Button"),
        ]);
        assert_eq!(result.slots.len(), 1);
        assert_eq!(result.slots[0].name, "Button");
        assert_eq!(result.slots[0].linkage.as_deref(), Some("Button"));
        assert!(result.slots[0].content.is_none());
        assert!(Arc::ptr_eq(
            &result.slots[0].target,
            &child(&child(&result.root, 0), 0)
        ));
    }

    #[test]
    fn prefers_the_site_name_over_the_referenced_artboard_name() {
        let result = import(vec![
            artboard("Host"),
            object(
                NESTED_ARTBOARD,
                vec![
                    uint(PARENT_ID, 0),
                    uint(NESTED_ARTBOARD_ID, 1),
                    text(NAME, "slotA"),
                ],
            ),
            artboard("Button"),
        ]);
        assert_eq!(result.slots[0].name, "slotA");
        assert_eq!(result.slots[0].linkage.as_deref(), Some("Button"));
    }

    #[test]
    fn reports_an_embedded_image_whose_mime_type_cannot_be_detected() {
        let mut diagnostics = Vec::new();
        let result = import_with_diagnostics(
            vec![
                object(IMAGE_ASSET, Vec::new()),
                object(FILE_ASSET_CONTENTS, vec![bytes(ASSET_BYTES, &[1, 2, 3, 4])]),
                artboard("Board"),
            ],
            &mut diagnostics,
        );
        assert!(embedded(&result, 0).read().unwrap().mime_type.is_none());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.image-mime-type-undetected");
        assert_eq!(diagnostics[0].origin, "toRiveMimeType");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
    }

    #[test]
    fn returns_none_for_bytes_that_are_not_a_rive_file() {
        assert!(
            create_scene2d_document_from_rive_document(
                &MARTINEZ_PATH_BOOLEAN_KERNEL,
                &[1, 2, 3, 4],
                None
            )
            .is_none()
        );
    }

    #[test]
    fn roots_every_artboard_under_one_container() {
        let result = import(vec![artboard("First"), artboard("Second")]);
        assert_eq!(child_count(&result.root), 2);
        assert_eq!(
            child(&result.root, 0)
                .read()
                .unwrap()
                .node_fields()
                .name
                .as_deref(),
            Some("First")
        );
        assert_eq!(
            child(&result.root, 1)
                .read()
                .unwrap()
                .node_fields()
                .name
                .as_deref(),
            Some("Second")
        );
    }

    #[test]
    fn stays_silent_for_an_embedded_image_with_a_detected_mime_type() {
        let mut diagnostics = Vec::new();
        import_with_diagnostics(
            vec![
                object(IMAGE_ASSET, Vec::new()),
                object(FILE_ASSET_CONTENTS, vec![bytes(ASSET_BYTES, &PNG)]),
                artboard("Board"),
            ],
            &mut diagnostics,
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn turns_an_embedded_image_into_an_unresolved_reference() {
        let result = import(vec![
            object(IMAGE_ASSET, vec![text(ASSET_NAME, "sky")]),
            object(FILE_ASSET_CONTENTS, vec![bytes(ASSET_BYTES, &PNG)]),
            artboard("Board"),
        ]);
        let reference = embedded(&result, 0);
        let reference = reference.read().unwrap();
        assert_eq!(reference.mime_type.as_deref(), Some("image/png"));
        assert_eq!(format!("{:?}", reference.state), "Unresolved");
    }
}

mod initialize_rive_scene2d_document_result {
    use super::*;

    #[test]
    fn replaces_each_document_result_field() {
        let mut result = import(vec![artboard("Old")]);
        let imported = create_scene2d_from_rive_document(
            &MARTINEZ_PATH_BOOLEAN_KERNEL,
            &build_rive(vec![artboard("New")]),
            None,
        );
        let root: Node2DRef = create_display_object(None);
        initialize_rive_scene2d_document_result(
            &mut result,
            root.clone(),
            imported,
            Vec::new(),
            Vec::new(),
        );
        assert!(Arc::ptr_eq(&result.root, &root));
        assert_eq!(result.imported.artboards[0].name, "New");
        assert!(result.image_resources.is_empty());
        assert!(result.slots.is_empty());
    }
}

fn child(node: &Node2DRef, index: i32) -> Node2DRef {
    let node_ref: NodeRef = node.clone();
    return as_node2d_ref(&get_node_child_at(&node_ref, index).unwrap()).unwrap();
}

fn child_count(node: &Node2DRef) -> usize {
    let node_ref: NodeRef = node.clone();
    return get_node_child_count(&node_ref);
}

fn embedded(
    result: &RiveScene2DDocumentResult,
    index: usize,
) -> flight_entity::Ref<EmbeddedImageResourceReference> {
    let ImageResourceReference::Embedded(value) = &result.image_resources[index] else {
        panic!("expected embedded image resource");
    };
    return value.reference.clone();
}

fn import(objects: Vec<TestObject>) -> RiveScene2DDocumentResult {
    return create_scene2d_document_from_rive_document(
        &MARTINEZ_PATH_BOOLEAN_KERNEL,
        &build_rive(objects),
        None,
    )
    .unwrap();
}

fn import_with_diagnostics(
    objects: Vec<TestObject>,
    diagnostics: &mut Vec<flight_importdiagnostics::ImportDiagnostic>,
) -> RiveScene2DDocumentResult {
    return create_scene2d_document_from_rive_document(
        &MARTINEZ_PATH_BOOLEAN_KERNEL,
        &build_rive(objects),
        Some(diagnostics),
    )
    .unwrap();
}
