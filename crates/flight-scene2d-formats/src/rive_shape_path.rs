// flight-lint: allow-file(f64) flight-path stores geometry as f64 under the approved D1 path candidate

use std::collections::HashMap;
use std::sync::Arc;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_math::CIRCLE_KAPPA;
use flight_path::{
    Path, append_path_close, append_path_cubic_curve_to, append_path_ellipse, append_path_line_to,
    append_path_move_to, append_path_polygon, append_path_rectangle, append_path_rounded_rectangle,
    create_path,
};
use flight_scene2d::Node2DRef;

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

struct RiveVertexPoint {
    corner: Option<[f64; 4]>,
    entry_x: f64,
    entry_y: f64,
    exit_x: f64,
    exit_y: f64,
    in_x: f64,
    in_y: f64,
    out_x: f64,
    out_y: f64,
    radius: f64,
    x: f64,
    y: f64,
}

// flight-lint: allow(fn-order) the public path dispatcher stays first and its private construction helpers follow in algorithm order
fn create_rive_parametric_path(
    source: &RiveCoreObject,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Path {
    let mut path = create_path(flight_path::PathWinding::NonZero);
    let width = read_rive_double(source, RIVE_PARAMETRIC_WIDTH, 0.0);
    let height = read_rive_double(source, RIVE_PARAMETRIC_HEIGHT, 0.0);
    let left = -read_rive_double(source, RIVE_PARAMETRIC_ORIGIN_X, 0.5) * width;
    let top = -read_rive_double(source, RIVE_PARAMETRIC_ORIGIN_Y, 0.5) * height;
    let type_key = i32::try_from(source.type_key).ok();
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_ELLIPSE)) {
        append_path_ellipse(
            &mut path,
            left + width / 2.0,
            top + height / 2.0,
            width / 2.0,
            height / 2.0,
        );
        return path;
    }
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_POLYGON)) {
        append_rive_polygon_path(&mut path, source, left, top, width, height);
        return path;
    }
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_TRIANGLE)) {
        append_path_polygon(
            &mut path,
            &[
                left + width / 2.0,
                top,
                left + width,
                top + height,
                left,
                top + height,
            ],
        );
        return path;
    }
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_RECTANGLE)) {
        append_rive_rectangle_path(&mut path, source, left, top, width, height);
        return path;
    }
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Recover,
        "rive.parametric-path-substituted",
        "createRiveParametricPath",
        Some(HashMap::from([
            (
                "substitutedAs".to_string(),
                ImportDiagnosticDetailValue::String("rectangle".to_string()),
            ),
            (
                "typeKey".to_string(),
                ImportDiagnosticDetailValue::Number(source.type_key as f32),
            ),
        ])),
    );
    append_path_rectangle(&mut path, left, top, width, height);
    return path;
}

pub fn create_rive_path(
    path: &RiveCoreObject,
    artboard: &RiveArtboardGraph,
    index: usize,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Path> {
    let type_key = i32::try_from(path.type_key).ok();
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_POINTS_COMMON_PATH)) {
        return Some(create_rive_points_path(path, artboard, index));
    }
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_PARAMETRIC_PATH)) {
        return Some(create_rive_parametric_path(path, diagnostics));
    }
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        "rive.path-kind-unsupported",
        "createRivePath",
        Some(HashMap::from([(
            "typeKey".to_string(),
            ImportDiagnosticDetailValue::Number(path.type_key as f32),
        )])),
    );
    return None;
}

fn create_rive_path_matrix(source: &RiveCoreObject) -> [f64; 6] {
    let rotation = read_rive_double(source, RIVE_ROTATION, 0.0);
    let scale_x = read_rive_double(source, RIVE_SCALE_X, 1.0);
    let scale_y = read_rive_double(source, RIVE_SCALE_Y, 1.0);
    let cosine = rotation.cos();
    let sine = rotation.sin();
    return [
        cosine * scale_x,
        sine * scale_x,
        -sine * scale_y,
        cosine * scale_y,
        read_rive_double(source, RIVE_X, read_rive_double(source, RIVE_X_LEGACY, 0.0)),
        read_rive_double(source, RIVE_Y, read_rive_double(source, RIVE_Y_LEGACY, 0.0)),
    ];
}

