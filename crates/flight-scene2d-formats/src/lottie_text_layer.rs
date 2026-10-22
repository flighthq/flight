use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_color::contract::pack_color;
use flight_importdiagnostics::contract::ImportDiagnosticDetailValue;
use flight_node::contract::{NodeRef, add_node_child};
use flight_text::contract::create_text_label;
use flight_textformat::contract::{TextFormat, TextFormatAlign};
use flight_textlayout::contract::TextAutoSize;
use serde_json::{Map, Value};

use crate::lottie_document::report_lottie_drop;
use crate::types::LottieLayerContext;

pub fn lottie_text_layer_handler(context: &mut LottieLayerContext<'_, '_>) {
    let first = context
        .layer
        .get("t")
        .and_then(|value| value.get("d"))
        .and_then(|value| value.get("k"))
        .and_then(Value::as_array)
        .and_then(|keyframes| keyframes.first())
        .and_then(|keyframe| keyframe.get("s"))
        .and_then(Value::as_object);
    let Some(first) = first else {
        report_lottie_drop(
            context.import,
            "lottie.text-missing-document",
            "appendLottieText",
            Some(HashMap::from([(
                "layer".to_string(),
                ImportDiagnosticDetailValue::String(
                    context
                        .layer
                        .get("nm")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                ),
            )])),
        );
        return;
    };
    let color = first
        .get("fc")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let component = |index: usize| {
        return color.get(index).and_then(Value::as_f64).unwrap_or(0.0) as f32;
    };
    let size = lottie_text_number(first, "s").unwrap_or(16.0);
    let text_format = Arc::new(RwLock::new(TextFormat {
        align: Some(match first.get("j").and_then(Value::as_i64) {
            Some(1) => TextFormatAlign::Right,
            Some(2) => TextFormatAlign::Center,
            _ => TextFormatAlign::Left,
        }),
        color: Some(pack_color(component(0), component(1), component(2), 1.0)),
        font: first.get("f").and_then(Value::as_str).map(str::to_string),
        leading: lottie_text_number(first, "lh"),
        letter_spacing: lottie_text_number(first, "tr"),
        size: lottie_text_number(first, "s"),
        ..TextFormat::default()
    }));
    let width = context
        .import
        .document
        .get("w")
        .and_then(Value::as_f64)
        .unwrap_or(0.0) as f32;
    let label = create_text_label(None);
    {
        let mut guard = label.write().unwrap();
        guard.data.auto_size = TextAutoSize::Left;
        guard.data.height = size * 1.25;
        guard.data.text = first
            .get("t")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        guard.data.text_format = text_format;
        guard.data.width = width;
    }
    let parent: NodeRef = context.container.clone();
    let child: NodeRef = label;
    add_node_child(&parent, &child);
}

// flight-lint: allow(f64) serde_json exposes authored Lottie text numbers as f64 before the approved D1 f32 conversion
fn lottie_text_number(document: &Map<String, Value>, key: &str) -> Option<f32> {
    return document
        .get(key)
        .and_then(Value::as_f64)
        .map(|value| value as f32);
}
