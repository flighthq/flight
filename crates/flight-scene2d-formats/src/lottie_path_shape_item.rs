use std::sync::{Arc, RwLock};

use serde_json::Value;

use crate::lottie_bezier_path::{
    create_lottie_bezier_path, flatten_lottie_shape_path, lottie_shape_path_from_json,
    unflatten_lottie_shape_path,
};
use crate::lottie_document::{initial_lottie_value, is_animated_lottie_property};
use crate::lottie_shape_geometry::apply_lottie_shape_direction;
use crate::lottie_shape_path_channels::append_lottie_shape_path_channels;
use crate::types::{LottieRerender, LottieShapeItemContext};

pub fn lottie_path_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    let Some(property) = context.item.get("ks") else {
        return;
    };
    let initial = initial_lottie_value(Some(property));
    let Some(template) = lottie_shape_path_from_json(initial.as_ref()) else {
        return;
    };
    let direction = context
        .item
        .get("d")
        .and_then(Value::as_i64)
        .map(|value| value as i32);
    let path_index = context.paths.read().unwrap().len();
    context
        .paths
        .write()
        .unwrap()
        .push(apply_lottie_shape_direction(
            Arc::new(RwLock::new(create_lottie_bezier_path(&template))),
            direction,
        ));
    if !is_animated_lottie_property(property) {
        return;
    }
    let current = Arc::new(RwLock::new(Vec::new()));
    flatten_lottie_shape_path(&mut current.write().unwrap(), &template);
    let paths = context.paths.clone();
    let rerender = context.rerender.clone();
    let apply_current = current.clone();
    let apply: LottieRerender = Arc::new(move || {
        let value = unflatten_lottie_shape_path(&template, &apply_current.read().unwrap());
        paths.write().unwrap()[path_index] = apply_lottie_shape_direction(
            Arc::new(RwLock::new(create_lottie_bezier_path(&value))),
            direction,
        );
        rerender();
    });
    if let Some(keyframes) = property.get("k").and_then(Value::as_array) {
        append_lottie_shape_path_channels(keyframes, &current, &apply, context.import);
    }
}
