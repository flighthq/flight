use std::sync::Arc;

use flight_scene2d::contract::Node2DRef;
use flight_scene2d_formats::contract::*;
use serde_json::{Value, json};

mod lottie_additive_mask_handler {
    use super::*;

    #[test]
    fn is_the_builtin_additive_mask_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_mask_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_mask_handler(&registry, LOTTIE_MASK_KIND_ADDITIVE).unwrap(),
            &LOTTIE_ALL_MASK_HANDLERS[0]
        ));
    }

    #[test]
    fn lowers_a_lone_additive_mask_onto_a_clip_region() {
        let result = import(vec![mask(false)]);
        let root: Node2DRef = result.root;
        let masked = find_lottie_test_node_by_name(&root, "masked").unwrap();
        assert!(masked.read().unwrap().node2d_fields().clip.is_some());
    }

    #[test]
    fn declines_composition_inversion_and_an_absent_outline() {
        let cases = [
            vec![mask(false), mask(false)],
            vec![mask(true)],
            vec![json!({ "mode": "a", "o": { "k": 100 }, "pt": {} })],
        ];
        for masks in cases {
            let result = import(masks);
            let root: Node2DRef = result.root;
            let masked = find_lottie_test_node_by_name(&root, "masked").unwrap();
            assert!(masked.read().unwrap().node2d_fields().clip.is_none());
        }
    }
}

fn import(masks: Vec<Value>) -> LottieDocumentImportResult {
    let mut registry = create_lottie_registry();
    register_lottie_layer_handler(
        &mut registry,
        LOTTIE_LAYER_KIND_NULL,
        Arc::new(lottie_null_layer_handler),
    );
    register_lottie_mask_handler(
        &mut registry,
        LOTTIE_MASK_KIND_ADDITIVE,
        Arc::new(|context| lottie_additive_mask_handler(context)),
    );
    return create_scene2d_from_lottie_document_with_registry(
        &json!({
            "fr": 30,
            "h": 100,
            "ip": 0,
            "layers": [{
                "ind": 1,
                "ip": 0,
                "masksProperties": masks,
                "nm": "masked",
                "op": 60,
                "ty": 3
            }],
            "op": 60,
            "w": 100
        }),
        &registry,
        None,
        None,
    );
}

fn mask(inverted: bool) -> Value {
    return json!({
        "inv": inverted,
        "mode": "a",
        "o": { "k": 100 },
        "pt": { "k": {
            "c": true,
            "i": [[0, 0], [0, 0], [0, 0], [0, 0]],
            "o": [[0, 0], [0, 0], [0, 0], [0, 0]],
            "v": [[0, 0], [10, 0], [10, 10], [0, 10]]
        } }
    });
}
