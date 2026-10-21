use std::sync::Arc;

use flight_scene2d::contract::Node2DRef;
use flight_scene2d_formats::contract::*;
use serde_json::json;

mod lottie_image_layer_handler {
    use super::*;

    #[test]
    fn is_the_builtin_image_layer_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_layer_handler(&registry, LOTTIE_LAYER_KIND_IMAGE).unwrap(),
            &LOTTIE_ALL_LAYER_HANDLERS[0]
        ));
    }

    #[test]
    fn creates_a_sprite_for_a_resolved_image_layer() {
        let image = create_ready_image_resource_for_test(Some(10), Some(10));
        let mut registry = create_lottie_registry();
        register_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_IMAGE,
            Arc::new(|context| lottie_image_layer_handler(context)),
        );
        let mut diagnostics = Vec::new();
        let result = create_scene2d_from_lottie_document_with_registry(
            &json!({
                "assets": [{ "h": 10, "id": "img_0", "p": "test.png", "u": "", "w": 10 }],
                "fr": 30,
                "h": 100,
                "ip": 0,
                "layers": [{ "ind": 1, "ip": 0, "nm": "img", "op": 60, "refId": "img_0", "ty": 2 }],
                "op": 60,
                "w": 100
            }),
            &registry,
            Some(&mut diagnostics),
            Some(&LottieDocumentImportOptions {
                layer_handlers: None,
                mask_handlers: None,
                resolve_image_resource: Some(Arc::new(move |_asset| Some(image.clone()))),
                shape_item_handlers: None,
            }),
        );
        let root: Node2DRef = result.root;
        assert!(
            find_lottie_test_node_by_kind(&root, flight_scene2d::contract::SPRITE_KIND).is_some()
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn distinguishes_a_missing_asset_from_an_unresolved_image() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_IMAGE,
            Arc::new(|context| lottie_image_layer_handler(context)),
        );
        let mut diagnostics = Vec::new();
        create_scene2d_from_lottie_document_with_registry(
            &json!({
                "fr": 30,
                "h": 100,
                "ip": 0,
                "layers": [{ "ind": 1, "ip": 0, "op": 60, "refId": "missing", "ty": 2 }],
                "op": 60,
                "w": 100
            }),
            &registry,
            Some(&mut diagnostics),
            None,
        );
        assert_eq!(diagnostics[0].kind, "lottie.unresolved-asset");

        diagnostics.clear();
        create_scene2d_from_lottie_document_with_registry(
            &json!({
                "assets": [{ "id": "img_0", "p": "test.png" }],
                "fr": 30,
                "h": 100,
                "ip": 0,
                "layers": [{ "ind": 1, "ip": 0, "op": 60, "refId": "img_0", "ty": 2 }],
                "op": 60,
                "w": 100
            }),
            &registry,
            Some(&mut diagnostics),
            None,
        );
        assert_eq!(diagnostics[0].kind, "lottie.unresolved-image");
    }
}
