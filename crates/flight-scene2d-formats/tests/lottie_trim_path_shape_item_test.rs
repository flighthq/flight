use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::contract::{append_path_rectangle, create_path, Path};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{create_shape, Shape, SHAPE_KIND};
use serde_json::{json, Value};

mod lottie_trim_path_shape_item_handler {
    use super::*;

    #[test]
    fn ignores_a_second_trim_in_the_same_group_rather_than_composing_with_it() {
        let (item, mut import) = setup(half_trim());
        let paths = Arc::new(RwLock::new(vec![square()]));
        let modifiers = Arc::new(RwLock::new(Vec::new()));
        let mut context = shape_context(&item, &mut import, &paths, &modifiers);
        lottie_trim_path_shape_item_handler(&mut context);
        lottie_trim_path_shape_item_handler(&mut context);
        lottie_trim_path_shape_item_handler(&mut context);
        assert_eq!(modifiers.read().unwrap().len(), 1);
        let once = path_commands_of(vec![half_trim()], None);
        assert_eq!(path_commands_of(vec![half_trim(), half_trim()], None), once);
        assert_eq!(
            path_commands_of(vec![half_trim(), half_trim(), half_trim()], None),
            once
        );
    }

    #[test]
    fn ignores_a_second_trim_on_the_selective_entry_and_does_not_carry_the_claim_between_documents()
    {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_SHAPE,
            Arc::new(lottie_shape_layer_handler),
        );
        register_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_FILL,
            Arc::new(lottie_fill_shape_item_handler),
        );
        register_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_PATH,
            Arc::new(lottie_path_shape_item_handler),
        );
        register_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH,
            Arc::new(lottie_trim_path_shape_item_handler),
        );
        let once = selective_path_commands(&registry, vec![half_trim()]);
        assert_eq!(
            selective_path_commands(&registry, vec![half_trim(), half_trim()]),
            once
        );
        assert_eq!(selective_path_commands(&registry, vec![half_trim()]), once);
        assert_ne!(selective_path_commands(&registry, Vec::new()), once);
    }

    #[test]
    fn is_the_builtin_trim_path_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH).unwrap(),
            &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[8]
        ));
    }

    #[test]
    fn leaves_the_paths_untouched_when_the_span_covers_the_whole_path() {
        let full = json!({
            "e": { "k": 100 },
            "o": { "k": 0 },
            "s": { "k": 0 },
            "ty": "tm"
        });
        assert_eq!(
            path_commands_of(vec![full], None),
            path_commands_of(Vec::new(), None)
        );
    }

    #[test]
    fn reports_a_skip_for_an_animated_span_and_leaves_the_paths_whole() {
        let mut diagnostics = Vec::new();
        let animated = path_commands_of(
            vec![json!({
                "e": { "a": 1, "k": [{ "s": 0, "t": 0 }, { "s": 50, "t": 30 }] },
                "o": { "k": 0 },
                "s": { "k": 0 },
                "ty": "tm"
            })],
            Some(&mut diagnostics),
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "lottie.unsupported-shape-modifier");
        assert_eq!(animated, path_commands_of(Vec::new(), None));
    }

    #[test]
    fn shortens_every_path_in_its_group() {
        let untrimmed = path_commands_of(Vec::new(), None);
        let trimmed = path_commands_of(vec![half_trim()], None);
        assert_ne!(trimmed, untrimmed);
        assert!(trimmed.len() < untrimmed.len());
    }
}

fn drawn_path_commands(root: &flight_scene2d::Node2DRef) -> Vec<f64> {
    let shape = find_lottie_test_node_by_kind(root, SHAPE_KIND).unwrap();
    let shape = shape.read().unwrap();
    let shape = shape.as_any().downcast_ref::<Shape>().unwrap();
    let index = shape
        .data
        .commands
        .iter()
        .position(|token| token.as_str() == Some("drawPath"))
        .unwrap();
    return shape.data.commands[index + 2].as_numbers().unwrap().clone();
}

fn half_trim() -> Value {
    return json!({
        "e": { "k": 50 },
        "o": { "k": 0 },
        "s": { "k": 0 },
        "ty": "tm"
    });
}

fn path_commands_of(
    trims: Vec<Value>,
    diagnostics: Option<&mut Vec<flight_importdiagnostics::ImportDiagnostic>>,
) -> Vec<f64> {
    let document = trimmed_document(trims);
    let result = create_scene2d_from_lottie_document(&document, diagnostics, None);
    let root: flight_scene2d::Node2DRef = result.root;
    return drawn_path_commands(&root);
}

fn selective_path_commands(registry: &LottieRegistry, trims: Vec<Value>) -> Vec<f64> {
    let result = create_scene2d_from_lottie_document_with_registry(
        &trimmed_document(trims),
        registry,
        None,
        None,
    );
    let root: flight_scene2d::Node2DRef = result.root;
    return drawn_path_commands(&root);
}

fn setup(value: serde_json::Value) -> (LottieRecord, LottieImportContext<'static>) {
    let document = Box::leak(Box::new(create_lottie_test_document(Vec::new())));
    let registry = Box::leak(Box::new(create_lottie_registry()));
    return (
        LottieRecord::from(value.as_object().unwrap().clone()),
        LottieImportContext {
            advanced_blends: Vec::new(),
            assets: HashMap::new(),
            channels: Vec::new(),
            diagnostics: None,
            document,
            frame_offset: 0.0,
            frame_scale: 1.0,
            registry,
            resolve_image_resource: None,
            resolving_precompositions: HashSet::new(),
        },
    );
}

fn shape_context<'a, 'b>(
    item: &'a LottieRecord,
    import: &'a mut LottieImportContext<'b>,
    paths: &Arc<RwLock<Vec<Ref<Path>>>>,
    modifiers: &Arc<RwLock<Vec<LottieShapeModifier>>>,
) -> LottieShapeItemContext<'a, 'b> {
    return LottieShapeItemContext {
        claims: Arc::new(RwLock::new(HashSet::new())),
        import,
        item,
        modifiers: modifiers.clone(),
        painters: Arc::new(RwLock::new(Vec::new())),
        paths: paths.clone(),
        rerender: Arc::new(|| {}),
        shape: create_shape(None),
    };
}

fn square() -> Ref<Path> {
    let mut path = create_path();
    append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
    return Arc::new(RwLock::new(path));
}

fn trimmed_document(trims: Vec<Value>) -> Value {
    let mut shapes = vec![
        json!({
            "ks": {
                "k": {
                    "c": true,
                    "i": [[0, 0], [0, 0], [0, 0], [0, 0]],
                    "o": [[0, 0], [0, 0], [0, 0], [0, 0]],
                    "v": [[0, 0], [10, 0], [10, 10], [0, 10]]
                }
            },
            "ty": "sh"
        }),
        json!({ "c": { "k": [1, 0, 0] }, "o": { "k": 100 }, "ty": "fl" }),
    ];
    shapes.extend(trims);
    return json!({
        "fr": 30,
        "h": 100,
        "ip": 0,
        "layers": [{
            "ind": 1,
            "ip": 0,
            "nm": "trim",
            "op": 60,
            "shapes": shapes,
            "ty": 4
        }],
        "op": 60,
        "w": 100
    });
}
