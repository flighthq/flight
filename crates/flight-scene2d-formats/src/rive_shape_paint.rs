// flight-lint: allow-file(f64) Flight path geometry, lengths, and shape command numbers use the approved D1 f64 lane

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::{Matrix, create_gradient_transform_matrix};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_path::{
    Path, PathCommand, PathWinding, create_path, dash_path, flatten_path, get_path_length,
};
use flight_shape::contract::{
    CapsStyle, GradientType, JointStyle, LineScaleMode, Shape, append_shape_begin_fill,
    append_shape_begin_gradient_fill, append_shape_end_fill, append_shape_line_gradient_style,
    append_shape_line_style, append_shape_path,
};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

#[derive(Clone)]
struct RiveGradientPaint {
    alphas: Vec<f64>,
    colors: Vec<u32>,
    end_x: f32,
    end_y: f32,
    radial: bool,
    ratios: Vec<f64>,
    start_x: f32,
    start_y: f32,
}

#[derive(Clone, Copy)]
struct RiveTrim {
    end: f64,
    offset: f64,
    sequential: bool,
    start: f64,
}

#[derive(Clone, Copy)]
struct RiveDashLength {
    percentage: bool,
    value: f64,
}

#[derive(Clone)]
struct RiveDash {
    lengths: Vec<RiveDashLength>,
    offset: RiveDashLength,
}

#[derive(Clone)]
enum RiveStrokeEffect {
    Dash(RiveDash),
    Trim(RiveTrim),
}

#[derive(Clone, Copy)]
struct RiveStroke {
    caps: CapsStyle,
    joints: JointStyle,
    thickness: f64,
}

struct RivePaint {
    alpha: f64,
    color: u32,
    effects: Vec<RiveStrokeEffect>,
    fill_rule: PathWinding,
    gradient: Option<RiveGradientPaint>,
    stroke: Option<RiveStroke>,
    visible: bool,
}

fn create_rive_gradient(
    source: &RiveCoreObject,
    artboard: &RiveArtboardGraph,
    index: usize,
) -> RiveGradientPaint {
    let opacity = read_rive_number(source, RIVE_GRADIENT_OPACITY, 1.0);
    let mut gradient = RiveGradientPaint {
        alphas: Vec::new(),
        colors: Vec::new(),
        end_x: read_rive_number(source, RIVE_GRADIENT_END_X, 0.0) as f32,
        end_y: read_rive_number(source, RIVE_GRADIENT_END_Y, 0.0) as f32,
        radial: i32::try_from(source.type_key)
            .ok()
            .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_RADIAL_GRADIENT)),
        ratios: Vec::new(),
        start_x: read_rive_number(source, RIVE_GRADIENT_START_X, 0.0) as f32,
        start_y: read_rive_number(source, RIVE_GRADIENT_START_Y, 0.0) as f32,
    };
    for stop in index + 1..artboard.objects.len() {
        if artboard.parent_indices.get(stop).copied() != Some(index as i32) {
            continue;
        }
        let object = &artboard.objects[stop];
        if !i32::try_from(object.type_key)
            .ok()
            .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_GRADIENT_STOP))
        {
            continue;
        }
        let packed = read_rive_u32(object, RIVE_GRADIENT_STOP_COLOR, RIVE_DEFAULT_STOP_COLOR);
        gradient.colors.push(((packed & 0x00ffffff) << 8) | 0xff);
        gradient
            .alphas
            .push(f64::from((packed >> 24) & 0xff) / 255.0 * opacity);
        gradient.ratios.push(
            (clamp_rive_unit(read_rive_number(object, RIVE_GRADIENT_STOP_POSITION, 0.0)) * 255.0)
                .round(),
        );
    }
    return gradient;
}

fn create_rive_gradient_matrix(gradient: &RiveGradientPaint) -> Matrix {
    let dx = gradient.end_x - gradient.start_x;
    let dy = gradient.end_y - gradient.start_y;
    let span = dx.hypot(dy) * 2.0;
    return create_gradient_transform_matrix(
        span,
        span,
        dy.atan2(dx),
        gradient.start_x,
        gradient.start_y,
    );
}

