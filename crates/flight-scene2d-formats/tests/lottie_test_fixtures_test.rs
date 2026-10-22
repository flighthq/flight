use flight_node::contract::{NodeRef, add_node_child};
use flight_scene2d::contract::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::create_shape;
use serde_json::Value;

mod animated_lottie_test_scalar {
    use super::*;

    #[test]
    fn builds_two_scalar_keyframes_over_the_fixture_timeline() {
        let property = animated_lottie_test_scalar(0.0, 10.0);
        assert_eq!(property.get("a").and_then(Value::as_i64), Some(1));
        let keyframes = property.get("k").and_then(Value::as_array).unwrap();
        assert_eq!(keyframes.len(), 2);
        assert_f32_eq(keyframes[0].get("s").unwrap().as_f64().unwrap() as f32, 0.0);
        assert_f32_eq(
            keyframes[1].get("s").unwrap().as_f64().unwrap() as f32,
            10.0,
        );
    }
}

mod animated_lottie_test_vector {
    use super::*;

    #[test]
    fn builds_two_vector_keyframes_carrying_both_components() {
        let property =
            animated_lottie_test_vector(vec![0.0, 0.0], vec![10.0, 20.0], None, None, None, None);
        assert_eq!(property.get("a").and_then(Value::as_i64), Some(1));
        let keyframes = property.get("k").and_then(Value::as_array).unwrap();
        assert_json_f32_array(keyframes[0].get("s").unwrap(), &[0.0, 0.0]);
        assert_json_f32_array(keyframes[1].get("s").unwrap(), &[10.0, 20.0]);
    }
}

mod create_lottie_test_document {
    use super::*;

    #[test]
    fn carries_every_field_the_importer_requires() {
        let document = create_lottie_test_document(vec![lottie_test_shape_layer(1, "shape")]);
        assert!(document.get("fr").and_then(Value::as_i64).unwrap() > 0);
        assert!(
            document.get("op").and_then(Value::as_i64).unwrap()
                > document.get("ip").and_then(Value::as_i64).unwrap()
        );
        assert!(document.get("w").and_then(Value::as_i64).unwrap() > 0);
        assert!(document.get("h").and_then(Value::as_i64).unwrap() > 0);
        assert_eq!(
            document
                .get("layers")
                .and_then(Value::as_array)
                .unwrap()
                .len(),
            1
        );
    }
}

mod find_lottie_test_node_by_kind {
    use super::*;

    #[test]
    fn searches_the_whole_subtree_and_returns_none_for_an_absent_kind() {
        let root: Node2DRef = create_display_object();
        let branch: Node2DRef = create_display_object();
        let shape: Node2DRef = create_shape();
        add(&root, &branch);
        add(&branch, &shape);
        assert!(find_lottie_test_node_by_kind(&root, flight_shape::contract::SHAPE_KIND).is_some());
        assert!(find_lottie_test_node_by_kind(&root, "NoSuchKind").is_none());
    }
}

mod find_lottie_test_node_by_name {
    use super::*;

    #[test]
    fn searches_the_whole_subtree_and_returns_none_for_an_absent_name() {
        let root: Node2DRef = create_display_object();
        let child: Node2DRef = create_display_object();
        child.write().unwrap().node_fields_mut().name = Some("named".to_string());
        add(&root, &child);
        assert!(find_lottie_test_node_by_name(&root, "named").is_some());
        assert!(find_lottie_test_node_by_name(&root, "absent").is_none());
    }
}

mod lottie_test_shape_layer {
    use super::*;

    #[test]
    fn builds_a_named_shape_layer_with_a_rectangle_and_fill() {
        let layer = lottie_test_shape_layer(3, "named");
        assert_eq!(layer.get("ind").and_then(Value::as_i64), Some(3));
        assert_eq!(layer.get("nm").and_then(Value::as_str), Some("named"));
        assert_eq!(
            layer.get("shapes").and_then(Value::as_array).unwrap().len(),
            2
        );
    }
}

mod lottie_test_square_path {
    use super::*;

    #[test]
    fn builds_a_closed_four_vertex_path_with_zero_tangents() {
        let path = lottie_test_square_path(0.0, 0.0, 10.0);
        assert!(path.c);
        assert_eq!(path.v.len(), 4);
        assert_eq!(path.i.len(), 4);
        assert_eq!(path.o.len(), 4);
        assert_f32_slice_eq(&path.v[2], &[10.0, 10.0]);
        for tangent in path.i.iter().chain(&path.o) {
            assert_f32_slice_eq(tangent, &[0.0, 0.0]);
        }
    }
}

fn add(parent: &Node2DRef, child: &Node2DRef) {
    let parent: NodeRef = parent.clone();
    let child: NodeRef = child.clone();
    add_node_child(&parent, &child);
}

fn assert_f32_eq(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!((actual - expected).abs() <= bound);
}

fn assert_f32_slice_eq(actual: &[f32], expected: &[f32]) {
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter().zip(expected) {
        assert_f32_eq(*actual, *expected);
    }
}

// flight-lint: allow(f64) serde_json exposes the authored fixture number as f64 before the D1 f32 assertion boundary
fn assert_json_f32_array(actual: &Value, expected: &[f32]) {
    let actual = actual
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value.as_f64().unwrap() as f32)
        .collect::<Vec<_>>();
    assert_f32_slice_eq(&actual, expected);
}