// flight-lint: allow(fn-order) the points-path builder stays adjacent to the dispatcher branch it implements before the public record wrapper
pub fn create_rive_path_record(
    artboard: &RiveArtboardGraph,
    index: usize,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<RivePathRecord> {
    let source = artboard.objects.get(index)?;
    let path = create_rive_path(source, artboard, index, diagnostics)?;
    if path.commands.is_empty() {
        return None;
    }
    let local = create_rive_path_matrix(source);
    let mut data = path.data;
    for point in data.chunks_exact_mut(2) {
        let x = point[0];
        let y = point[1];
        point[0] = local[0] * x + local[2] * y + local[4];
        point[1] = local[1] * x + local[3] * y + local[5];
    }
    return Some(RivePathRecord {
        commands: path.commands,
        data: data.into_iter().map(|value| value as f32).collect(),
        path_index: index,
        winding: path.winding,
    });
}

fn create_rive_points_path(
    source: &RiveCoreObject,
    artboard: &RiveArtboardGraph,
    index: usize,
) -> Path {
    let mut vertices = collect_rive_vertices(artboard, index);
    let mut path = create_path(flight_path::PathWinding::NonZero);
    if vertices.is_empty() {
        return path;
    }
    let closed = read_rive_flag(source, RIVE_IS_CLOSED, false);
    apply_rive_corner_rounding(&mut vertices, closed);
    append_path_move_to(&mut path, vertices[0].entry_x, vertices[0].entry_y);
    append_rive_corner(&mut path, &vertices[0]);
    let limit = if closed {
        vertices.len()
    } else {
        vertices.len() - 1
    };
    for step in 0..limit {
        let from = &vertices[step];
        let to = &vertices[(step + 1) % vertices.len()];
        if from.out_x == from.exit_x
            && from.out_y == from.exit_y
            && to.in_x == to.entry_x
            && to.in_y == to.entry_y
        {
            append_path_line_to(&mut path, to.entry_x, to.entry_y);
        } else {
            append_path_cubic_curve_to(
                &mut path, from.out_x, from.out_y, to.in_x, to.in_y, to.entry_x, to.entry_y,
            );
        }
        append_rive_corner(&mut path, to);
    }
    if closed {
        append_path_close(&mut path);
    }
    return path;
}

fn create_rive_vertex_point(source: &RiveCoreObject) -> RiveVertexPoint {
    let x = read_rive_double(source, RIVE_VERTEX_X, 0.0);
    let y = read_rive_double(source, RIVE_VERTEX_Y, 0.0);
    let type_key = i32::try_from(source.type_key).ok();
    let mut point = RiveVertexPoint {
        corner: None,
        entry_x: x,
        entry_y: y,
        exit_x: x,
        exit_y: y,
        in_x: x,
        in_y: y,
        out_x: x,
        out_y: y,
        radius: if type_key
            .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_STRAIGHT_VERTEX))
        {
            read_rive_double(source, RIVE_VERTEX_RADIUS, 0.0)
        } else {
            0.0
        },
        x,
        y,
    };
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_CUBIC_DETACHED_VERTEX)) {
        let in_rotation = read_rive_double(source, RIVE_IN_ROTATION, 0.0);
        let in_distance = read_rive_double(source, RIVE_IN_DISTANCE, 0.0);
        let out_rotation = read_rive_double(source, RIVE_OUT_ROTATION, 0.0);
        let out_distance = read_rive_double(source, RIVE_OUT_DISTANCE, 0.0);
        point.in_x = x + in_rotation.cos() * in_distance;
        point.in_y = y + in_rotation.sin() * in_distance;
        point.out_x = x + out_rotation.cos() * out_distance;
        point.out_y = y + out_rotation.sin() * out_distance;
        return point;
    }
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_CUBIC_MIRRORED_VERTEX)) {
        let rotation = read_rive_double(source, RIVE_MIRRORED_ROTATION, 0.0);
        let distance = read_rive_double(source, RIVE_MIRRORED_DISTANCE, 0.0);
        return apply_rive_collinear_handles(point, rotation, distance, distance);
    }
    if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_CUBIC_ASYMMETRIC_VERTEX))
    {
        return apply_rive_collinear_handles(
            point,
            read_rive_double(source, RIVE_ASYMMETRIC_ROTATION, 0.0),
            read_rive_double(source, RIVE_ASYMMETRIC_IN_DISTANCE, 0.0),
            read_rive_double(source, RIVE_ASYMMETRIC_OUT_DISTANCE, 0.0),
        );
    }
    return point;
}