fn create_rive_paint(
    source: &RiveCoreObject,
    artboard: &RiveArtboardGraph,
    index: usize,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RivePaint {
    let is_stroke = i32::try_from(source.type_key)
        .ok()
        .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_STROKE));
    let stroke = is_stroke.then(|| RiveStroke {
        caps: to_rive_caps(
            read_rive_number(source, RIVE_STROKE_CAP, 0.0),
            diagnostics.as_deref_mut(),
        ),
        joints: to_rive_joints(
            read_rive_number(source, RIVE_STROKE_JOIN, 0.0),
            diagnostics.as_deref_mut(),
        ),
        thickness: read_rive_number(source, RIVE_STROKE_THICKNESS, 1.0),
    });
    let mut paint = RivePaint {
        alpha: 1.0,
        color: 0x000000ff,
        effects: if stroke.is_some() {
            read_rive_stroke_effects(artboard, index)
        } else {
            Vec::new()
        },
        fill_rule: if read_rive_number(source, RIVE_FILL_RULE, 0.0) == 1.0 {
            PathWinding::EvenOdd
        } else {
            PathWinding::NonZero
        },
        gradient: None,
        stroke,
        visible: read_rive_flag(source, RIVE_PAINT_IS_VISIBLE, true),
    };
    apply_rive_paint_mutator(&mut paint, artboard, index);
    return paint;
}

fn append_rive_dash_contour(
    contour: &[f64],
    dash: &RiveDash,
    commands: &mut Vec<u8>,
    data: &mut Vec<f64>,
) {
    let length = get_rive_polyline_length(contour);
    if length <= 0.0 || dash.lengths.is_empty() {
        return;
    }
    let pattern = dash
        .lengths
        .iter()
        .map(|entry| to_rive_dash_length(*entry, length).max(0.0).min(length))
        .collect::<Vec<_>>();
    if !pattern.iter().any(|value| *value > 0.0) {
        return;
    }
    let mut distance = wrap_rive_dash_offset(to_rive_dash_length(dash.offset, length), length);
    let mut travelled = 0.0;
    let mut index = 0;
    let mut draw = true;
    let mut zero_run = 0;
    let closed = contour.len() >= 4
        && contour[0] == contour[contour.len() - 2]
        && contour[1] == contour[contour.len() - 1];
    while travelled < length {
        let amount = pattern[index % pattern.len()];
        index += 1;
        if amount <= 0.0 {
            zero_run += 1;
            draw = !draw;
            if zero_run >= pattern.len() {
                return;
            }
            continue;
        }
        zero_run = 0;
        let end = distance + amount;
        if draw {
            if end <= length {
                append_rive_dash_interval(contour, distance, end, true, commands, data);
            } else {
                append_rive_dash_interval(contour, distance, length, true, commands, data);
                append_rive_dash_interval(contour, 0.0, end - length, !closed, commands, data);
            }
        }
        distance = if end >= length { end - length } else { end };
        travelled += amount;
        draw = !draw;
    }
}

fn append_rive_dash_interval(
    contour: &[f64],
    from: f64,
    to: f64,
    should_move: bool,
    commands: &mut Vec<u8>,
    data: &mut Vec<f64>,
) {
    if to <= from {
        return;
    }
    let mut travelled = 0.0;
    let mut started = false;
    for point in contour.windows(4).step_by(2) {
        let [x0, y0, x1, y1] = [point[0], point[1], point[2], point[3]];
        let segment = (x1 - x0).hypot(y1 - y0);
        let segment_end = travelled + segment;
        if segment > 0.0 && to > travelled && from < segment_end {
            let local_from = from.max(travelled);
            let local_to = to.min(segment_end);
            let start_ratio = (local_from - travelled) / segment;
            let end_ratio = (local_to - travelled) / segment;
            let start_x = x0 + (x1 - x0) * start_ratio;
            let start_y = y0 + (y1 - y0) * start_ratio;
            if !started {
                let differs = data.len() < 2
                    || data[data.len() - 2] != start_x
                    || data[data.len() - 1] != start_y;
                if should_move {
                    commands.push(PathCommand::MOVE_TO as u8);
                } else if differs {
                    commands.push(PathCommand::LINE_TO as u8);
                }
                if should_move || differs {
                    data.extend([start_x, start_y]);
                }
                started = true;
            }
            commands.push(PathCommand::LINE_TO as u8);
            data.extend([x0 + (x1 - x0) * end_ratio, y0 + (y1 - y0) * end_ratio]);
        }
        travelled = segment_end;
        if travelled >= to {
            break;
        }
    }
}

