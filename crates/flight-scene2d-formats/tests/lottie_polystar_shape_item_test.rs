use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_scene2d_formats::contract::*;
use flight_shape::contract::create_shape;
use serde_json::json;

mod lottie_polystar_shape_item_handler {
    use super::*;

    #[test]
    fn is_the_builtin_polystar_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_POLYSTAR).unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[5]
        ));
    }

    #[test]
    fn creates_a_polystar_path() {
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
                "ir": { "k": 25 },
                "or": { "k": 50 },
                "p": { "k": [50, 50] },
                "pt": { "k": 5 },
                "r": { "k": 0 },
                "sy": 1,
                "ty": "sr"
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
            shape: create_shape(),
        };

        lottie_polystar_shape_item_handler(&mut context);

        assert_eq!(paths.read().unwrap()[0].read().unwrap().commands.len(), 11);
    }
}
