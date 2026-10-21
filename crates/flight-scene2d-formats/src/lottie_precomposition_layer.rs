use std::collections::HashMap;

use flight_importdiagnostics::contract::ImportDiagnosticDetailValue;
use serde_json::Value;

use crate::lottie_document::{append_lottie_layers, report_lottie_drop};
use crate::types::{LottieLayerContext, LottieRecord};

fn detail_id(id: &str) -> HashMap<String, ImportDiagnosticDetailValue> {
    return HashMap::from([(
        "id".to_string(),
        ImportDiagnosticDetailValue::String(id.to_string()),
    )]);
}

pub fn lottie_precomposition_layer_handler(context: &mut LottieLayerContext<'_, '_>) {
    let id = context
        .layer
        .get("refId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let Some(asset) = context.import.assets.get(&id).cloned() else {
        report_unresolved(context, &id);
        return;
    };
    let Some(layers) = asset.get("layers").and_then(Value::as_array) else {
        report_unresolved(context, &id);
        return;
    };
    let layers = layers
        .iter()
        .filter_map(|layer| layer.as_object().cloned().map(LottieRecord::from))
        .collect::<Vec<_>>();
    if context.import.resolving_precompositions.contains(&id) {
        report_lottie_drop(
            context.import,
            "lottie.recursive-precomposition",
            "appendLottiePrecomposition",
            Some(detail_id(&id)),
        );
        return;
    }

    context.import.resolving_precompositions.insert(id.clone());
    let frame_offset = context.import.frame_offset;
    let frame_scale = context.import.frame_scale;
    context.import.frame_offset =
        frame_offset + value_f32(context.layer.get("st"), 0.0) * frame_scale;
    context.import.frame_scale = frame_scale * value_f32(context.layer.get("sr"), 1.0);
    append_lottie_layers(&context.container, &layers, context.import);
    context.import.frame_offset = frame_offset;
    context.import.frame_scale = frame_scale;
    context.import.resolving_precompositions.remove(&id);
}

fn report_unresolved(context: &mut LottieLayerContext<'_, '_>, id: &str) {
    report_lottie_drop(
        context.import,
        "lottie.unresolved-asset",
        "appendLottiePrecomposition",
        Some(detail_id(id)),
    );
}

// flight-lint: allow(f64) serde_json exposes authored Lottie timing numbers as f64 before the approved D1 f32 conversion
fn value_f32(value: Option<&Value>, fallback: f32) -> f32 {
    return value
        .and_then(Value::as_f64)
        .map(|value| value as f32)
        .unwrap_or(fallback);
}
