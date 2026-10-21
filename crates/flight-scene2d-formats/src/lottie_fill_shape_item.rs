use std::sync::{Arc, RwLock};

use flight_path::contract::PathWinding;
use flight_shape::contract::{append_shape_begin_fill, append_shape_end_fill};

use crate::lottie_document::{
    bind_mutable_lottie_numeric_property, initial_lottie_value, lottie_numeric_json_value,
    lottie_rgba,
};
use crate::lottie_shape_paint::append_lottie_shape_paths;
use crate::types::{LottieNumericConverter, LottieShapeItemContext, LottieShapePainter};

// flight-lint: allow(f64) shape command alpha values use the approved D1 f64 command lane
pub fn lottie_fill_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    let color = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial_lottie_value(context.item.get("c")).as_ref(),
        3,
    )));
    let opacity = Arc::new(RwLock::new(vec![
        lottie_numeric_json_value(initial_lottie_value(context.item.get("o")).as_ref(), 1)[0]
            / 100.0,
    ]));
    let winding = if context.item.get("r").and_then(serde_json::Value::as_i64) == Some(2) {
        PathWinding::EvenOdd
    } else {
        PathWinding::NonZero
    };
    let paint_color = color.clone();
    let paint_opacity = opacity.clone();
    let painter: LottieShapePainter = Arc::new(move |shape, paths| {
        let color = paint_color.read().unwrap();
        let opacity = paint_opacity.read().unwrap()[0];
        append_shape_begin_fill(shape, lottie_rgba(&color), Some(f64::from(opacity)));
        append_lottie_shape_paths(paths, shape, Some(winding));
        append_shape_end_fill(shape);
    });
    context.painters.write().unwrap().push(painter);
    let identity: LottieNumericConverter = Arc::new(|value, _component| value);
    if let Some(property) = context.item.get("c") {
        bind_mutable_lottie_numeric_property(
            property,
            &color,
            &identity,
            &context.rerender,
            context.import,
        );
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
}
