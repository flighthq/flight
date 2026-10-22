use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::contract::{Path, append_path_rectangle, create_path};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{ShapeCommandToken, create_shape};
use serde_json::json;

mod lottie_fill_shape_item_handler {
    use super::*;

    #[test]
    fn is_the_builtin_fill_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_FILL).unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[1]
        ));
    }

    #[test]
    fn creates_a_fill_paint_from_a_shape_item() {
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
            json!({ "c": { "k": [1, 0, 0] }, "o": { "k": 100 }, "ty": "fl" })
                .as_object()
                .unwrap()
                .clone(),
        );
        let painters = Arc::new(RwLock::new(Vec::new()));
        let shape = create_shape();
        let mut context = LottieShapeItemContext {
            claims: Arc::new(RwLock::new(HashSet::new())),
            import: &mut import,
            item: &item,
            modifiers: Arc::new(RwLock::new(Vec::new())),
            painters: painters.clone(),
            paths: Arc::new(RwLock::new(vec![square()])),
            rerender: Arc::new(|| {}),
            shape: shape.clone(),
        };

        lottie_fill_shape_item_handler(&mut context);
        let paths = context.paths.read().unwrap();
        painters.read().unwrap()[0](&shape, &paths);

        assert!(shape.read().unwrap().data.commands.iter().any(
            |token| matches!(token, ShapeCommandToken::String(value) if value == "beginFill")
        ));
    }
}

fn square() -> Ref<Path> {
    let mut path = create_path();
    append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
    return Arc::new(RwLock::new(path));
}
