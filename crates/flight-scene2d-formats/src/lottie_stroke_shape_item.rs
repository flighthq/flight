use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_importdiagnostics::contract::ImportDiagnosticDetailValue;
use flight_shape::contract::{CapsStyle, JointStyle, LineScaleMode, append_shape_line_style};
use serde_json::Value;

use crate::lottie_document::{
    bind_mutable_lottie_numeric_property, initial_lottie_value, is_animated_lottie_property,
    lottie_numeric_json_value, lottie_rgba, report_lottie_skip,
};
use crate::lottie_shape_paint::append_lottie_dashed_shape_paths;
use crate::types::{LottieNumericConverter, LottieShapeItemContext, LottieShapePainter};

// flight-lint: allow(f64) shape command stroke values and path dash measurements use the approved D1 f64 lanes
pub fn lottie_stroke_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    let color = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial_lottie_value(context.item.get("c")).as_ref(),
        3,
    )));
    let opacity = Arc::new(RwLock::new(vec![
        lottie_numeric_json_value(initial_lottie_value(context.item.get("o")).as_ref(), 1)[0]
            / 100.0,
    ]));
    let width = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial_lottie_value(context.item.get("w")).as_ref(),
        1,
    )));
    let miter_limit = Arc::new(RwLock::new(vec![
        context
            .item
            .get("ml2")
            .map(|property| {
                lottie_numeric_json_value(initial_lottie_value(Some(property)).as_ref(), 1)[0]
            })
            .unwrap_or_else(|| {
                context
                    .item
                    .get("ml")
                    .and_then(Value::as_f64)
                    .unwrap_or(4.0) as f32
            }),
    ]));
    let dash_entries = context
        .item
        .get("d")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let has_animated_dash = dash_entries
        .iter()
        .any(|entry| entry.get("v").is_some_and(is_animated_lottie_property));
    let dash = if has_animated_dash {
        Vec::new()
    } else {
        dash_entries
            .iter()
            .filter(|entry| entry.get("n").and_then(Value::as_str) != Some("o"))
            .map(|entry| {
                f64::from(
                    lottie_numeric_json_value(initial_lottie_value(entry.get("v")).as_ref(), 1)[0]
                        .max(0.0),
                )
            })
            .collect::<Vec<_>>()
    };
    let dash = if dash.iter().any(|value| *value > 0.0) {
        dash
    } else {
        Vec::new()
    };
    let dash_offset = if has_animated_dash {
        0.0
    } else {
        dash_entries
            .iter()
            .find(|entry| entry.get("n").and_then(Value::as_str) == Some("o"))
            .map(|entry| {
                f64::from(
                    lottie_numeric_json_value(initial_lottie_value(entry.get("v")).as_ref(), 1)[0],
                )
            })
            .unwrap_or(0.0)
    };
    if has_animated_dash {
        report_lottie_skip(
            context.import,
            "lottie.unsupported-shape-modifier",
            "lottieStrokeShapeItemHandler",
            Some(HashMap::from([(
                "modifier".to_string(),
                ImportDiagnosticDetailValue::String("dash".to_string()),
            )])),
        );
    }
    let caps = map_lottie_line_cap(
        context
            .item
            .get("lc")
            .and_then(Value::as_i64)
            .map(|value| value as i32),
    );
    let joints = map_lottie_line_join(
        context
            .item
            .get("lj")
            .and_then(Value::as_i64)
            .map(|value| value as i32),
    );
    let paint_color = color.clone();
    let paint_opacity = opacity.clone();
    let paint_width = width.clone();
    let paint_miter_limit = miter_limit.clone();
    let painter: LottieShapePainter = Arc::new(move |shape, paths| {
        append_shape_line_style(
            shape,
            Some(f64::from(paint_width.read().unwrap()[0])),
            lottie_rgba(&paint_color.read().unwrap()),
            Some(f64::from(paint_opacity.read().unwrap()[0])),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(caps),
            Some(joints),
            Some(f64::from(paint_miter_limit.read().unwrap()[0])),
        );
        append_lottie_dashed_shape_paths(paths, shape, None, &dash, dash_offset);
    });
    context.painters.write().unwrap().push(painter);
    let identity: LottieNumericConverter = Arc::new(|value, _component| value);
    for (key, current) in [("c", &color), ("w", &width)] {
        if let Some(property) = context.item.get(key) {
            bind_mutable_lottie_numeric_property(
                property,
                current,
                &identity,
                &context.rerender,
                context.import,
            );
        }
    }
    let percent: LottieNumericConverter = Arc::new(|value, _component| value / 100.0);
    if let Some(property) = context.item.get("o") {
        bind_mutable_lottie_numeric_property(
            property,
            &opacity,
            &percent,
            &context.rerender,
            context.import,
        );
    }
    if let Some(property) = context.item.get("ml2") {
        bind_mutable_lottie_numeric_property(
            property,
            &miter_limit,
            &identity,
            &context.rerender,
            context.import,
        );
    }
}

pub fn map_lottie_line_cap(value: Option<i32>) -> CapsStyle {
    return match value {
        Some(2) => CapsStyle::Round,
        Some(3) => CapsStyle::Square,
        _ => CapsStyle::None,
    };
}

pub fn map_lottie_line_join(value: Option<i32>) -> JointStyle {
    return match value {
        Some(2) => JointStyle::Round,
        Some(3) => JointStyle::Bevel,
        _ => JointStyle::Miter,
    };
}