fn append_rive_fill_style(shape: &Ref<Shape>, paint: &RivePaint) {
    let Some(gradient) = &paint.gradient else {
        append_shape_begin_fill(shape, paint.color, Some(paint.alpha));
        return;
    };
    let matrix = create_rive_gradient_matrix(gradient);
    append_shape_begin_gradient_fill(
        shape,
        if gradient.radial {
            GradientType::Radial
        } else {
            GradientType::Linear
        },
        &gradient.colors,
        &gradient.alphas,
        &gradient.ratios,
        Some(&matrix),
        None,
        None,
        None,
    );
}

fn append_rive_paths(shape: &Ref<Shape>, paths: &[RivePathRecord], winding: Option<PathWinding>) {
    for path in paths {
        let data = path.data.iter().copied().map(f64::from).collect::<Vec<_>>();
        append_shape_path(
            shape,
            &path.commands,
            &data,
            Some(winding.unwrap_or(path.winding)),
        );
    }
}

pub fn append_rive_shape_geometry(shape: &Ref<Shape>, paths: &[RivePathRecord]) {
    append_rive_paths(shape, paths, None);
}

pub fn append_rive_shape_paint(
    shape: &Ref<Shape>,
    artboard: &RiveArtboardGraph,
    shape_index: usize,
    paths: &[RivePathRecord],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    if paths.is_empty() {
        return;
    }
    let paints = collect_rive_paints(artboard, shape_index, diagnostics.as_deref_mut());
    if paints.is_empty() {
        append_rive_paths(shape, paths, None);
        return;
    }
    for paint in paints {
        if !paint.visible {
            continue;
        }
        if paint.stroke.is_none() {
            append_rive_fill_style(shape, &paint);
            append_rive_paths(shape, paths, Some(paint.fill_rule));
            append_shape_end_fill(shape);
            continue;
        }
        append_rive_stroke_style(shape, &paint);
        let mut painted_paths = paths.to_vec();
        for effect in &paint.effects {
            painted_paths = match effect {
                RiveStrokeEffect::Dash(dash) => dash_rive_paths(&painted_paths, dash),
                RiveStrokeEffect::Trim(trim) => trim_rive_paths(&painted_paths, *trim),
            };
        }
        append_rive_paths(shape, &painted_paths, None);
    }
}

fn append_rive_stroke_style(shape: &Ref<Shape>, paint: &RivePaint) {
    let stroke = paint.stroke.expect("stroke style");
    if paint.gradient.is_none() {
        append_shape_line_style(
            shape,
            Some(stroke.thickness),
            paint.color,
            Some(paint.alpha),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(stroke.caps),
            Some(stroke.joints),
            None,
        );
        return;
    }
    append_shape_line_style(
        shape,
        Some(stroke.thickness),
        0x000000ff,
        Some(1.0),
        Some(false),
        Some(LineScaleMode::Normal),
        Some(stroke.caps),
        Some(stroke.joints),
        None,
    );
    let gradient = paint.gradient.as_ref().expect("gradient style");
    let matrix = create_rive_gradient_matrix(gradient);
    append_shape_line_gradient_style(
        shape,
        if gradient.radial {
            GradientType::Radial
        } else {
            GradientType::Linear
        },
        &gradient.colors,
        &gradient.alphas,
        &gradient.ratios,
        Some(&matrix),
        None,
        None,
        None,
    );
}

