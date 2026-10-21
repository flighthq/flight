use std::collections::HashMap;

use serde_json::Value;

use crate::types::*;

const LOTTIE_LAYER_FEATURES: [(i32, &str); 6] = [
    (LOTTIE_LAYER_KIND_IMAGE, "layer.image"),
    (LOTTIE_LAYER_KIND_NULL, "layer.null"),
    (LOTTIE_LAYER_KIND_PRECOMPOSITION, "layer.precomposition"),
    (LOTTIE_LAYER_KIND_SHAPE, "layer.shape"),
    (LOTTIE_LAYER_KIND_SOLID, "layer.solid"),
    (LOTTIE_LAYER_KIND_TEXT, "layer.text"),
];

const LOTTIE_MASK_INVERTED: &str = "mask.inverted";
const LOTTIE_MASK_MULTIPLE: &str = "mask.multiple";
const LOTTIE_MASK_CONDITION_FEATURES: [&str; 2] = [LOTTIE_MASK_INVERTED, LOTTIE_MASK_MULTIPLE];
const LOTTIE_MASK_FEATURES: [(&str, &str); 6] = [
    (LOTTIE_MASK_KIND_ADDITIVE, "mask.additive"),
    (LOTTIE_MASK_KIND_DARKEN, "mask.darken"),
    (LOTTIE_MASK_KIND_DIFFERENCE, "mask.difference"),
    (LOTTIE_MASK_KIND_INTERSECT, "mask.intersect"),
    (LOTTIE_MASK_KIND_LIGHTEN, "mask.lighten"),
    (LOTTIE_MASK_KIND_SUBTRACT, "mask.subtract"),
];

const LOTTIE_SHAPE_ITEM_FEATURES: [(&str, &str); 9] = [
    (LOTTIE_SHAPE_ITEM_KIND_ELLIPSE, "shape.ellipse"),
    (LOTTIE_SHAPE_ITEM_KIND_FILL, "shape.fill"),
    (LOTTIE_SHAPE_ITEM_KIND_GRADIENT_FILL, "shape.gradientFill"),
    (
        LOTTIE_SHAPE_ITEM_KIND_GRADIENT_STROKE,
        "shape.gradientStroke",
    ),
    (LOTTIE_SHAPE_ITEM_KIND_PATH, "shape.path"),
    (LOTTIE_SHAPE_ITEM_KIND_POLYSTAR, "shape.polystar"),
    (LOTTIE_SHAPE_ITEM_KIND_RECTANGLE, "shape.rectangle"),
    (LOTTIE_SHAPE_ITEM_KIND_STROKE, "shape.stroke"),
    (LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH, "shape.trimPath"),
];

// flight-lint: allow(f64) serde_json exposes exact JSON number comparison through f64
// flight-lint: allow(conform-params) D24: caller-owned map replaces the structured Map return (user-approved)
pub fn collect_lottie_counts(out: &mut HashMap<String, usize>, json: &str) -> bool {
    out.clear();
    let Ok(document) = serde_json::from_str::<Value>(json) else {
        return false;
    };
    let Some(record) = document.as_object() else {
        return false;
    };
    if !is_lottie_document(record) {
        return false;
    }
    let Some(layers) = record.get("layers").and_then(Value::as_array) else {
        return false;
    };
    for layer in layers {
        let Some(entry) = layer.as_object() else {
            continue;
        };
        let Some(layer_kind) = entry.get("ty").and_then(Value::as_f64) else {
            continue;
        };
        if let Some((_, feature)) = LOTTIE_LAYER_FEATURES
            .iter()
            .find(|(kind, _)| layer_kind == f64::from(*kind))
        {
            increment(out, feature);
        }
        if layer_kind == f64::from(LOTTIE_LAYER_KIND_SHAPE) {
            tally_shape_items(out, entry.get("shapes"));
        }
        tally_masks(out, entry.get("masksProperties"));
    }
    return true;
}

// flight-lint: allow(conform-params) D24: caller-owned vector replaces the structured array return (user-approved)
pub fn get_lottie_feature_names(out: &mut Vec<String>) {
    out.clear();
    out.extend(
        LOTTIE_LAYER_FEATURES
            .iter()
            .map(|(_, feature)| (*feature).to_string())
            .chain(
                LOTTIE_MASK_FEATURES
                    .iter()
                    .map(|(_, feature)| (*feature).to_string()),
            )
            .chain(
                LOTTIE_MASK_CONDITION_FEATURES
                    .iter()
                    .map(|feature| (*feature).to_string()),
            )
            .chain(
                LOTTIE_SHAPE_ITEM_FEATURES
                    .iter()
                    .map(|(_, feature)| (*feature).to_string()),
            ),
    );
    out.sort_unstable();
}

fn increment(counts: &mut HashMap<String, usize>, kind: &str) {
    *counts.entry(kind.to_string()).or_default() += 1;
}

fn is_lottie_document(record: &serde_json::Map<String, Value>) -> bool {
    return record.get("layers").is_some_and(Value::is_array)
        && record
            .get("fr")
            .and_then(Value::as_f64)
            .is_some_and(|frame_rate| frame_rate > 0.0)
        && record.get("ip").is_some_and(Value::is_number)
        && record.get("op").is_some_and(Value::is_number);
}

fn tally_masks(counts: &mut HashMap<String, usize>, raw: Option<&Value>) {
    let Some(masks) = raw.and_then(Value::as_array) else {
        return;
    };
    let mut active = 0;
    for value in masks {
        let Some(mask) = value.as_object() else {
            continue;
        };
        let Some(mode) = mask.get("mode").and_then(Value::as_str) else {
            continue;
        };
        if mode == LOTTIE_MASK_KIND_NONE {
            continue;
        }
        active += 1;
        if let Some((_, feature)) = LOTTIE_MASK_FEATURES.iter().find(|(kind, _)| *kind == mode) {
            increment(counts, feature);
        }
        if mask.get("inv").and_then(Value::as_bool) == Some(true) {
            increment(counts, LOTTIE_MASK_INVERTED);
        }
    }
    if active > 1 {
        increment(counts, LOTTIE_MASK_MULTIPLE);
    }
}

fn tally_shape_items(counts: &mut HashMap<String, usize>, raw: Option<&Value>) {
    let Some(items) = raw.and_then(Value::as_array) else {
        return;
    };
    for value in items {
        let Some(item) = value.as_object() else {
            continue;
        };
        let Some(kind) = item.get("ty").and_then(Value::as_str) else {
            continue;
        };
        if let Some((_, feature)) = LOTTIE_SHAPE_ITEM_FEATURES
            .iter()
            .find(|(item_kind, _)| *item_kind == kind)
        {
            increment(counts, feature);
        }
        if kind == "gr" {
            tally_shape_items(counts, item.get("it"));
        }
    }
}
