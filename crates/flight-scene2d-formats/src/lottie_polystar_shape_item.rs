use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::contract::{
    Path, append_path_cubic_curve_to, append_path_move_to, append_path_polygon, create_path,
};
use serde_json::Value;

use crate::lottie_document::{
    bind_mutable_lottie_numeric_property, initial_lottie_value, lottie_numeric_json_value,
};
use crate::lottie_shape_geometry::apply_lottie_shape_direction;
use crate::types::{LottieNumericConverter, LottieRerender, LottieShapeItemContext};

// flight-lint: allow(f64) polystar trigonometry produces coordinates in the approved D1 f64 path lane
fn create_lottie_polystar_path(
    kind: i32,
    center: &[f32],
    point_count: f32,
    outer: f32,
    inner: f32,
    rotation_degrees: f32,
    outer_roundness: f32,
    inner_roundness: f32,
) -> Ref<Path> {
    let mut path = create_path(flight_path::PathWinding::NonZero);
    let points = point_count.round().max(2.0) as usize;
    let rotation = f64::from(rotation_degrees - 90.0).to_radians();
    let count = if kind == 1 { points * 2 } else { points };
    let step = std::f64::consts::TAU / count as f64;
    let handle_scale = (4.0 / 3.0) * (step / 4.0).tan();
    let mut angles = Vec::with_capacity(count);
    let mut handles = Vec::with_capacity(count);
    let mut vertices = Vec::with_capacity(count * 2);
    for index in 0..count {
        let is_inner = kind == 1 && index % 2 == 1;
        let radius = f64::from(if is_inner { inner } else { outer });
        let roundness = f64::from(if is_inner {
            inner_roundness
        } else {
            outer_roundness
        });
        let angle = rotation + index as f64 * step;
        angles.push(angle);
        handles.push(radius * handle_scale * roundness / 100.0);
        vertices.push(f64::from(center[0]) + angle.cos() * radius);
        vertices.push(f64::from(center[1]) + angle.sin() * radius);
    }
    if handles.iter().all(|handle| *handle == 0.0) {
        append_path_polygon(&mut path, &vertices);
        return Arc::new(RwLock::new(path));
    }
    append_path_move_to(&mut path, vertices[0], vertices[1]);
    for index in 0..count {
        let next = (index + 1) % count;
        let outgoing_x = vertices[index * 2] - angles[index].sin() * handles[index];
        let outgoing_y = vertices[index * 2 + 1] + angles[index].cos() * handles[index];
        let incoming_x = vertices[next * 2] + angles[next].sin() * handles[next];
        let incoming_y = vertices[next * 2 + 1] - angles[next].cos() * handles[next];
        append_path_cubic_curve_to(
            &mut path,
            outgoing_x,
            outgoing_y,
            incoming_x,
            incoming_y,
            vertices[next * 2],
            vertices[next * 2 + 1],
        );
    }
    return Arc::new(RwLock::new(path));
}

pub fn lottie_polystar_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    let numeric = |key: &str, components: usize| {
        return Arc::new(RwLock::new(lottie_numeric_json_value(
            initial_lottie_value(context.item.get(key)).as_ref(),
            components,
        )));
    };
    let center = numeric("p", 2);
    let points = numeric("pt", 1);
    let outer = numeric("or", 1);
    let kind = context.item.get("sy").and_then(Value::as_i64).unwrap_or(2) as i32;
    let inner = if kind == 1 {
        numeric("ir", 1)
    } else {
        Arc::new(RwLock::new(vec![outer.read().unwrap()[0]]))
    };
    let rotation = numeric("r", 1);
    let outer_roundness = if context.item.contains_key("os") {
        numeric("os", 1)
    } else {
        Arc::new(RwLock::new(vec![0.0]))
    };
    let inner_roundness = if kind == 1 && context.item.contains_key("is") {
        numeric("is", 1)
    } else {
        Arc::new(RwLock::new(vec![0.0]))
    };
    let direction = context
        .item
        .get("d")
        .and_then(Value::as_i64)
        .map(|value| value as i32);
    let build = |center: &Arc<RwLock<Vec<f32>>>,
                 points: &Arc<RwLock<Vec<f32>>>,
                 outer: &Arc<RwLock<Vec<f32>>>,
                 inner: &Arc<RwLock<Vec<f32>>>,
                 rotation: &Arc<RwLock<Vec<f32>>>,
                 outer_roundness: &Arc<RwLock<Vec<f32>>>,
                 inner_roundness: &Arc<RwLock<Vec<f32>>>| {
        let path = create_lottie_polystar_path(
            kind,
            &center.read().unwrap(),
            points.read().unwrap()[0],
            outer.read().unwrap()[0],
            inner.read().unwrap()[0],
            rotation.read().unwrap()[0],
            outer_roundness.read().unwrap()[0],
            inner_roundness.read().unwrap()[0],
        );
        return apply_lottie_shape_direction(path, direction);
    };
    let path_index = context.paths.read().unwrap().len();
    context.paths.write().unwrap().push(build(
        &center,
        &points,
        &outer,
        &inner,
        &rotation,
        &outer_roundness,
        &inner_roundness,
    ));
    let paths = context.paths.clone();
    let rerender = context.rerender.clone();
    let rebuild_center = center.clone();
    let rebuild_points = points.clone();
    let rebuild_outer = outer.clone();
    let rebuild_inner = inner.clone();
    let rebuild_rotation = rotation.clone();
    let rebuild_outer_roundness = outer_roundness.clone();
    let rebuild_inner_roundness = inner_roundness.clone();
    let rebuild: LottieRerender = Arc::new(move || {
        paths.write().unwrap()[path_index] = apply_lottie_shape_direction(
            create_lottie_polystar_path(
                kind,
                &rebuild_center.read().unwrap(),
                rebuild_points.read().unwrap()[0],
                rebuild_outer.read().unwrap()[0],
                rebuild_inner.read().unwrap()[0],
                rebuild_rotation.read().unwrap()[0],
                rebuild_outer_roundness.read().unwrap()[0],
                rebuild_inner_roundness.read().unwrap()[0],
            ),
            direction,
        );
        rerender();
    });
    let convert: LottieNumericConverter = Arc::new(|value, _component| value);
    for (key, current) in [
        ("ir", &inner),
        ("is", &inner_roundness),
        ("or", &outer),
        ("os", &outer_roundness),
        ("p", &center),
        ("pt", &points),
        ("r", &rotation),
    ] {
        if let Some(property) = context.item.get(key) {
            bind_mutable_lottie_numeric_property(
                property,
                current,
                &convert,
                &rebuild,
                context.import,
            );
        }
    }
}
