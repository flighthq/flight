use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_scene2d_formats::contract::*;
use flight_shape::contract::create_shape;
use serde_json::{json, Value};

mod lottie_path_shape_item_handler {
    use super::*;

    #[test]
    fn is_the_builtin_path_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_PATH).unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[4]
        ));
    }

    #[test]
    fn creates_a_path_from_a_shape_item_and_binds_its_animation() {
        let document = create_lottie_test_document(Vec::new());
        let registry = create_lottie_registry();
        let mut import = LottieImportContext {
            advanced_blends: Vec::new(),
            assets: HashMap::new(),
            channels: Vec::new(),
            diagnostics: None,
            document: &document,
            frame_offset: 0.0,
            frame_scale: 1.0,
            registry: &registry,
            resolve_image_resource: None,
            resolving_precompositions: HashSet::new(),
        };
        let item = LottieRecord::from(
            json!({
                "d": 1,
                "ks": {
                    "a": 1,
                    "k": [
                        { "s": [square_value(10.0)], "t": 0 },
                        { "s": [square_value(20.0)], "t": 30 }
                    ]
                },
                "ty": "sh"
            })
            .as_object()
            .unwrap()
            .clone(),
        );
        let paths = Arc::new(RwLock::new(Vec::new()));
        let mut context = LottieShapeItemContext {
            claims: Arc::new(RwLock::new(HashSet::new())),
            import: &mut import,
            item: &item,
            modifiers: Arc::new(RwLock::new(Vec::new())),
            painters: Arc::new(RwLock::new(Vec::new())),
            paths: paths.clone(),
            rerender: Arc::new(|| {}),
            shape: create_shape(None),
        };

        lottie_path_shape_item_handler(&mut context);

        assert_eq!(paths.read().unwrap().len(), 1);
        assert_eq!(import.channels.len(), 1);
    }
}

fn square_value(size: f32) -> Value {
    return json!({
        "c": true,
        "i": [[0, 0], [0, 0], [0, 0], [0, 0]],
        "o": [[0, 0], [0, 0], [0, 0], [0, 0]],
        "v": [[0, 0], [size, 0], [size, size], [0, size]]
    });
}
