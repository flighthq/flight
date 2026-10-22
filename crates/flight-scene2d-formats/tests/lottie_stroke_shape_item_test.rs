use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::contract::{Path, append_path_rectangle, create_path};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{CapsStyle, JointStyle, ShapeCommandToken, create_shape};
use serde_json::json;

mod lottie_stroke_shape_item_handler {
    use super::*;

    #[test]
    fn is_the_builtin_stroke_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_STROKE).unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[7]
        ));
    }

    #[test]
    fn creates_a_stroke_paint_from_a_shape_item() {
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
            json!({ "c": { "k": [0, 0, 1] }, "o": { "k": 100 }, "ty": "st", "w": { "k": 2 } })
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

        lottie_stroke_shape_item_handler(&mut context);
        let paths = context.paths.read().unwrap();
        painters.read().unwrap()[0](&shape, &paths);

        assert!(shape.read().unwrap().data.commands.iter().any(
            |token| matches!(token, ShapeCommandToken::String(value) if value == "lineStyle")
        ));
    }
}

mod map_lottie_line_cap {
    use super::*;

    #[test]
    fn maps_each_cap_code_and_defaults_an_absent_one_to_none() {
        assert_eq!(map_lottie_line_cap(Some(1)), CapsStyle::None);
        assert_eq!(map_lottie_line_cap(Some(2)), CapsStyle::Round);
        assert_eq!(map_lottie_line_cap(Some(3)), CapsStyle::Square);
        assert_eq!(map_lottie_line_cap(None), CapsStyle::None);
    }
}

mod map_lottie_line_join {
    use super::*;

    #[test]
    fn maps_each_join_code_and_defaults_an_absent_one_to_miter() {
        assert_eq!(map_lottie_line_join(Some(1)), JointStyle::Miter);
        assert_eq!(map_lottie_line_join(Some(2)), JointStyle::Round);
        assert_eq!(map_lottie_line_join(Some(3)), JointStyle::Bevel);
        assert_eq!(map_lottie_line_join(None), JointStyle::Miter);
    }
}

fn square() -> Ref<Path> {
    let mut path = create_path();
    append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
    return Arc::new(RwLock::new(path));
}