fn append_rive_corner(path: &mut Path, vertex: &RiveVertexPoint) {
    let Some(corner) = vertex.corner else {
        return;
    };
    append_path_cubic_curve_to(
        path,
        corner[0],
        corner[1],
        corner[2],
        corner[3],
        vertex.exit_x,
        vertex.exit_y,
    );
}

fn append_rive_per_corner_rectangle(
    path: &mut Path,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    radii: [f64; 4],
) {
    let limit = width.min(height) / 2.0;
    let [top_left, top_right, bottom_left, bottom_right] =
        radii.map(|radius| radius.max(0.0).min(limit));
    let right = left + width;
    let bottom = top + height;
    let kappa = f64::from(CIRCLE_KAPPA);
    append_path_move_to(path, left + top_left, top);
    append_path_line_to(path, right - top_right, top);
    if top_right > 0.0 {
        append_path_cubic_curve_to(
            path,
            right - top_right + top_right * kappa,
            top,
            right,
            top + top_right - top_right * kappa,
            right,
            top + top_right,
        );
    }
    append_path_line_to(path, right, bottom - bottom_right);
    if bottom_right > 0.0 {
        append_path_cubic_curve_to(
            path,
            right,
            bottom - bottom_right + bottom_right * kappa,
            right - bottom_right + bottom_right * kappa,
            bottom,
            right - bottom_right,
            bottom,
        );
    }
    append_path_line_to(path, left + bottom_left, bottom);
    if bottom_left > 0.0 {
        append_path_cubic_curve_to(
            path,
            left + bottom_left - bottom_left * kappa,
            bottom,
            left,
            bottom - bottom_left + bottom_left * kappa,
            left,
            bottom - bottom_left,
        );
    }
    append_path_line_to(path, left, top + top_left);
    if top_left > 0.0 {
        append_path_cubic_curve_to(
            path,
            left,
            top + top_left - top_left * kappa,
            left + top_left - top_left * kappa,
            top,
            left + top_left,
            top,
        );
    }
    append_path_close(path);
}

fn append_rive_polygon_path(
    path: &mut Path,
    source: &RiveCoreObject,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
) {
    let points = read_rive_double(source, RIVE_POLYGON_POINTS, 5.0)
        .round()
        .max(3.0) as usize;
    let star = i32::try_from(source.type_key)
        .ok()
        .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_STAR));
    let inner_ratio = if star {
        read_rive_double(source, RIVE_STAR_INNER_RADIUS, 0.5)
    } else {
        1.0
    };
    let center_x = left + width / 2.0;
    let center_y = top + height / 2.0;
    let count = if star { points * 2 } else { points };
    let mut vertices = Vec::with_capacity(count * 2);
    for index in 0..count {
        let angle =
            -std::f64::consts::FRAC_PI_2 + index as f64 * std::f64::consts::TAU / count as f64;
        let ratio = if star && index % 2 == 1 {
            inner_ratio
        } else {
            1.0
        };
        vertices.push(center_x + angle.cos() * width / 2.0 * ratio);
        vertices.push(center_y + angle.sin() * height / 2.0 * ratio);
    }
    append_path_polygon(path, &vertices);
}

fn append_rive_rectangle_path(
    path: &mut Path,
    source: &RiveCoreObject,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
) {
    let linked = read_rive_flag(source, RIVE_LINK_CORNER_RADIUS, true);
    let top_left = read_rive_double(source, RIVE_CORNER_RADIUS_TL, 0.0);
    let radii = if linked {
        [top_left; 4]
    } else {
        [
            top_left,
            read_rive_double(source, RIVE_CORNER_RADIUS_TR, 0.0),
            read_rive_double(source, RIVE_CORNER_RADIUS_BL, 0.0),
            read_rive_double(source, RIVE_CORNER_RADIUS_BR, 0.0),
        ]
    };
    let uniform = radii.iter().all(|radius| *radius == radii[0]);
    if uniform && radii[0] > 0.0 {
        append_path_rounded_rectangle(path, left, top, width, height, radii[0]);
    } else if uniform {
        append_path_rectangle(path, left, top, width, height);
    } else {
        append_rive_per_corner_rectangle(path, left, top, width, height, radii);
    }
}

