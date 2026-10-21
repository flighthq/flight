use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::contract::{append_path_rectangle, create_path, Path};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{create_shape, ShapeCommandToken};
use serde_json::json;

mod lottie_gradient_fill_shape_item_handler {
    use super::*;

    #[test]
    fn is_the_builtin_gradient_fill_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_GRADIENT_FILL)
                .unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[2]
        ));
    }

    #[test]
    fn creates_a_gradient_fill_paint() {
        assert_gradient_paint(false, "beginGradientFill");
    }
}

mod lottie_gradient_stroke_shape_item_handler {
    use super::*;

    #[test]
    fn is_the_builtin_gradient_stroke_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_GRADIENT_STROKE)
                .unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[3]
        ));
    }

    #[test]
    fn creates_a_gradient_stroke_paint() {
        assert_gradient_paint(true, "lineGradientStyle");
    }
}

fn assert_gradient_paint(stroke: bool, expected_command: &str) {
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
            "e": { "k": [100, 0] },
            "g": { "k": { "k": [0, 1, 0, 0, 1, 0, 0, 1] }, "p": 2 },
            "o": { "k": 100 },
            "s": { "k": [0, 0] },
            "t": 1,
            "ty": if stroke { "gs" } else { "gf" },
            "w": { "k": 2 }
        })
        .as_object()
        .unwrap()
        .clone(),
    );
    let painters = Arc::new(RwLock::new(Vec::new()));
    let shape = create_shape(None);
    let paths = Arc::new(RwLock::new(vec![square()]));
    let mut context = LottieShapeItemContext {
        claims: Arc::new(RwLock::new(HashSet::new())),
        import: &mut import,
        item: &item,
        modifiers: Arc::new(RwLock::new(Vec::new())),
        painters: painters.clone(),
        paths: paths.clone(),
        rerender: Arc::new(|| {}),
        shape: shape.clone(),
    };
    if stroke {
        lottie_gradient_stroke_shape_item_handler(&mut context);
    } else {
        lottie_gradient_fill_shape_item_handler(&mut context);
    }
    painters.read().unwrap()[0](&shape, &paths.read().unwrap());
    assert!(shape.read().unwrap().data.commands.iter().any(
        |token| matches!(token, ShapeCommandToken::String(value) if value == expected_command)
    ));
}

fn square() -> Ref<Path> {
    let mut path = create_path();
    append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
    return Arc::new(RwLock::new(path));
}
