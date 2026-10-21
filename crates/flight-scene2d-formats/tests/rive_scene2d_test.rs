use flight_node::{NodeRef, get_node_child_at};
use flight_scene2d::{DISPLAY_OBJECT_KIND, Node2DRef, as_node2d_ref};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::SHAPE_KIND;

use crate::rive_test_bytes::{build_rive, float, object, text, uint};

const ARTBOARD: u64 = 1;
const FILL: u64 = 20;
const HEIGHT: u64 = 8;
const NAME: u64 = 4;
const PARENT_ID: u64 = 5;
const SHAPE: u64 = 3;
const WIDTH: u64 = 7;

mod create_rive_document_import_result {
    use super::*;

    #[test]
    fn imports_only_what_the_registry_claims() {
        let imported = import_shape(create_rive_import_registry());
        assert_eq!(
            child(&imported.artboards[0].root, 0)
                .read()
                .unwrap()
                .node2d_fields()
                .kind,
            DISPLAY_OBJECT_KIND
        );
    }

    #[test]
    fn imports_the_kind_a_registered_family_claims() {
        let mut registry = create_rive_import_registry();
        register_rive_shape_handlers(&mut registry);
        let imported = import_shape(registry);
        assert_eq!(
            child(&imported.artboards[0].root, 0)
                .read()
                .unwrap()
                .node2d_fields()
                .kind,
            SHAPE_KIND
        );
    }

    #[test]
    fn reports_a_component_type_no_family_claims() {
        let source = build_rive(vec![
            board(),
            object(SHAPE, vec![text(NAME, "box"), uint(PARENT_ID, 0)]),
            object(FILL, vec![uint(PARENT_ID, 1)]),
        ]);
        let mut diagnostics = Vec::new();
        create_rive_document_import_result(
            &create_rive_import_registry(),
            &source,
            Some(&mut diagnostics),
        );
        assert!(
            diagnostics
                .iter()
                .any(|entry| entry.kind == "rive.core-type-unregistered")
        );
    }

    #[test]
    fn returns_an_empty_result_for_a_file_it_cannot_parse() {
        let imported =
            create_rive_document_import_result(&create_rive_import_registry(), &[0, 1, 2, 3], None);
        assert!(imported.artboards.is_empty());
        assert!(imported.assets.is_empty());
    }
}

mod initialize_rive_document_import_result {
    use super::*;

    #[test]
    fn replaces_the_collected_artboards_and_assets() {
        let registry = create_rive_import_registry();
        let mut imported =
            create_rive_document_import_result(&registry, &build_rive(vec![board()]), None);
        assert_eq!(imported.artboards.len(), 1);
        initialize_rive_document_import_result(&mut imported, Vec::new(), Vec::new());
        assert!(imported.artboards.is_empty());
        assert!(imported.assets.is_empty());
    }
}

fn board() -> crate::rive_test_bytes::TestObject {
    return object(
        ARTBOARD,
        vec![
            text(NAME, "Board"),
            float(WIDTH, 100.0),
            float(HEIGHT, 100.0),
        ],
    );
}

fn child(node: &Node2DRef, index: i32) -> Node2DRef {
    let node_ref: NodeRef = node.clone();
    return as_node2d_ref(&get_node_child_at(&node_ref, index).unwrap()).unwrap();
}

fn import_shape(registry: RiveImportRegistry) -> RiveDocumentImportResult {
    let source = build_rive(vec![
        board(),
        object(SHAPE, vec![text(NAME, "box"), uint(PARENT_ID, 0)]),
    ]);
    return create_rive_document_import_result(&registry, &source, None);
}
