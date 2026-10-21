use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_animation::contract::{create_animation_clip, sample_animation_track};
use flight_entity::{Unknown, allocate_entity};
use flight_importdiagnostics::contract::{ImportDiagnostic, ImportDiagnosticSeverity};
use flight_node::contract::{NodeRef, get_node_child_at, get_node_child_count};
use flight_scene2d::contract::{Node2DRef, as_node2d_ref, create_display_object};
use flight_scene2d_formats::contract::*;
use serde_json::{Value, json};

mod append_lottie_layers {
    use super::*;

    #[test]
    fn reverses_document_order_and_reparents_by_layer_index() {
        let stacked = append(&[
            record(json!({ "ind": 1, "ip": 0, "nm": "top", "op": 60, "ty": 3 })),
            record(json!({ "ind": 2, "ip": 0, "nm": "bottom", "op": 60, "ty": 3 })),
        ]);
        assert_eq!(child_names(&stacked), ["bottom", "top"]);

        let parented = append(&[
            record(json!({ "ind": 1, "ip": 0, "nm": "child", "op": 60, "parent": 2, "ty": 3 })),
            record(json!({ "ind": 2, "ip": 0, "nm": "parent", "op": 60, "ty": 3 })),
        ]);
        assert_eq!(child_names(&parented), ["parent"]);
        let parent = get_node_child_at(&parented, 0).unwrap();
        assert_eq!(child_names(&parent), ["child"]);
    }

    fn append(layers: &[LottieLayer]) -> NodeRef {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut context = import_context(&document, &registry, None);
        let root = create_display_object(None);
        let root_node: Node2DRef = root.clone();
        append_lottie_layers(&root_node, layers, &mut context);
        return root;
    }
}

mod apply_animation_clip_to_lottie_document {
    use super::*;

    #[test]
    fn applies_the_imported_target_bound_clip() {
        let result = import(json!({
            "fr": 30,
            "h": 100,
            "ip": 0,
            "layers": [{
                "ind": 1,
                "ip": 0,
                "ks": { "p": animated_vector([0, 0], [10, 20]) },
                "nm": "node",
                "op": 60,
                "ty": 3
            }],
            "op": 60,
            "w": 100
        }));
        apply_animation_clip_to_lottie_document(&result.clip, 0.5);
        let node = named_child(&result.root, "node");
        let node = node.read().unwrap();
        assert_f32_eq(node.node2d_fields().x, 5.0);
        assert_f32_eq(node.node2d_fields().y, 10.0);
    }
}

mod apply_lottie_mask_family {
    use super::*;

