use flight_entity::Unknown;
use flight_path::{
    Path, append_path_cubic_curve_to, append_path_line_to, append_path_move_to, create_path,
};
use serde_json::Value;

use crate::types::LottieShapePath;

// flight-lint: allow(f64) flight-path stores path coordinates as f64 under the approved D1 path candidate
pub fn create_lottie_bezier_path(value: &LottieShapePath) -> Path {
    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    let count = value.v.len();
    if count == 0 {
        return path;
    }
    append_path_move_to(
        &mut path,
        f64::from(point_component(&value.v[0], 0)),
        f64::from(point_component(&value.v[0], 1)),
    );
    let limit = if value.c { count + 1 } else { count };
    for index in 1..limit {
        let previous = (index - 1) % count;
        let current = index % count;
        let start = &value.v[previous];
        let end = &value.v[current];
        let outgoing = value.o.get(previous);
        let incoming = value.i.get(current);
        let outgoing_x = outgoing.map_or(0.0, |point| point_component(point, 0));
        let outgoing_y = outgoing.map_or(0.0, |point| point_component(point, 1));
        let incoming_x = incoming.map_or(0.0, |point| point_component(point, 0));
        let incoming_y = incoming.map_or(0.0, |point| point_component(point, 1));
        let end_x = point_component(end, 0);
        let end_y = point_component(end, 1);
        if outgoing_x == 0.0 && outgoing_y == 0.0 && incoming_x == 0.0 && incoming_y == 0.0 {
            append_path_line_to(&mut path, f64::from(end_x), f64::from(end_y));
        } else {
            append_path_cubic_curve_to(
                &mut path,
                f64::from(point_component(start, 0) + outgoing_x),
                f64::from(point_component(start, 1) + outgoing_y),
                f64::from(end_x + incoming_x),
                f64::from(end_y + incoming_y),
                f64::from(end_x),
                f64::from(end_y),
            );
        }
    }
    return path;
}

// flight-lint: allow(conform-params) D24: caller-owned vector replaces the structured number-array return (user-approved)
pub fn flatten_lottie_shape_path(out: &mut Vec<f32>, path: &LottieShapePath) {
    out.clear();
    for points in [&path.v, &path.i, &path.o] {
        for point in points {
            out.push(point_component(point, 0));
            out.push(point_component(point, 1));
        }
    }
}

// flight-lint: allow(f64) serde_json exposes authored Lottie path numbers as f64 before the approved D1 f32 conversion
pub(crate) fn lottie_shape_path_from_json(value: Option<&Value>) -> Option<LottieShapePath> {
    let value = value?;
    let value = value
        .as_array()
        .and_then(|values| values.first())
        .unwrap_or(value);
    let value = value.as_object()?;
    let points = |key: &str| -> Vec<Vec<f32>> {
        return value
            .get(key)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|point| {
                let point = point.as_array()?;
                Some(vec![
                    point.first().and_then(Value::as_f64).unwrap_or(0.0) as f32,
                    point.get(1).and_then(Value::as_f64).unwrap_or(0.0) as f32,
                ])
            })
            .collect();
    };
    let vertices = points("v");
    if !value.contains_key("v") {
        return None;
    }
    return Some(LottieShapePath {
        c: value.get("c").and_then(Value::as_bool).unwrap_or(false),
        i: points("i"),
        o: points("o"),
        v: vertices,
    });
}

fn point_component(point: &[f32], component: usize) -> f32 {
    return point.get(component).copied().unwrap_or(0.0);
}

pub fn to_lottie_shape_path(value: &Unknown) -> Option<&LottieShapePath> {
    let value = value.as_ref()?;
    if let Some(path) = value.downcast_ref::<LottieShapePath>() {
        return Some(path);
    }
    if let Some(paths) = value.downcast_ref::<Vec<LottieShapePath>>() {
        return paths.first();
    }
    return None;
}

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f32] slice lane
pub fn unflatten_lottie_shape_path(template: &LottieShapePath, values: &[f32]) -> LottieShapePath {
    let count = template.v.len();
    let read_points = |offset: usize| -> Vec<Vec<f32>> {
        return (0..count)
            .map(|index| {
                vec![
                    values.get(offset + index * 2).copied().unwrap_or(0.0),
                    values.get(offset + index * 2 + 1).copied().unwrap_or(0.0),
                ]
            })
            .collect();
    };
    return LottieShapePath {
        c: template.c,
        i: read_points(count * 2),
        o: read_points(count * 4),
        v: read_points(0),
    };
}
