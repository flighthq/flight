use flight_node::contract::{NodeRef, add_node_child};
use flight_path::contract::{append_path_rectangle, create_path};
use flight_shape::contract::{
    append_shape_begin_fill, append_shape_end_fill, append_shape_path, create_shape,
};
use serde_json::Value;

use crate::types::LottieLayerContext;

// flight-lint: allow(f64) serde_json exposes authored Lottie dimensions as f64 before the Path lane consumes them
fn lottie_layer_number(value: Option<&Value>) -> f64 {
    return value.and_then(Value::as_f64).unwrap_or(0.0);
}

pub fn lottie_solid_layer_handler(context: &mut LottieLayerContext<'_, '_>) {
    let shape = create_shape();
    let color = context
        .layer
        .get("sc")
        .and_then(Value::as_str)
        .map(parse_hex_color)
        .unwrap_or(0x000000ff);
    append_shape_begin_fill(&shape, color, Some(1.0));

    let mut path = create_path(flight_path::PathWinding::NonZero);
    let width = lottie_layer_number(context.layer.get("sw"));
    let height = lottie_layer_number(context.layer.get("sh"));
    append_path_rectangle(&mut path, 0.0, 0.0, width, height);
    append_shape_path(&shape, &path.commands, &path.data, Some(path.winding));
    append_shape_end_fill(&shape);

    let parent: NodeRef = context.container.clone();
    let child: NodeRef = shape;
    add_node_child(&parent, &child);
}

fn parse_hex_color(value: &str) -> u32 {
    let digits = value.strip_prefix('#').unwrap_or(value);
    let parsed = u32::from_str_radix(digits, 16).unwrap_or(0);
    return ((parsed & 0x00ff_ffff) << 8) | 0xff;
}