fn apply_rive_collinear_handles(
    mut point: RiveVertexPoint,
    rotation: f64,
    in_distance: f64,
    out_distance: f64,
) -> RiveVertexPoint {
    let cosine = rotation.cos();
    let sine = rotation.sin();
    point.in_x = point.x - cosine * in_distance;
    point.in_y = point.y - sine * in_distance;
    point.out_x = point.x + cosine * out_distance;
    point.out_y = point.y + sine * out_distance;
    return point;
}

fn apply_rive_corner_rounding(vertices: &mut [RiveVertexPoint], closed: bool) {
    let count = vertices.len();
    for index in 0..count {
        let previous_index = (index + count - 1) % count;
        let next_index = (index + 1) % count;
        if vertices[index].radius == 0.0 || (!closed && (index == 0 || index + 1 == count)) {
            continue;
        }
        let mut to_previous_x = vertices[previous_index].out_x - vertices[index].x;
        let mut to_previous_y = vertices[previous_index].out_y - vertices[index].y;
        let mut to_next_x = vertices[next_index].in_x - vertices[index].x;
        let mut to_next_y = vertices[next_index].in_y - vertices[index].y;
        let previous_length = to_previous_x.hypot(to_previous_y);
        let next_length = to_next_x.hypot(to_next_y);
        if previous_length == 0.0 || next_length == 0.0 {
            continue;
        }
        to_previous_x /= previous_length;
        to_previous_y /= previous_length;
        to_next_x /= next_length;
        to_next_y /= next_length;
        let vertex = &mut vertices[index];
        let inverted = vertex.radius < 0.0;
        let radius = (previous_length / 2.0)
            .min(next_length / 2.0)
            .min(vertex.radius.abs());
        let angle = (to_previous_x * to_next_y - to_previous_y * to_next_x)
            .atan2(to_previous_x * to_next_x + to_previous_y * to_next_y)
            .abs();
        let spread = if angle < std::f64::consts::FRAC_PI_2 {
            1.0 + angle.cos()
        } else {
            2.0 - angle.sin()
        };
        let ideal = radius.min(4.0 / 3.0 * (angle / 4.0).tan() * radius * spread);
        vertex.entry_x = vertex.x + to_previous_x * radius;
        vertex.entry_y = vertex.y + to_previous_y * radius;
        vertex.exit_x = vertex.x + to_next_x * radius;
        vertex.exit_y = vertex.y + to_next_y * radius;
        vertex.in_x = vertex.entry_x;
        vertex.in_y = vertex.entry_y;
        vertex.out_x = vertex.exit_x;
        vertex.out_y = vertex.exit_y;
        vertex.corner = Some(if inverted {
            [
                vertex.entry_x + to_next_x * ideal,
                vertex.entry_y + to_next_y * ideal,
                vertex.exit_x + to_previous_x * ideal,
                vertex.exit_y + to_previous_y * ideal,
            ]
        } else {
            [
                vertex.x + to_previous_x * (radius - ideal),
                vertex.y + to_previous_y * (radius - ideal),
                vertex.x + to_next_x * (radius - ideal),
                vertex.y + to_next_y * (radius - ideal),
            ]
        });
    }
}

fn collect_rive_vertices(artboard: &RiveArtboardGraph, path_index: usize) -> Vec<RiveVertexPoint> {
    let mut points = Vec::new();
    for index in path_index + 1..artboard.objects.len() {
        if artboard.parent_indices.get(index).copied() != Some(path_index as i32) {
            continue;
        }
        let object = &artboard.objects[index];
        if i32::try_from(object.type_key)
            .ok()
            .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_PATH_VERTEX))
        {
            points.push(create_rive_vertex_point(object));
        }
    }
    return points;
}

fn find_rive_shape_owner(artboard: &RiveArtboardGraph, index: usize) -> i32 {
    let mut parent = artboard.parent_indices.get(index).copied().unwrap_or(-1);
    while parent > 0 {
        let Some(object) = artboard.objects.get(parent as usize) else {
            return -1;
        };
        if i32::try_from(object.type_key)
            .ok()
            .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_SHAPE))
        {
            return parent;
        }
        parent = artboard
            .parent_indices
            .get(parent as usize)
            .copied()
            .unwrap_or(-1);
    }
    return -1;
}