fn apply_rive_paint_mutator(
    paint: &mut RivePaint,
    artboard: &RiveArtboardGraph,
    paint_index: usize,
) {
    for index in paint_index + 1..artboard.objects.len() {
        if artboard.parent_indices.get(index).copied() != Some(paint_index as i32) {
            continue;
        }
        let object = &artboard.objects[index];
        let type_key = i32::try_from(object.type_key).ok();
        if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_SOLID_COLOR)) {
            let packed = read_rive_u32(object, RIVE_SOLID_COLOR_VALUE, RIVE_DEFAULT_SOLID_COLOR);
            paint.color = ((packed & 0x00ffffff) << 8) | 0xff;
            paint.alpha = f64::from((packed >> 24) & 0xff) / 255.0;
            return;
        }
        if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_LINEAR_GRADIENT)) {
            paint.gradient = Some(create_rive_gradient(object, artboard, index));
            return;
        }
    }
}

fn clamp_rive_unit(value: f64) -> f64 {
    return value.clamp(0.0, 1.0);
}

fn collect_rive_paints(
    artboard: &RiveArtboardGraph,
    shape_index: usize,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RivePaint> {
    let mut paints = Vec::new();
    for index in shape_index + 1..artboard.objects.len() {
        if artboard.parent_indices.get(index).copied() != Some(shape_index as i32) {
            continue;
        }
        let object = &artboard.objects[index];
        if i32::try_from(object.type_key)
            .ok()
            .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_SHAPE_PAINT))
        {
            paints.push(create_rive_paint(
                object,
                artboard,
                index,
                diagnostics.as_deref_mut(),
            ));
        }
    }
    return paints;
}

fn dash_rive_paths(paths: &[RivePathRecord], dash: &RiveDash) -> Vec<RivePathRecord> {
    let mut results = Vec::new();
    for record in paths {
        let mut commands = Vec::new();
        let mut data = Vec::new();
        let contours = flatten_path(&to_rive_path(record), None);
        for contour in contours {
            append_rive_dash_contour(&contour, dash, &mut commands, &mut data);
        }
        if !commands.is_empty() {
            results.push(RivePathRecord {
                commands,
                data: data.into_iter().map(|value| value as f32).collect(),
                path_index: record.path_index,
                winding: record.winding,
            });
        }
    }
    return results;
}

fn get_rive_polyline_length(contour: &[f64]) -> f64 {
    return contour
        .windows(4)
        .step_by(2)
        .map(|point| (point[2] - point[0]).hypot(point[3] - point[1]))
        .sum();
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

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f64) -> f64 {
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

fn read_rive_stroke_effects(
    artboard: &RiveArtboardGraph,
    paint_index: usize,
) -> Vec<RiveStrokeEffect> {
    let mut effects = Vec::new();
    for index in paint_index + 1..artboard.objects.len() {
        if artboard.parent_indices.get(index).copied() != Some(paint_index as i32) {
            continue;
        }
        let object = &artboard.objects[index];
        if object.type_key == RIVE_TRIM_PATH as u64 {
            effects.push(RiveStrokeEffect::Trim(RiveTrim {
                end: read_rive_number(object, RIVE_TRIM_END, 0.0),
                offset: read_rive_number(object, RIVE_TRIM_OFFSET, 0.0),
                sequential: read_rive_number(object, RIVE_TRIM_MODE, 0.0) == RIVE_TRIM_SEQUENTIAL,
                start: read_rive_number(object, RIVE_TRIM_START, 0.0),
            }));
            continue;
        }
        if object.type_key != RIVE_DASH_PATH as u64 {
            continue;
        }
        let mut lengths = Vec::new();
        for child in index + 1..artboard.objects.len() {
            if artboard.parent_indices.get(child).copied() != Some(index as i32)
                || artboard.objects[child].type_key != RIVE_DASH as u64
            {
                continue;
            }
            let dash = &artboard.objects[child];
            lengths.push(RiveDashLength {
                percentage: read_rive_flag(dash, RIVE_DASH_LENGTH_IS_PERCENTAGE, false),
                value: read_rive_number(dash, RIVE_DASH_LENGTH, 0.0),
            });
        }
        effects.push(RiveStrokeEffect::Dash(RiveDash {
            lengths,
            offset: RiveDashLength {
                percentage: read_rive_flag(object, RIVE_DASH_OFFSET_IS_PERCENTAGE, false),
                value: read_rive_number(object, RIVE_DASH_OFFSET, 0.0),
            },
        }));
    }
    return effects;
}

fn read_rive_u32(source: &RiveCoreObject, key: u64, fallback: u32) -> u32 {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or(fallback, |property| match property.value {
            RiveValue::Uint(value) => value as u32,
            RiveValue::Double(value) => value as u32,
            RiveValue::Color(value) => value,
            _ => fallback,
        });
}

pub fn register_rive_paint_handlers(registry: &mut RiveImportRegistry) {
    let paint = Arc::new(RiveCoreObjectHandler {
        import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
        ..RiveCoreObjectHandler::default()
    });
    for type_key in RIVE_PAINT_TYPE_KEYS {
        register_rive_core_object_handler(registry, *type_key, paint.clone());
    }
}

fn to_rive_caps(value: f64, diagnostics: Option<&mut Vec<ImportDiagnostic>>) -> CapsStyle {
    if value == RIVE_CAP_ROUND {
        return CapsStyle::Round;
    }
    if value == RIVE_CAP_SQUARE {
        return CapsStyle::Square;
    }
    if value != RIVE_CAP_BUTT {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "rive.stroke-cap-substituted",
            "toRiveCaps",
            Some(HashMap::from([
                (
                    "capValue".to_string(),
                    ImportDiagnosticDetailValue::Number(value as f32),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("none".to_string()),
                ),
            ])),
        );
    }
    return CapsStyle::None;
}

