use std::sync::Arc;

use flight_scene2d::contract::Node2DRef;
use flight_scene2d_formats::contract::*;
use flight_shape::contract::SHAPE_KIND;
use serde_json::{Value, json};

mod lottie_shape_layer_handler {
    use super::*;

    #[test]
    fn is_the_builtin_shape_layer_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_layer_handler(&registry, LOTTIE_LAYER_KIND_SHAPE).unwrap(),
            &LOTTIE_ALL_LAYER_HANDLERS[3]
        ));
    }

    #[test]
    fn creates_shape_items_from_a_shape_layer() {
        let layer = lottie_test_shape_layer(1, "shapes");
        let document = create_lottie_test_document(vec![layer]);
        let mut registry = create_lottie_registry();
        register_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_SHAPE,
            Arc::new(|context| lottie_shape_layer_handler(context)),
        );
        register_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_FILL,
            Arc::new(|context| lottie_fill_shape_item_handler(context)),
        );
        register_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_RECTANGLE,
            Arc::new(|context| lottie_rectangle_shape_item_handler(context)),
        );

        let result = create_scene2d_from_lottie_document_with_registry(
            &document_value(&document),
            &registry,
            None,
            None,
        );

        let root: Node2DRef = result.root;
        assert!(find_lottie_test_node_by_kind(&root, SHAPE_KIND).is_some());
    }
}

fn document_value(document: &LottieDocument) -> Value {
    return json!(
        document
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<serde_json::Map<_, _>>()
    );
}
