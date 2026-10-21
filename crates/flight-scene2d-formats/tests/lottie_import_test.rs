use flight_node::contract::{get_node_child_at, get_node_child_count, NodeRef};
use flight_scene2d::contract::{as_node2d_ref, Node2DRef};
use flight_scene2d_formats::contract::*;
use serde_json::{Map, Value};

#[derive(Debug, PartialEq)]
struct NodeSignature {
    children: Vec<NodeSignature>,
    kind: String,
    name: Option<String>,
}

mod create_scene2d_from_lottie_document {
    use super::*;

    #[test]
    fn produces_empty_layer_containers_when_no_handlers_are_registered() {
        let document = document_value(&create_lottie_test_document(vec![lottie_test_shape_layer(
            1, "shape",
        )]));
        let default_result = create_scene2d_from_lottie_document(&document, None, None);
        let options = LottieDocumentImportOptions {
            layer_handlers: Some(Vec::new()),
            mask_handlers: None,
            resolve_image_resource: None,
            shape_item_handlers: Some(Vec::new()),
        };
        let empty_result = create_scene2d_from_lottie_document(&document, None, Some(&options));
        let empty_root: NodeRef = empty_result.root;
        let default_root: NodeRef = default_result.root;
        assert_eq!(get_node_child_count(&empty_root), 1);
        let empty_layer = get_node_child_at(&empty_root, 0).unwrap();
        let default_layer = get_node_child_at(&default_root, 0).unwrap();
        assert_eq!(get_node_child_count(&empty_layer), 0);
        assert!(get_node_child_count(&default_layer) > 0);
    }

    #[test]
    fn produces_identical_output_with_registry_populated_handlers_and_zero_config_defaults() {
        let document = document_value(&create_lottie_test_document(vec![
            lottie_test_shape_layer(1, "shape"),
            LottieRecord::from(Map::from_iter([
                ("ind".to_string(), Value::from(2)),
                ("ip".to_string(), Value::from(0)),
                ("nm".to_string(), Value::from("null")),
                ("op".to_string(), Value::from(60)),
                ("ty".to_string(), Value::from(3)),
            ])),
            LottieRecord::from(Map::from_iter([
                ("ind".to_string(), Value::from(3)),
                ("ip".to_string(), Value::from(0)),
                ("nm".to_string(), Value::from("solid")),
                ("op".to_string(), Value::from(60)),
                ("sc".to_string(), Value::from("#ff0000")),
                ("sh".to_string(), Value::from(50)),
                ("sw".to_string(), Value::from(50)),
                ("ty".to_string(), Value::from(1)),
            ])),
        ]));
        let default_result = create_scene2d_from_lottie_document(&document, None, None);
        let mut registry = create_lottie_registry();
        register_all_lottie_handlers(&mut registry);
        let options = LottieDocumentImportOptions {
            layer_handlers: Some(registry.layer_handlers),
            mask_handlers: Some(registry.mask_handlers),
            resolve_image_resource: None,
            shape_item_handlers: Some(registry.shape_item_handlers),
        };
        let registry_result = create_scene2d_from_lottie_document(&document, None, Some(&options));
        assert_f32_eq(registry_result.duration, default_result.duration);
        assert_f32_eq(registry_result.frame_rate, default_result.frame_rate);
        assert_eq!(
            registry_result.clip.channels.len(),
            default_result.clip.channels.len()
        );
        assert_eq!(
            registry_result.advanced_blends.len(),
            default_result.advanced_blends.len()
        );
        let registry_root: NodeRef = registry_result.root;
        let default_root: NodeRef = default_result.root;
        assert_eq!(
            node_signature(&registry_root),
            node_signature(&default_root)
        );
    }

    #[test]
    fn returns_the_display_subtree_and_target_bound_clip() {
        let document = document_value(&create_lottie_test_document(vec![lottie_test_shape_layer(
            1, "shape",
        )]));
        let result = create_scene2d_from_lottie_document(&document, None, None);
        let root: Node2DRef = result.root.clone();
        assert!(find_lottie_test_node_by_name(&root, "shape").is_some());
        assert_f32_eq(result.clip.duration, 2.0);
    }
}

fn assert_f32_eq(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!((actual - expected).abs() <= bound);
}

fn document_value(document: &LottieDocument) -> Value {
    return Value::Object(Map::from_iter(
        document
            .iter()
            .map(|(key, value)| (key.clone(), value.clone())),
    ));
}

fn node_signature(node: &NodeRef) -> NodeSignature {
    let children = (0..get_node_child_count(node))
        .filter_map(|index| get_node_child_at(node, index as i32))
        .map(|child| node_signature(&child))
        .collect();
    let node = as_node2d_ref(node).unwrap();
    let node = node.read().unwrap();
    return NodeSignature {
        children,
        kind: node.node_fields().kind.clone(),
        name: node.node_fields().name.clone(),
    };
}