pub fn import_rive_path_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let owner = find_rive_shape_owner(context.artboard, index);
    if owner < 0 {
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "rive.path-outside-shape",
            "importRivePathComponent",
            Some(HashMap::from([(
                "index".to_string(),
                ImportDiagnosticDetailValue::Number(index as f32),
            )])),
        );
        return None;
    }
    let record =
        create_rive_path_record(context.artboard, index, context.diagnostics.as_deref_mut())?;
    context
        .shape_paths
        .entry(owner as usize)
        .or_default()
        .push(record);
    return None;
}

fn read_rive_double(source: &RiveCoreObject, key: u64, fallback: f64) -> f64 {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or(fallback, |property| match property.value {
            RiveValue::Uint(value) => value as f64,
            RiveValue::Double(value) => f64::from(value),
            RiveValue::Color(value) => f64::from(value),
            _ => fallback,
        });
}

fn read_rive_flag(source: &RiveCoreObject, key: u64, fallback: bool) -> bool {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or(fallback, |property| match property.value {
            RiveValue::Uint(value) => value != 0,
            RiveValue::Double(value) => value != 0.0,
            RiveValue::Color(value) => value != 0,
            _ => fallback,
        });
}

pub fn register_rive_path_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_PATH,
        Arc::new(RiveCoreObjectHandler {
            import_component: Some(Arc::new(import_rive_path_component)),
            ..RiveCoreObjectHandler::default()
        }),
    );
    register_rive_core_object_handler(
        registry,
        RIVE_PATH_VERTEX,
        Arc::new(RiveCoreObjectHandler {
            import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
            ..RiveCoreObjectHandler::default()
        }),
    );
}

const RIVE_SHAPE: i32 = 3;
const RIVE_PATH: i32 = 12;
const RIVE_PATH_VERTEX: i32 = 14;
const RIVE_STRAIGHT_VERTEX: i32 = 5;
const RIVE_POINTS_COMMON_PATH: i32 = 620;
const RIVE_PARAMETRIC_PATH: i32 = 15;
const RIVE_RECTANGLE: i32 = 7;
const RIVE_ELLIPSE: i32 = 4;
const RIVE_TRIANGLE: i32 = 8;
const RIVE_POLYGON: i32 = 51;
const RIVE_STAR: i32 = 52;
const RIVE_CUBIC_DETACHED_VERTEX: i32 = 6;
const RIVE_CUBIC_MIRRORED_VERTEX: i32 = 35;
const RIVE_CUBIC_ASYMMETRIC_VERTEX: i32 = 34;

const RIVE_X_LEGACY: u64 = 9;
const RIVE_Y_LEGACY: u64 = 10;
const RIVE_X: u64 = 13;
const RIVE_Y: u64 = 14;
const RIVE_ROTATION: u64 = 15;
const RIVE_SCALE_X: u64 = 16;
const RIVE_SCALE_Y: u64 = 17;
const RIVE_PARAMETRIC_WIDTH: u64 = 20;
const RIVE_PARAMETRIC_HEIGHT: u64 = 21;
const RIVE_VERTEX_X: u64 = 24;
const RIVE_VERTEX_Y: u64 = 25;
const RIVE_IS_CLOSED: u64 = 32;
const RIVE_VERTEX_RADIUS: u64 = 26;
const RIVE_CORNER_RADIUS_TL: u64 = 31;
const RIVE_ASYMMETRIC_ROTATION: u64 = 79;
const RIVE_ASYMMETRIC_IN_DISTANCE: u64 = 80;
const RIVE_ASYMMETRIC_OUT_DISTANCE: u64 = 81;
const RIVE_MIRRORED_ROTATION: u64 = 82;
const RIVE_MIRRORED_DISTANCE: u64 = 83;
const RIVE_IN_ROTATION: u64 = 84;
const RIVE_IN_DISTANCE: u64 = 85;
const RIVE_OUT_ROTATION: u64 = 86;
const RIVE_OUT_DISTANCE: u64 = 87;
const RIVE_PARAMETRIC_ORIGIN_X: u64 = 123;
const RIVE_PARAMETRIC_ORIGIN_Y: u64 = 124;
const RIVE_POLYGON_POINTS: u64 = 125;
const RIVE_STAR_INNER_RADIUS: u64 = 127;
const RIVE_CORNER_RADIUS_TR: u64 = 161;
const RIVE_CORNER_RADIUS_BL: u64 = 162;
const RIVE_CORNER_RADIUS_BR: u64 = 163;
const RIVE_LINK_CORNER_RADIUS: u64 = 164;