    #[test]
    fn dispatches_active_masks_to_the_registered_family_only() {
        let document = test_document();
        let calls = Arc::new(AtomicUsize::new(0));
        let mut registry = create_lottie_registry();
        let handler_calls = calls.clone();
        register_lottie_mask_handler(
            &mut registry,
            LOTTIE_MASK_KIND_ADDITIVE,
            Arc::new(move |context| {
                assert_eq!(context.masks.len(), 1);
                handler_calls.fetch_add(1, Ordering::SeqCst);
            }),
        );
        let mut context = import_context(&document, &registry, None);
        let target: Node2DRef = create_display_object(None);
        let masks = [
            record(json!({ "mode": "n" })),
            record(json!({ "mode": "a" })),
        ];
        apply_lottie_mask_family(&target, &masks, &mut context);
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        let empty_registry = create_lottie_registry();
        let mut empty_context = import_context(&document, &empty_registry, None);
        apply_lottie_mask_family(&target, &masks, &mut empty_context);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn ignores_disabled_masks() {
        let document = test_document();
        let calls = Arc::new(AtomicUsize::new(0));
        let mut registry = create_lottie_registry();
        let handler_calls = calls.clone();
        register_lottie_mask_handler(
            &mut registry,
            LOTTIE_MASK_KIND_ADDITIVE,
            Arc::new(move |_context| {
                handler_calls.fetch_add(1, Ordering::SeqCst);
            }),
        );
        let mut context = import_context(&document, &registry, None);
        let target: Node2DRef = create_display_object(None);
        apply_lottie_mask_family(&target, &[record(json!({ "mode": "n" }))], &mut context);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod apply_lottie_transform {
    use super::*;

    #[test]
    fn writes_position_and_rotation_in_authoring_degrees() {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut context = import_context(&document, &registry, None);
        let target: Node2DRef = create_display_object(None);
        let transform = json!({
            "p": { "a": 0, "k": [12, 34] },
            "r": { "a": 0, "k": 90 }
        });
        apply_lottie_transform(&target, Some(&transform), &mut context, None, None);
        let target = target.read().unwrap();
        assert_f32_eq(target.node2d_fields().x, 12.0);
        assert_f32_eq(target.node2d_fields().y, 34.0);
        assert_f32_eq(target.node2d_fields().rotation, 90.0);
    }

    #[test]
    fn broadcasts_across_a_nullish_vector_component_like_javascript_number_arrays() {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut context = import_context(&document, &registry, None);
        let target: Node2DRef = create_display_object(None);
        let transform = json!({ "p": { "a": 0, "k": [12, null] } });
        apply_lottie_transform(&target, Some(&transform), &mut context, None, None);
        let target = target.read().unwrap();
        assert_f32_eq(target.node2d_fields().x, 12.0);
        assert_f32_eq(target.node2d_fields().y, 12.0);
    }

    #[test]
    fn auto_orients_an_animated_position_track() {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut context = import_context(&document, &registry, None);
        let target: Node2DRef = create_display_object(None);
        let transform = json!({
            "p": animated_vector([0, 0], [10, 10]),
            "r": { "a": 0, "k": 5 }
        });
        apply_lottie_transform(&target, Some(&transform), &mut context, None, Some(true));
        assert_f32_eq(target.read().unwrap().node2d_fields().rotation, 50.0);
    }
}

mod bind_mutable_lottie_numeric_property {
    use super::*;

    #[test]
    fn adds_a_channel_for_an_animated_property_and_applies_it() {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut context = import_context(&document, &registry, None);
        let current = Arc::new(RwLock::new(vec![0.0, 0.0]));
        let convert: LottieNumericConverter = Arc::new(|value, _component| value);
        let changes = Arc::new(AtomicUsize::new(0));
        let change_count = changes.clone();
        let callback_can_read = Arc::new(AtomicBool::new(false));
        let callback_read = callback_can_read.clone();
        let callback_current = current.clone();
        let on_change: LottieRerender = Arc::new(move || {
            callback_read.store(callback_current.try_read().is_ok(), Ordering::SeqCst);
            change_count.fetch_add(1, Ordering::SeqCst);
        });

        bind_mutable_lottie_numeric_property(
            &json!({ "a": 0, "k": [10, 10] }),
            &current,
            &convert,
            &on_change,
            &mut context,
        );
        assert!(context.channels.is_empty());
        bind_mutable_lottie_numeric_property(
            &animated_vector([0, 0], [10, 20]),
            &current,
            &convert,
            &on_change,
            &mut context,
        );
        assert_eq!(context.channels.len(), 1);

        let clip = create_animation_clip(context.channels, Some(1.0), &[]);
        apply_animation_clip_to_lottie_document(&clip, 0.5);
        let current = current.read().unwrap();
        assert_f32_eq(current[0], 5.0);
        assert_f32_eq(current[1], 10.0);
        assert_eq!(changes.load(Ordering::SeqCst), 1);
        assert!(callback_can_read.load(Ordering::SeqCst));
    }
}

mod create_lottie_track {
    use super::*;

    #[test]
    fn maps_document_frames_to_seconds_for_linear_sampling() {
        let document = test_document();
        let registry = create_lottie_registry();
        let context = import_context(&document, &registry, None);
        let keyframes = animated_vector([0, 0], [10, 20])
            .get("k")
            .and_then(Value::as_array)
            .unwrap()
            .clone();
        let value_of: LottieTrackValueOf = Arc::new(|value, _index| {
            return value
                .and_then(Value::as_array)
                .unwrap()
                .iter()
                .map(|value| value.as_i64().unwrap() as f32)
                .collect();
        });
        let tangent_of: LottieTangentOf = Arc::new(|value, _component| value);
        let track = create_lottie_track(&keyframes, 2, &context, &value_of, 0, false, &tangent_of);
        let mut sample = [0.0, 0.0];
        sample_animation_track(&mut sample, &track.read().unwrap(), 0.5);
        assert_f32_eq(sample[0], 5.0);
        assert_f32_eq(sample[1], 10.0);
    }
}

mod create_scene2d_from_lottie_document_with_registry {
    use super::*;

    #[test]
    fn parses_with_an_empty_registry_and_produces_empty_layer_containers() {
        let result = import(json!({
            "fr": 30,
            "h": 100,
            "ip": 0,
            "layers": [{ "ind": 1, "ip": 0, "nm": "shape", "op": 60, "ty": 4 }],
            "op": 60,
            "w": 100
        }));
        assert_f32_eq(result.duration, 2.0);
        let root: NodeRef = result.root;
        assert_eq!(get_node_child_count(&root), 1);
        let layer = get_node_child_at(&root, 0).unwrap();
        assert_eq!(
            layer.read().unwrap().node_fields().name.as_deref(),
            Some("shape")
        );
        assert_eq!(get_node_child_count(&layer), 0);
    }

    #[test]
    fn rejects_an_invalid_document() {
        let mut diagnostics = Vec::new();
        let result = create_scene2d_from_lottie_document_with_registry(
            &Value::String("not json".to_string()),
            &create_lottie_registry(),
            Some(&mut diagnostics),
            None,
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "lottie.invalid-document");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        assert_f32_eq(result.duration, 0.0);
    }
}

mod has_component_specific_lottie_easing {
    use super::*;

    #[test]
    fn distinguishes_shared_from_per_component_easing_handles() {
        let shared = vec![
            json!({ "t": 0, "s": [0, 0], "o": { "x": 0.1, "y": 0.0 }, "i": { "x": 0.9, "y": 1.0 } }),
            json!({ "t": 30, "s": [10, 20] }),
        ];
        let per_component = vec![
            json!({ "t": 0, "s": [0, 0], "o": { "x": [0.1, 0.9], "y": [0, 0] }, "i": { "x": [0.9, 0.1], "y": [1, 1] } }),
            json!({ "t": 30, "s": [10, 20] }),
        ];
        assert!(!has_component_specific_lottie_easing(&shared, 2));
        assert!(has_component_specific_lottie_easing(&per_component, 2));
    }
}

mod initial_lottie_value {
    use super::*;

    #[test]
    fn reads_static_and_first_keyframe_values() {
        assert_eq!(
            initial_lottie_value(Some(&json!({ "a": 0, "k": 5 }))),
            Some(json!(5))
        );
        assert_eq!(
            initial_lottie_value(Some(&json!({ "a": 1, "k": [{ "s": [7], "t": 0 }] }))),
            Some(json!([7])),
        );
    }

    #[test]
    fn answers_none_for_an_absent_property() {
        assert_eq!(initial_lottie_value(None), None);
    }
}

mod initialize_lottie_document_import_result {
    use super::*;

    #[test]
    fn initializes_every_public_result_field() {
        let root = create_display_object(None);
        let clip = create_animation_clip(Vec::new(), Some(2.0), &[]);
        let mut result: LottieDocumentImportResult = allocate_entity();
        initialize_lottie_document_import_result(
            &mut result,
            root.clone(),
            Vec::new(),
            clip,
            2.0,
            30.0,
        );
        assert!(Arc::ptr_eq(&result.root, &root));
        assert_f32_eq(result.clip.duration, 2.0);
        assert_f32_eq(result.duration, 2.0);
        assert_f32_eq(result.frame_rate, 30.0);
        assert!(result.advanced_blends.is_empty());
    }
}

mod is_animated_lottie_property {
    use super::*;

    #[test]
    fn reads_keyframe_structure_instead_of_the_animation_flag() {
        assert!(is_animated_lottie_property(
            &json!({ "a": 1, "k": [{ "s": [0], "t": 0 }] })
        ));
        assert!(!is_animated_lottie_property(&json!({ "a": 0, "k": 5 })));
        assert!(!is_animated_lottie_property(&json!({ "a": 1, "k": [] })));
        assert!(!is_animated_lottie_property(
            &json!({ "a": 1, "k": [0, 1] })
        ));
    }
}

mod lottie_clamp {
    use super::*;

    #[test]
    fn bounds_a_value_into_the_range_ends_included() {
        assert_f32_eq(lottie_clamp(-1.0, 0.0, 1.0), 0.0);
        assert_f32_eq(lottie_clamp(2.0, 0.0, 1.0), 1.0);
        assert_f32_eq(lottie_clamp(0.5, 0.0, 1.0), 0.5);
    }
}

mod lottie_degrees_to_radians {
    use super::*;

    #[test]
    fn converts_at_the_authoring_layer_boundary_where_lottie_states_degrees() {
        // D1 f32 bound (TS: 5e-11)
        let bound = 5e-11_f32.max(4.0 * f32::EPSILON * std::f32::consts::PI.max(1.0));
        assert!((lottie_degrees_to_radians(180.0) - std::f32::consts::PI).abs() <= bound);
        assert_f32_eq(lottie_degrees_to_radians(0.0), 0.0);
    }
}

mod lottie_numeric_value {
    use super::*;

    #[test]
    fn answers_zeros_for_an_absent_or_non_finite_value() {
        let mut out = Vec::new();
        lottie_numeric_value(&mut out, &None, 2);
        assert_f32_slice_eq(&out, &[0.0, 0.0]);
        lottie_numeric_value(&mut out, &number(f32::NAN), 2);
        assert_f32_slice_eq(&out, &[0.0, 0.0]);
    }

    #[test]
    fn broadcasts_the_first_component_when_the_value_is_shorter_than_requested() {
        let mut out = Vec::new();
        lottie_numeric_value(&mut out, &numbers(vec![1.0]), 3);
        assert_f32_slice_eq(&out, &[1.0, 1.0, 1.0]);
        lottie_numeric_value(&mut out, &number(7.0), 2);
        assert_f32_slice_eq(&out, &[7.0, 7.0]);
    }

    #[test]
    fn returns_exactly_the_requested_component_count_from_either_encoding() {
        let mut out = Vec::new();
        lottie_numeric_value(&mut out, &number(5.0), 1);
        assert_f32_slice_eq(&out, &[5.0]);
        lottie_numeric_value(&mut out, &numbers(vec![1.0, 2.0]), 2);
        assert_f32_slice_eq(&out, &[1.0, 2.0]);
        lottie_numeric_value(&mut out, &numbers(vec![1.0, 2.0, 3.0]), 2);
        assert_eq!(out.len(), 2);
    }
}

mod lottie_rgba {
    use super::*;

    #[test]
    fn packs_unit_floats_into_an_opaque_packed_colour() {
        assert_eq!(lottie_rgba(&[1.0, 0.0, 0.0]), 0xff0000ff);
        assert_eq!(lottie_rgba(&[0.0, 0.0, 0.0]), 0x000000ff);
        assert_eq!(lottie_rgba(&[1.0, 1.0, 1.0]), 0xffffffff);
    }
}

mod report_lottie_drop {
    use super::*;

    #[test]
    fn records_a_drop_diagnostic_a_caller_can_read_back() {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut diagnostics = Vec::new();
        let mut context = import_context(&document, &registry, Some(&mut diagnostics));
        report_lottie_drop(&mut context, "test.drop", "test", None);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "test.drop");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
    }
}

mod report_lottie_expression {
    use super::*;

    #[test]
    fn reports_an_expression_anywhere_inside_a_property_tree() {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut diagnostics = Vec::new();
        let mut context = import_context(&document, &registry, Some(&mut diagnostics));
        report_lottie_expression(
            Some(&json!({ "nested": { "o": { "a": 0, "k": 100, "x": "value*2" } } })),
            &mut context,
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "lottie.unsupported-expression");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
    }
}

mod report_lottie_skip {
    use super::*;

    #[test]
    fn records_a_skip_diagnostic_a_caller_can_read_back() {
        let document = test_document();
        let registry = create_lottie_registry();
        let mut diagnostics = Vec::new();
        let mut context = import_context(&document, &registry, Some(&mut diagnostics));
        report_lottie_skip(&mut context, "test.skip", "test", None);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "test.skip");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
    }
}

fn animated_vector(start: [i32; 2], end: [i32; 2]) -> Value {
    return json!({
        "a": 1,
        "k": [
            { "s": start, "t": 0 },
            { "s": end, "t": 30 }
        ]
    });
}

fn assert_f32_eq(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!(
        (actual - expected).abs() <= bound,
        "{actual} != {expected} within {bound}"
    );
}

fn assert_f32_slice_eq(actual: &[f32], expected: &[f32]) {
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter().zip(expected) {
        assert_f32_eq(*actual, *expected);
    }
}

fn child_names(node: &NodeRef) -> Vec<String> {
    return (0..get_node_child_count(node))
        .map(|index| {
            return get_node_child_at(node, index as i32)
                .unwrap()
                .read()
                .unwrap()
                .node_fields()
                .name
                .clone()
                .unwrap_or_default();
        })
        .collect();
}

fn import(source: Value) -> LottieDocumentImportResult {
    return create_scene2d_from_lottie_document_with_registry(
        &source,
        &create_lottie_registry(),
        None,
        None,
    );
}

fn import_context<'a>(
    document: &'a LottieDocument,
    registry: &'a LottieRegistry,
    diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
) -> LottieImportContext<'a> {
    return LottieImportContext {
        advanced_blends: Vec::new(),
        assets: HashMap::new(),
        channels: Vec::new(),
        diagnostics,
        document,
        frame_offset: 0.0,
        frame_scale: 1.0,
        registry,
        resolve_image_resource: None,
        resolving_precompositions: HashSet::new(),
    };
}

fn named_child(
    root: &Arc<RwLock<flight_scene2d::contract::DisplayObject>>,
    name: &str,
) -> Node2DRef {
    let root: NodeRef = root.clone();
    for index in 0..get_node_child_count(&root) {
        let child = get_node_child_at(&root, index as i32).unwrap();
        if child.read().unwrap().node_fields().name.as_deref() == Some(name) {
            return as_node2d_ref(&child).unwrap();
        }
    }
    panic!("missing child {name}");
}

fn number(value: f32) -> Unknown {
    return Some(Arc::new(value));
}

fn numbers(values: Vec<f32>) -> Unknown {
    return Some(Arc::new(values));
}

fn record(value: Value) -> LottieRecord {
    return LottieRecord::from(value.as_object().unwrap().clone());
}

fn test_document() -> LottieDocument {
    return record(json!({
        "fr": 30,
        "h": 100,
        "ip": 0,
        "layers": [],
        "op": 60,
        "w": 100
    }));
}
