use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::contract::{Path, append_path_ellipse, create_path};
use serde_json::Value;

use crate::lottie_document::{
    bind_mutable_lottie_numeric_property, initial_lottie_value, lottie_numeric_json_value,
};
use crate::lottie_shape_geometry::apply_lottie_shape_direction;
use crate::types::{LottieNumericConverter, LottieRerender, LottieShapeItemContext};

// flight-lint: allow(f64) Flight path coordinates use the approved D1 f64 path lane
fn build_ellipse(
    position: &Arc<RwLock<Vec<f32>>>,
    size: &Arc<RwLock<Vec<f32>>>,
    direction: Option<i32>,
) -> Ref<Path> {
    let position = position.read().unwrap();
    let size = size.read().unwrap();
    let mut path = create_path(flight_path::PathWinding::NonZero);
    append_path_ellipse(
        &mut path,
        f64::from(position[0]),
        f64::from(position[1]),
        f64::from(size[0]) / 2.0,
        f64::from(size[1]) / 2.0,
    );
    return apply_lottie_shape_direction(Arc::new(RwLock::new(path)), direction);
}

pub fn lottie_ellipse_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    let position = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial_lottie_value(context.item.get("p")).as_ref(),
        2,
    )));
    let size = Arc::new(RwLock::new(lottie_numeric_json_value(
        initial_lottie_value(context.item.get("s")).as_ref(),
        2,
    )));
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
        .push(build_ellipse(&position, &size, direction));
    let paths = context.paths.clone();
    let rerender = context.rerender.clone();
    let rebuild_position = position.clone();
    let rebuild_size = size.clone();
    let rebuild: LottieRerender = Arc::new(move || {
        paths.write().unwrap()[path_index] =
            build_ellipse(&rebuild_position, &rebuild_size, direction);
        rerender();
    });
    let convert: LottieNumericConverter = Arc::new(|value, _component| value);
    if let Some(property) = context.item.get("p") {
        bind_mutable_lottie_numeric_property(
            property,
            &position,
            &convert,
            &rebuild,
            context.import,
        );
    }
    if let Some(property) = context.item.get("s") {
        bind_mutable_lottie_numeric_property(property, &size, &convert, &rebuild, context.import);
    }
}