fn to_rive_dash_length(length: RiveDashLength, contour_length: f64) -> f64 {
    return if length.percentage {
        length.value * contour_length
    } else {
        length.value
    };
}

fn to_rive_joints(value: f64, diagnostics: Option<&mut Vec<ImportDiagnostic>>) -> JointStyle {
    if value == RIVE_JOIN_ROUND {
        return JointStyle::Round;
    }
    if value == RIVE_JOIN_BEVEL {
        return JointStyle::Bevel;
    }
    if value != RIVE_JOIN_MITER {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "rive.stroke-join-substituted",
            "toRiveJoints",
            Some(HashMap::from([
                (
                    "joinValue".to_string(),
                    ImportDiagnosticDetailValue::Number(value as f32),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("miter".to_string()),
                ),
            ])),
        );
    }
    return JointStyle::Miter;
}

fn to_rive_path(record: &RivePathRecord) -> Path {
    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    path.winding = record.winding;
    path.commands.clone_from(&record.commands);
    path.data = record.data.iter().copied().map(f64::from).collect();
    return path;
}

fn to_rive_visible_fraction(trim: RiveTrim) -> f64 {
    let span = trim.end - trim.start;
    if span.abs() >= 1.0 {
        return 1.0;
    }
    return span.rem_euclid(1.0);
}

fn trim_rive_path_to_windows(
    record: &RivePathRecord,
    from: f64,
    to: f64,
    windows: &[(f64, f64)],
) -> Vec<RivePathRecord> {
    let span = to - from;
    if span <= 0.0 {
        return Vec::new();
    }
    let path = to_rive_path(record);
    let length = get_path_length(&path, None);
    if length <= 0.0 {
        return Vec::new();
    }
    let mut results = Vec::new();
    for (window_start, window_end) in windows {
        let start = ((window_start - from) / span).max(0.0);
        let end = ((window_end - from) / span).min(1.0);
        if end <= start {
            continue;
        }
        let mut trimmed = create_path(Some(flight_path::PathWinding::NonZero));
        trimmed.winding = record.winding;
        dash_path(
            &path,
            &[(end - start) * length, (1.0 - (end - start)) * length],
            start * length,
            &mut trimmed,
            None,
        );
        results.push(RivePathRecord {
            commands: trimmed.commands,
            data: trimmed.data.into_iter().map(|value| value as f32).collect(),
            path_index: record.path_index,
            winding: trimmed.winding,
        });
    }
    return results;
}

