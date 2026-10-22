use std::sync::Arc;

use flight_scene2d::contract::Node2DRef;
use flight_scene2d_formats::contract::*;
use serde_json::json;

mod lottie_precomposition_layer_handler {
    use super::*;

    #[test]
    fn is_the_builtin_precomposition_layer_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_layer_handler(&registry, LOTTIE_LAYER_KIND_PRECOMPOSITION).unwrap(),
            &LOTTIE_ALL_LAYER_HANDLERS[2]
        ));
    }

    #[test]
    fn resolves_a_precomposition_asset() {
        let registry = registry();
        let result = create_scene2d_from_lottie_document_with_registry(
            &json!({
                "assets": [{
                    "id": "comp_0",
                    "layers": [{ "ind": 1, "ip": 0, "nm": "inner", "op": 60, "ty": 3 }]
                }],
                "fr": 30,
                "h": 100,
                "ip": 0,
                "layers": [{ "ind": 1, "ip": 0, "nm": "precomp", "op": 60, "refId": "comp_0", "ty": 0 }],
                "op": 60,
                "w": 100
            }),
            &registry,
            None,
            None,
        );
        let root: Node2DRef = result.root;
        assert!(find_lottie_test_node_by_name(&root, "inner").is_some());
    }

    #[test]
    fn diagnoses_a_recursive_precomposition_without_recursing_forever() {
        let registry = registry();
        let mut diagnostics = Vec::new();
        create_scene2d_from_lottie_document_with_registry(
            &json!({
                "assets": [{
                    "id": "loop",
                    "layers": [{ "ind": 1, "ip": 0, "op": 60, "refId": "loop", "ty": 0 }]
                }],
                "fr": 30,
                "h": 100,
                "ip": 0,
                "layers": [{ "ind": 1, "ip": 0, "op": 60, "refId": "loop", "ty": 0 }],
                "op": 60,
                "w": 100
            }),
            &registry,
            Some(&mut diagnostics),
            None,
        );
        assert!(
            diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "lottie.recursive-precomposition")
        );
    }

    fn registry() -> LottieRegistry {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_PRECOMPOSITION,
            Arc::new(|context| lottie_precomposition_layer_handler(context)),
        );
        register_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_NULL,
            Arc::new(lottie_null_layer_handler),
        );
        return registry;
    }
}
