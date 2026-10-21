use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_importdiagnostics::contract::ImportDiagnosticDetailValue;
use flight_path::contract::PathWinding;
use flight_shape::contract::{
    CapsStyle, GradientType, JointStyle, LineScaleMode, append_shape_begin_gradient_fill,
    append_shape_end_fill, append_shape_line_gradient_style, append_shape_line_style,
};
use serde_json::Value;

use crate::lottie_document::{
    bind_mutable_lottie_numeric_property, initial_lottie_value, is_animated_lottie_property,
    lottie_numeric_json_value, report_lottie_skip,
};
use crate::lottie_gradient_paint::{create_lottie_gradient_matrix, parse_lottie_gradient};
use crate::lottie_shape_paint::{append_lottie_dashed_shape_paths, append_lottie_shape_paths};
use crate::lottie_stroke_shape_item::{map_lottie_line_cap, map_lottie_line_join};
use crate::types::{LottieNumericConverter, LottieShapeItemContext, LottieShapePainter};

// flight-lint: allow(f64) retained dash measurements feed the approved D1 f64 path lane
struct GradientState {
    caps: CapsStyle,
    count: usize,
    dash: Vec<f64>,
    dash_offset: f64,
    end: Arc<RwLock<Vec<f32>>>,
    gradient_type: GradientType,
    joints: JointStyle,
    miter_limit: Arc<RwLock<Vec<f32>>>,
    opacity: Arc<RwLock<Vec<f32>>>,
    start: Arc<RwLock<Vec<f32>>>,
    values: Arc<RwLock<Vec<f32>>>,
    width: Arc<RwLock<Vec<f32>>>,
    winding: PathWinding,
}

// flight-lint: allow(f64) gradient command arrays use the approved D1 f64 shape-command lane
fn gradient_fill_painter(state: Arc<GradientState>) -> LottieShapePainter {
    return Arc::new(move |shape, paths| {
        let gradient = parse_lottie_gradient(
            &state.values.read().unwrap(),
            state.count,
            state.opacity.read().unwrap()[0] / 100.0,
        );
        let alphas = gradient
            .alphas
            .iter()
            .copied()
            .map(f64::from)
            .collect::<Vec<_>>();
        let ratios = gradient
            .ratios
            .iter()
            .copied()
            .map(f64::from)
            .collect::<Vec<_>>();
        let matrix =
            create_lottie_gradient_matrix(&state.start.read().unwrap(), &state.end.read().unwrap());
        append_shape_begin_gradient_fill(
            shape,
            state.gradient_type,
            &gradient.colors,
            &alphas,
            &ratios,
            Some(&matrix),
            None,
            None,
            None,
        );
        append_lottie_shape_paths(paths, shape, Some(state.winding));
        append_shape_end_fill(shape);
    });
}

// flight-lint: allow(f64) gradient and line command arrays use the approved D1 f64 shape-command lane
fn gradient_stroke_painter(state: Arc<GradientState>) -> LottieShapePainter {
    return Arc::new(move |shape, paths| {
        let gradient = parse_lottie_gradient(
            &state.values.read().unwrap(),
            state.count,
            state.opacity.read().unwrap()[0] / 100.0,
        );
        let alphas = gradient
            .alphas
            .iter()
            .copied()
            .map(f64::from)
            .collect::<Vec<_>>();
        let ratios = gradient
            .ratios
            .iter()
            .copied()
            .map(f64::from)
            .collect::<Vec<_>>();
        let matrix =
            create_lottie_gradient_matrix(&state.start.read().unwrap(), &state.end.read().unwrap());
        append_shape_line_style(
            shape,
            Some(f64::from(state.width.read().unwrap()[0])),
            0x000000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(state.caps),
            Some(state.joints),
            Some(f64::from(state.miter_limit.read().unwrap()[0])),
        );
        append_shape_line_gradient_style(
            shape,
            state.gradient_type,
            &gradient.colors,
            &alphas,
            &ratios,
            Some(&matrix),
            None,
            None,
            None,
        );
        append_lottie_dashed_shape_paths(paths, shape, None, &state.dash, state.dash_offset);
    });
}

// flight-lint: allow(f64) authored gradient dash values enter the approved D1 f64 path lane
fn handle_lottie_gradient_item(context: &mut LottieShapeItemContext<'_, '_>, stroke: bool) {
    let gradient = context.item.get("g").and_then(Value::as_object);
    let gradient_property = gradient.and_then(|gradient| gradient.get("k"));
    let count = gradient
        .and_then(|gradient| gradient.get("p"))
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    let initial = initial_lottie_value(gradient_property);
    let initial_len = initial
        .as_ref()
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    let values = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial.as_ref(),
        (count * 4).max(initial_len),
    )));
    let start = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial_lottie_value(context.item.get("s")).as_ref(),
        2,
    )));
    let end = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial_lottie_value(context.item.get("e")).as_ref(),
        2,
    )));
    let opacity =
        Arc::new(RwLock::new(vec![context.item.get("o").map_or(
            100.0,
            |property| {
                lottie_numeric_json_value(initial_lottie_value(Some(property)).as_ref(), 1)[0]
            },
        )]));
    let width =
        Arc::new(RwLock::new(vec![context.item.get("w").map_or(
            1.0,
            |property| {
                lottie_numeric_json_value(initial_lottie_value(Some(property)).as_ref(), 1)[0]
            },
        )]));
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
            "handleLottieGradientItem",
            Some(HashMap::from([(
                "modifier".to_string(),
                ImportDiagnosticDetailValue::String("dash".to_string()),
            )])),
        );
    }
    let state = Arc::new(GradientState {
        caps: map_lottie_line_cap(
            context
                .item
                .get("lc")
                .and_then(Value::as_i64)
                .map(|value| value as i32),
        ),
        count,
        dash,
        dash_offset,
        end: end.clone(),
        gradient_type: if context.item.get("t").and_then(Value::as_i64) == Some(2) {
            GradientType::Radial
        } else {
            GradientType::Linear
        },
        joints: map_lottie_line_join(
            context
                .item
                .get("lj")
                .and_then(Value::as_i64)
                .map(|value| value as i32),
        ),
        miter_limit: miter_limit.clone(),
        opacity: opacity.clone(),
        start: start.clone(),
        values: values.clone(),
        width: width.clone(),
        winding: if context.item.get("r").and_then(Value::as_i64) == Some(2) {
            PathWinding::EvenOdd
        } else {
            PathWinding::NonZero
        },
    });
    context.painters.write().unwrap().push(if stroke {
        gradient_stroke_painter(state)
    } else {
        gradient_fill_painter(state)
    });
    let identity: LottieNumericConverter = Arc::new(|value, _component| value);
    for (property, current) in [
        (gradient_property, &values),
        (context.item.get("e"), &end),
        (context.item.get("ml2"), &miter_limit),
        (context.item.get("o"), &opacity),
        (context.item.get("s"), &start),
        (context.item.get("w"), &width),
    ] {
        if let Some(property) = property {
            bind_mutable_lottie_numeric_property(
                property,
                current,
                &identity,
                &context.rerender,
                context.import,
            );
        }
    }
}

pub fn lottie_gradient_fill_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    handle_lottie_gradient_item(context, false);
}

pub fn lottie_gradient_stroke_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    handle_lottie_gradient_item(context, true);
}