fn trim_rive_paths(paths: &[RivePathRecord], trim: RiveTrim) -> Vec<RivePathRecord> {
    let visible = to_rive_visible_fraction(trim);
    if visible >= 1.0 {
        return paths.to_vec();
    }
    if visible <= 0.0 {
        return Vec::new();
    }
    let begin = (trim.start + trim.offset).rem_euclid(1.0);
    let windows = if begin + visible <= 1.0 {
        vec![(begin, begin + visible)]
    } else {
        vec![(begin, 1.0), (0.0, begin + visible - 1.0)]
    };
    if !trim.sequential {
        return paths
            .iter()
            .flat_map(|path| trim_rive_path_to_windows(path, 0.0, 1.0, &windows))
            .collect();
    }
    let lengths = paths
        .iter()
        .map(|path| get_path_length(&to_rive_path(path), None))
        .collect::<Vec<_>>();
    let total = lengths.iter().sum::<f64>();
    if total <= 0.0 {
        return Vec::new();
    }
    let mut results = Vec::new();
    let mut travelled = 0.0;
    for (path, length) in paths.iter().zip(lengths) {
        let from = travelled / total;
        travelled += length;
        results.extend(trim_rive_path_to_windows(
            path,
            from,
            travelled / total,
            &windows,
        ));
    }
    return results;
}

fn wrap_rive_dash_offset(offset: f64, contour_length: f64) -> f64 {
    return offset.rem_euclid(contour_length);
}

const RIVE_RADIAL_GRADIENT: i32 = 17;
const RIVE_SOLID_COLOR: i32 = 18;
const RIVE_GRADIENT_STOP: i32 = 19;
const RIVE_SHAPE_PAINT: i32 = 21;
const RIVE_LINEAR_GRADIENT: i32 = 22;
const RIVE_STROKE: i32 = 24;
const RIVE_TRIM_PATH: i32 = 47;
const RIVE_DASH_PATH: i32 = 506;
const RIVE_DASH: i32 = 507;

const RIVE_PAINT_TYPE_KEYS: &[i32] = &[
    RIVE_SOLID_COLOR,
    RIVE_GRADIENT_STOP,
    RIVE_SHAPE_PAINT,
    RIVE_LINEAR_GRADIENT,
    RIVE_TRIM_PATH,
    RIVE_DASH_PATH,
    RIVE_DASH,
];

const RIVE_GRADIENT_STOP_COLOR: u64 = 38;
const RIVE_GRADIENT_STOP_POSITION: u64 = 39;
const RIVE_FILL_RULE: u64 = 40;
const RIVE_PAINT_IS_VISIBLE: u64 = 41;
const RIVE_SOLID_COLOR_VALUE: u64 = 37;
const RIVE_GRADIENT_START_Y: u64 = 33;
const RIVE_GRADIENT_END_X: u64 = 34;
const RIVE_GRADIENT_END_Y: u64 = 35;
const RIVE_GRADIENT_START_X: u64 = 42;
const RIVE_GRADIENT_OPACITY: u64 = 46;
const RIVE_STROKE_THICKNESS: u64 = 47;
const RIVE_STROKE_CAP: u64 = 48;
const RIVE_STROKE_JOIN: u64 = 49;
const RIVE_TRIM_START: u64 = 114;
const RIVE_TRIM_END: u64 = 115;
const RIVE_TRIM_OFFSET: u64 = 116;
const RIVE_TRIM_MODE: u64 = 117;
const RIVE_TRIM_SEQUENTIAL: f64 = 1.0;
const RIVE_CAP_BUTT: f64 = 0.0;
const RIVE_CAP_ROUND: f64 = 1.0;
const RIVE_CAP_SQUARE: f64 = 2.0;
const RIVE_JOIN_MITER: f64 = 0.0;
const RIVE_JOIN_ROUND: f64 = 1.0;
const RIVE_JOIN_BEVEL: f64 = 2.0;
const RIVE_DASH_OFFSET: u64 = 690;
const RIVE_DASH_OFFSET_IS_PERCENTAGE: u64 = 691;
const RIVE_DASH_LENGTH: u64 = 692;
const RIVE_DASH_LENGTH_IS_PERCENTAGE: u64 = 693;

const RIVE_DEFAULT_SOLID_COLOR: u32 = 0xff747474;
const RIVE_DEFAULT_STOP_COLOR: u32 = 0xffffffff;
