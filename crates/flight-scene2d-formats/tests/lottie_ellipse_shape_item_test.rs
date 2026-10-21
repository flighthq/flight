use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_scene2d_formats::contract::*;
use flight_shape::contract::create_shape;
use serde_json::json;

mod lottie_ellipse_shape_item_handler {
    use super::*;

    #[test]
    fn is_the_builtin_ellipse_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_ELLIPSE).unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[0]
        ));
    }

    #[test]
    fn creates_an_ellipse_path() {
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
            json!({ "p": { "k": [10, 10] }, "s": { "k": [20, 20] }, "ty": "el" })
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

        lottie_ellipse_shape_item_handler(&mut context);

        let paths = paths.read().unwrap();
        assert_eq!(paths.len(), 1);
        assert!(!paths[0].read().unwrap().commands.is_empty());
    }
}
