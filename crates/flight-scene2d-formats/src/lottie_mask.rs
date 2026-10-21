use std::sync::{Arc, RwLock};

use flight_clip::contract::create_clip_region_from_path;
use serde_json::Value;

use crate::lottie_bezier_path::{
    create_lottie_bezier_path, flatten_lottie_shape_path, lottie_shape_path_from_json,
    unflatten_lottie_shape_path,
};
use crate::lottie_document::{initial_lottie_value, is_animated_lottie_property};
use crate::lottie_shape_path_channels::append_lottie_shape_path_channels;
use crate::types::{LottieMaskContext, LottieRerender};

pub fn lottie_additive_mask_handler(context: &mut LottieMaskContext<'_, '_>) {
    let Some(first) = context.masks.first() else {
        return;
    };
    if first.get("mode").and_then(Value::as_str) != Some("a")
        || first.get("inv").and_then(Value::as_bool) == Some(true)
        || context.masks.len() > 1
    {
        return;
    }
    let Some(property) = first.get("pt") else {
        return;
    };
    let initial = initial_lottie_value(Some(property));
    let Some(template) = lottie_shape_path_from_json(initial.as_ref()) else {
        return;
    };
    let path = create_lottie_bezier_path(&template);
    context.target.write().unwrap().node2d_fields_mut().clip =
        Some(create_clip_region_from_path(&path, None));
    if !is_animated_lottie_property(property) {
        return;
    }
    let current = Arc::new(RwLock::new(Vec::new()));
    flatten_lottie_shape_path(&mut current.write().unwrap(), &template);
    let target = context.target.clone();
    let apply_current = current.clone();
    let apply: LottieRerender = Arc::new(move || {
        let value = unflatten_lottie_shape_path(&template, &apply_current.read().unwrap());
        let path = create_lottie_bezier_path(&value);
        target.write().unwrap().node2d_fields_mut().clip =
            Some(create_clip_region_from_path(&path, None));
    });
    if let Some(keyframes) = property.get("k").and_then(Value::as_array) {
        append_lottie_shape_path_channels(keyframes, &current, &apply, context.import);
    }
}
