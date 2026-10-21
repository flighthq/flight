use std::sync::Arc;

use flight_scene2d::contract::Node2DRef;
use flight_scene2d_formats::contract::*;
use flight_text::contract::TEXT_LABEL_KIND;
use serde_json::json;

mod lottie_text_layer_handler {
    use super::*;

    #[test]
    fn is_the_builtin_text_layer_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_layer_handler(&registry, LOTTIE_LAYER_KIND_TEXT).unwrap(),
            &LOTTIE_ALL_LAYER_HANDLERS[5]
        ));
    }

    #[test]
    fn creates_a_text_label() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_TEXT,
            Arc::new(|context| lottie_text_layer_handler(context)),
        );
        let result = create_scene2d_from_lottie_document_with_registry(
            &json!({
                "fr": 30,
                "h": 100,
                "ip": 0,
                "layers": [{
                    "ind": 1,
                    "ip": 0,
                    "nm": "text",
                    "op": 60,
                    "t": { "d": { "k": [{ "s": { "f": "Arial", "fc": [0, 0, 0], "s": 12, "t": "Hello" }, "t": 0 }] } },
                    "ty": 5
                }],
                "op": 60,
                "w": 100
            }),
            &registry,
            None,
            None,
        );
        let root: Node2DRef = result.root;
        assert!(find_lottie_test_node_by_kind(&root, TEXT_LABEL_KIND).is_some());
    }
}
