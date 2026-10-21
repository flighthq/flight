use flight_node::contract::{NodeRef, get_node_child_at, get_node_child_count};
use flight_scene2d::contract::{Node2DRef, as_node2d_ref};
use serde_json::{Map, Value, json};

use crate::types::{LottieDocument, LottieLayer, LottieRecord, LottieShapePath};

pub fn create_lottie_test_document(layers: Vec<LottieLayer>) -> LottieDocument {
    let layers = layers
        .into_iter()
        .map(|layer| {
            return Value::Object(Map::from_iter(layer.iter().map(|(key, value)| {
                return (key.clone(), value.clone());
            })));
        })
        .collect::<Vec<_>>();
    return LottieRecord::from(Map::from_iter([
        ("fr".to_string(), Value::from(30)),
        ("h".to_string(), Value::from(100)),
        ("ip".to_string(), Value::from(0)),
        ("layers".to_string(), Value::Array(layers)),
        ("op".to_string(), Value::from(60)),
        ("w".to_string(), Value::from(100)),
    ]));
}

// flight-lint: allow(contract-vocabulary) serde_json::Value preserves the scalar animatable record used by the shared source fixtures
pub fn animated_lottie_test_scalar(start: f32, end: f32) -> Value {
    return json!({
        "a": 1,
        "k": [
            { "s": start, "t": 0 },
            { "s": end, "t": 30 }
        ]
    });
}

// flight-lint: allow(contract-vocabulary) serde_json::Value preserves the vector animatable and per-component easing-handle unions
pub fn animated_lottie_test_vector(
    start: Vec<f32>,
    end: Vec<f32>,
    ox: Option<Vec<f32>>,
    oy: Option<Vec<f32>>,
    ix: Option<Vec<f32>>,
    iy: Option<Vec<f32>>,
) -> Value {
    return json!({
        "a": 1,
        "k": [
            {
                "o": {
                    "x": ox.unwrap_or_else(|| vec![0.333]),
                    "y": oy.unwrap_or_else(|| vec![0.0])
                },
                "s": start,
                "t": 0
            },
            {
                "i": {
                    "x": ix.unwrap_or_else(|| vec![0.667]),
                    "y": iy.unwrap_or_else(|| vec![1.0])
                },
                "s": end,
                "t": 30
            }
        ]
    });
}

pub fn find_lottie_test_node_by_kind(root: &Node2DRef, kind: &str) -> Option<Node2DRef> {
    let matches = root.read().unwrap().node_fields().kind == kind;
    if matches {
        return Some(root.clone());
    }
    let root: NodeRef = root.clone();
    for index in 0..get_node_child_count(&root) {
        let Some(child) =
            get_node_child_at(&root, index as i32).and_then(|child| as_node2d_ref(&child))
        else {
            continue;
        };
        if let Some(found) = find_lottie_test_node_by_kind(&child, kind) {
            return Some(found);
        }
    }
    return None;
}

pub fn find_lottie_test_node_by_name(root: &Node2DRef, name: &str) -> Option<Node2DRef> {
    let matches = root.read().unwrap().node_fields().name.as_deref() == Some(name);
    if matches {
        return Some(root.clone());
    }
    let root: NodeRef = root.clone();
    for index in 0..get_node_child_count(&root) {
        let Some(child) =
            get_node_child_at(&root, index as i32).and_then(|child| as_node2d_ref(&child))
        else {
            continue;
        };
        if let Some(found) = find_lottie_test_node_by_name(&child, name) {
            return Some(found);
        }
    }
    return None;
}

pub fn lottie_test_shape_layer(ind: i32, name: &str) -> LottieLayer {
    return LottieRecord::from(
        json!({
            "ind": ind,
            "ip": 0,
            "nm": name,
            "op": 60,
            "shapes": [
                { "p": { "k": [5, 5] }, "r": { "k": 0 }, "s": { "k": [10, 10] }, "ty": "rc" },
                { "c": { "k": [1, 0, 0] }, "o": { "k": 100 }, "ty": "fl" }
            ],
            "ty": 4
        })
        .as_object()
        .unwrap()
        .clone(),
    );
}

pub fn lottie_test_square_path(x: f32, y: f32, size: f32) -> LottieShapePath {
    return LottieShapePath {
        c: true,
        i: vec![vec![0.0, 0.0]; 4],
        o: vec![vec![0.0, 0.0]; 4],
        v: vec![
            vec![x, y],
            vec![x + size, y],
            vec![x + size, y + size],
            vec![x, y + size],
        ],
    };
}
