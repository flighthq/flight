// flight-lint: allow-file(f64) shape and path command lanes are canonically f64; SWF wire coordinates remain exact i32 twips until append boundaries
use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::{Matrix, create_matrix, inverse_matrix};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_path::{
    append_path_line_to, append_path_move_to, append_path_quadratic_curve_to, create_path,
};
use flight_shape::contract::SpreadMethod;
use flight_shape::{
    CapsStyle, GradientType, InterpolationMethod, JointStyle, LineScaleMode, Shape,
    append_shape_begin_fill, append_shape_begin_gradient_fill, append_shape_begin_texture_fill,
    append_shape_end_fill, append_shape_line_style, append_shape_line_to, append_shape_move_to,
    append_shape_quadratic_curve_to, create_shape,
};
use flight_texture::Texture;

use crate::{SwfMorphPathPair, SwfMorphShapePaths, SwfReader};

pub type SwfBitmapFillResolver = Arc<dyn Fn(u32, bool, bool) -> Option<Ref<Texture>> + Send + Sync>;

#[derive(Clone)]
struct SwfShapeEdge {
    control_x: f32,
    control_y: f32,
    curved: bool,
    end_control_x: Option<f32>,
    end_control_y: Option<f32>,
    end_to_x: Option<i32>,
    end_to_y: Option<i32>,
    to_x: i32,
    to_y: i32,
}

struct SwfShapeEdgeRecord {
    control_x: i32,
    control_y: i32,
    curved: bool,
    to_x: i32,
    to_y: i32,
}

struct SwfShapeFill {
    alphas: Vec<f64>,
    color: u32,
    colors: Vec<u32>,
    focal_point: f64,
    gradient_type: Option<GradientType>,
    matrix: Option<Matrix>,
    opacity: f64,
    ratios: Vec<f64>,
    spread_method: SpreadMethod,
    texture: Option<Ref<Texture>>,
    texture_matrix: Option<Matrix>,
}

struct SwfShapeLine {
    alpha: f64,
    caps: CapsStyle,
    color: u32,
    joints: JointStyle,
    miter_limit: f64,
    pixel_hinting: bool,
    width: u32,
}

enum SwfShapeRecord {
    Edge(SwfShapeEdgeRecord),
    Style(SwfShapeStyleRecord),
}

#[derive(Clone)]
struct SwfShapeSegment {
    edges: Vec<SwfShapeEdge>,
    end_start_x: Option<i32>,
    end_start_y: Option<i32>,
    start_x: i32,
    start_y: i32,
}

struct SwfShapeState {
    fill_0: u32,
    fill_0_segment: Option<SwfShapeSegment>,
    fill_1: u32,
    fill_1_segment: Option<SwfShapeSegment>,
    fill_segments: HashMap<u32, Vec<SwfShapeSegment>>,
    line: u32,
    line_segment: Option<SwfShapeSegment>,
    line_segments: HashMap<u32, Vec<SwfShapeSegment>>,
    styles: SwfShapeStyles,
    x: i32,
    y: i32,
}

struct SwfShapeStyleRecord {
    fill_0: Option<u32>,
    fill_1: Option<u32>,
    line: Option<u32>,
    move_to: Option<(i32, i32)>,
}

struct SwfShapeStyles {
    fills: Vec<SwfShapeFill>,
    lines: Vec<SwfShapeLine>,
}

pub fn create_swf_glyph_shape(reader: &mut SwfReader) -> Option<Ref<Shape>> {
    let styles = SwfShapeStyles {
        fills: vec![swf_shape_create_fill(0x000000ff, 1.0)],
        lines: Vec::new(),
    };
    return swf_shape_decode_body(reader, 1, styles, None);
}

pub fn create_swf_shape(
    reader: &mut SwfReader,
    version: u32,
    resolve_bitmap_fill: Option<&SwfBitmapFillResolver>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<Shape>> {
    let styles = swf_shape_read_styles(
        reader,
        version,
        version >= 3,
        resolve_bitmap_fill,
        diagnostics,
    )?;
    return swf_shape_decode_body(reader, version, styles, resolve_bitmap_fill);
}

pub fn read_swf_morph_shape_paths(
    start_reader: &mut SwfReader,
    end_reader: &mut SwfReader,
) -> Option<SwfMorphShapePaths> {
    let start_records = swf_shape_read_record_list(start_reader)?;
    let end_records = swf_shape_read_record_list(end_reader)?;
    let mut state = swf_shape_empty_state(SwfShapeStyles {
        fills: Vec::new(),
        lines: Vec::new(),
    });
    let mut end_x = 0;
    let mut end_y = 0;
    let mut start_index = 0;
    let mut end_index = 0;
    while start_index < start_records.len() && end_index < end_records.len() {
        if let SwfShapeRecord::Style(record) = &start_records[start_index] {
            swf_shape_flush_segments(&mut state);
            if let Some((x, y)) = record.move_to {
                state.x = x;
                state.y = y;
            }
            if let Some(value) = record.fill_0 {
                state.fill_0 = value;
            }
            if let Some(value) = record.fill_1 {
                state.fill_1 = value;
            }
            if let Some(value) = record.line {
                state.line = value;
            }
            start_index += 1;
            if let SwfShapeRecord::Style(end_record) = &end_records[end_index] {
                if let Some((x, y)) = end_record.move_to {
                    end_x = x;
                    end_y = y;
                }
                end_index += 1;
            }
            continue;
        }
        if let SwfShapeRecord::Style(record) = &end_records[end_index] {
            swf_shape_flush_segments(&mut state);
            if let Some((x, y)) = record.move_to {
                end_x = x;
                end_y = y;
            }
            end_index += 1;
            continue;
        }
        let SwfShapeRecord::Edge(start_edge) = &start_records[start_index] else {
            unreachable!();
        };
        let SwfShapeRecord::Edge(end_edge) = &end_records[end_index] else {
            unreachable!();
        };
        swf_shape_append_morph_edge(&mut state, start_edge, end_edge, end_x, end_y);
        end_x = end_edge.to_x;
        end_y = end_edge.to_y;
        start_index += 1;
        end_index += 1;
    }
    swf_shape_flush_segments(&mut state);
    return Some(SwfMorphShapePaths {
        fills: swf_shape_create_morph_segment_paths(&state.fill_segments),
        lines: swf_shape_create_morph_segment_paths(&state.line_segments),
    });
}

fn swf_shape_append_contours(shape: &Ref<Shape>, segments: &[SwfShapeSegment]) {
    for contour in swf_shape_stitch_segments(segments) {
        append_shape_move_to(
            shape,
            f64::from(contour.start_x) / TWIPS_PER_PIXEL,
            f64::from(contour.start_y) / TWIPS_PER_PIXEL,
        );
        for edge in contour.edges {
            if edge.curved {
                append_shape_quadratic_curve_to(
                    shape,
                    f64::from(edge.control_x) / TWIPS_PER_PIXEL,
                    f64::from(edge.control_y) / TWIPS_PER_PIXEL,
                    f64::from(edge.to_x) / TWIPS_PER_PIXEL,
                    f64::from(edge.to_y) / TWIPS_PER_PIXEL,
                );
            } else {
                append_shape_line_to(
                    shape,
                    f64::from(edge.to_x) / TWIPS_PER_PIXEL,
                    f64::from(edge.to_y) / TWIPS_PER_PIXEL,
                );
            }
        }
    }
}

fn swf_shape_append_edges(out: &mut Vec<SwfShapeEdge>, source: &[SwfShapeEdge]) {
    for edge in source {
        out.push(edge.clone());
    }
}

fn swf_shape_append_morph_edge(
    state: &mut SwfShapeState,
    start_edge: &SwfShapeEdgeRecord,
    end_edge: &SwfShapeEdgeRecord,
    end_from_x: i32,
    end_from_y: i32,
) {
    let from_x = state.x;
    let from_y = state.y;
    let mut edge = SwfShapeEdge {
        control_x: start_edge.control_x as f32,
        control_y: start_edge.control_y as f32,
        curved: start_edge.curved || end_edge.curved,
        end_control_x: Some(if end_edge.curved {
            end_edge.control_x as f32
        } else {
            (end_from_x as f32 + end_edge.to_x as f32) / 2.0
        }),
        end_control_y: Some(if end_edge.curved {
            end_edge.control_y as f32
        } else {
            (end_from_y as f32 + end_edge.to_y as f32) / 2.0
        }),
        end_to_x: Some(end_edge.to_x),
        end_to_y: Some(end_edge.to_y),
        to_x: start_edge.to_x,
        to_y: start_edge.to_y,
    };
    if edge.curved && !start_edge.curved {
        edge.control_x = (from_x as f32 + start_edge.to_x as f32) / 2.0;
        edge.control_y = (from_y as f32 + start_edge.to_y as f32) / 2.0;
    }
    if state.fill_0 != 0 {
        state.fill_0_segment.get_or_insert_with(|| {
            swf_shape_create_morph_segment(from_x, from_y, end_from_x, end_from_y)
        });
        state
            .fill_0_segment
            .as_mut()
            .unwrap()
            .edges
            .push(edge.clone());
    }
    if state.fill_1 != 0 {
        state.fill_1_segment.get_or_insert_with(|| {
            swf_shape_create_morph_segment(from_x, from_y, end_from_x, end_from_y)
        });
        state
            .fill_1_segment
            .as_mut()
            .unwrap()
            .edges
            .push(edge.clone());
    }
    if state.line != 0 {
        state.line_segment.get_or_insert_with(|| {
            swf_shape_create_morph_segment(from_x, from_y, end_from_x, end_from_y)
        });
        state.line_segment.as_mut().unwrap().edges.push(edge);
    }
    state.x = start_edge.to_x;
    state.y = start_edge.to_y;
}

// flight-lint: allow(hashmap-iteration) style indices are collected then explicitly sorted before authored paint emission
fn swf_shape_append_style_layer(shape: &Ref<Shape>, state: &mut SwfShapeState) {
    let mut fill_indices: Vec<u32> = state.fill_segments.keys().copied().collect();
    fill_indices.sort_unstable();
    for index in fill_indices {
        let Some(fill) = state.styles.fills.get(index as usize - 1) else {
            continue;
        };
        let Some(segments) = state.fill_segments.get(&index) else {
            continue;
        };
        if let Some(texture) = &fill.texture {
            append_shape_begin_texture_fill(shape, texture, fill.texture_matrix.as_ref());
        } else if let Some(gradient_type) = fill.gradient_type {
            append_shape_begin_gradient_fill(
                shape,
                gradient_type,
                &fill.colors,
                &fill.alphas,
                &fill.ratios,
                fill.matrix.as_ref(),
                Some(fill.spread_method),
                Some(InterpolationMethod::Rgb),
                Some(fill.focal_point),
            );
        } else {
            append_shape_begin_fill(shape, fill.color, Some(fill.opacity));
        }
        swf_shape_append_contours(shape, segments);
        append_shape_end_fill(shape);
    }

    let mut line_indices: Vec<u32> = state.line_segments.keys().copied().collect();
    line_indices.sort_unstable();
    for index in line_indices {
        let Some(line) = state.styles.lines.get(index as usize - 1) else {
            continue;
        };
        let Some(segments) = state.line_segments.get(&index) else {
            continue;
        };
        append_shape_line_style(
            shape,
            Some(f64::from(line.width) / TWIPS_PER_PIXEL),
            line.color,
            Some(line.alpha),
            Some(line.pixel_hinting),
            Some(LineScaleMode::Normal),
            Some(line.caps),
            Some(line.joints),
            Some(line.miter_limit),
        );
        swf_shape_append_contours(shape, segments);
    }
    state.fill_segments.clear();
    state.line_segments.clear();
}

fn swf_shape_create_fill(color: u32, opacity: f64) -> SwfShapeFill {
    return SwfShapeFill {
        alphas: Vec::new(),
        color,
        colors: Vec::new(),
        focal_point: 0.0,
        gradient_type: None,
        matrix: None,
        opacity,
        ratios: Vec::new(),
        spread_method: SpreadMethod::Pad,
        texture: None,
        texture_matrix: None,
    };
}

fn swf_shape_create_morph_segment(x: i32, y: i32, end_x: i32, end_y: i32) -> SwfShapeSegment {
    return SwfShapeSegment {
        edges: Vec::new(),
        end_start_x: Some(end_x),
        end_start_y: Some(end_y),
        start_x: x,
        start_y: y,
    };
}

// flight-lint: allow(hashmap-iteration) morph style keys are explicitly sorted before path construction
fn swf_shape_create_morph_segment_paths(
    segments: &HashMap<u32, Vec<SwfShapeSegment>>,
) -> HashMap<u32, SwfMorphPathPair> {
    let mut paths = HashMap::new();
    let mut indices: Vec<u32> = segments.keys().copied().collect();
    indices.sort_unstable();
    for index in indices {
        let mut start_path = create_path(Some(flight_path::PathWinding::NonZero));
        let mut end_path = create_path(Some(flight_path::PathWinding::NonZero));
        for contour in swf_shape_stitch_segments(&segments[&index]) {
            append_path_move_to(
                &mut start_path,
                f64::from(contour.start_x) / TWIPS_PER_PIXEL,
                f64::from(contour.start_y) / TWIPS_PER_PIXEL,
            );
            append_path_move_to(
                &mut end_path,
                f64::from(contour.end_start_x.unwrap_or(0)) / TWIPS_PER_PIXEL,
                f64::from(contour.end_start_y.unwrap_or(0)) / TWIPS_PER_PIXEL,
            );
            for edge in contour.edges {
                if edge.curved {
                    append_path_quadratic_curve_to(
                        &mut start_path,
                        f64::from(edge.control_x) / TWIPS_PER_PIXEL,
                        f64::from(edge.control_y) / TWIPS_PER_PIXEL,
                        f64::from(edge.to_x) / TWIPS_PER_PIXEL,
                        f64::from(edge.to_y) / TWIPS_PER_PIXEL,
                    );
                    append_path_quadratic_curve_to(
                        &mut end_path,
                        f64::from(edge.end_control_x.unwrap_or(0.0)) / TWIPS_PER_PIXEL,
                        f64::from(edge.end_control_y.unwrap_or(0.0)) / TWIPS_PER_PIXEL,
                        f64::from(edge.end_to_x.unwrap_or(0)) / TWIPS_PER_PIXEL,
                        f64::from(edge.end_to_y.unwrap_or(0)) / TWIPS_PER_PIXEL,
                    );
                } else {
                    append_path_line_to(
                        &mut start_path,
                        f64::from(edge.to_x) / TWIPS_PER_PIXEL,
                        f64::from(edge.to_y) / TWIPS_PER_PIXEL,
                    );
                    append_path_line_to(
                        &mut end_path,
                        f64::from(edge.end_to_x.unwrap_or(0)) / TWIPS_PER_PIXEL,
                        f64::from(edge.end_to_y.unwrap_or(0)) / TWIPS_PER_PIXEL,
                    );
                }
            }
        }
        if !start_path.commands.is_empty() {
            paths.insert(
                index,
                SwfMorphPathPair {
                    end: end_path,
                    start: start_path,
                },
            );
        }
    }
    return paths;
}

fn swf_shape_create_point_key(x: i32, y: i32) -> String {
    return format!("{x},{y}");
}

fn swf_shape_create_segment(x: i32, y: i32) -> SwfShapeSegment {
    return SwfShapeSegment {
        edges: Vec::new(),
        end_start_x: None,
        end_start_y: None,
        start_x: x,
        start_y: y,
    };
}

fn swf_shape_decode_body(
    reader: &mut SwfReader,
    version: u32,
    styles: SwfShapeStyles,
    resolve_bitmap_fill: Option<&SwfBitmapFillResolver>,
) -> Option<Ref<Shape>> {
    let has_alpha = version >= 3;
    let shape = create_shape();
    let mut state = swf_shape_empty_state(styles);
    let mut fill_bits = reader.read_unsigned_bits(4) as u8;
    let mut line_bits = reader.read_unsigned_bits(4) as u8;
    if !reader.valid {
        return None;
    }
    let mut records = 0;
    loop {
        records += 1;
        if records > MAX_SHAPE_RECORDS {
            return None;
        }
        if reader.read_unsigned_bits(1) != 0.0 {
            if !swf_shape_read_edge(reader, &mut state) {
                return None;
            }
            continue;
        }
        let flags = reader.read_unsigned_bits(5) as u32;
        if !reader.valid {
            return None;
        }
        if flags == 0 {
            break;
        }
        swf_shape_flush_segments(&mut state);
        if flags & STATE_MOVE_TO != 0 {
            let bits = reader.read_unsigned_bits(5) as u8;
            state.x = reader.read_signed_bits(bits) as i32;
            state.y = reader.read_signed_bits(bits) as i32;
        }
        if flags & STATE_FILL_STYLE_0 != 0 {
            state.fill_0 = reader.read_unsigned_bits(fill_bits) as u32;
        }
        if flags & STATE_FILL_STYLE_1 != 0 {
            state.fill_1 = reader.read_unsigned_bits(fill_bits) as u32;
        }
        if flags & STATE_LINE_STYLE != 0 {
            state.line = reader.read_unsigned_bits(line_bits) as u32;
        }
        if !reader.valid {
            return None;
        }
        if flags & STATE_NEW_STYLES != 0 {
            swf_shape_append_style_layer(&shape, &mut state);
            state.styles =
                swf_shape_read_styles(reader, version, has_alpha, resolve_bitmap_fill, None)?;
            state.fill_0 = 0;
            state.fill_1 = 0;
            state.line = 0;
            fill_bits = reader.read_unsigned_bits(4) as u8;
            line_bits = reader.read_unsigned_bits(4) as u8;
            if !reader.valid {
                return None;
            }
        }
    }
    swf_shape_flush_segments(&mut state);
    swf_shape_append_style_layer(&shape, &mut state);
    return reader.valid.then_some(shape);
}

fn swf_shape_empty_state(styles: SwfShapeStyles) -> SwfShapeState {
    return SwfShapeState {
        fill_0: 0,
        fill_0_segment: None,
        fill_1: 0,
        fill_1_segment: None,
        fill_segments: HashMap::new(),
        line: 0,
        line_segment: None,
        line_segments: HashMap::new(),
        styles,
        x: 0,
        y: 0,
    };
}

fn swf_shape_flush_segments(state: &mut SwfShapeState) {
    swf_shape_push_segment(
        &mut state.fill_segments,
        state.fill_1,
        state.fill_1_segment.take(),
    );
    let reversed = swf_shape_reverse_segment(state.fill_0_segment.take());
    swf_shape_push_segment(&mut state.fill_segments, state.fill_0, reversed);
    swf_shape_push_segment(
        &mut state.line_segments,
        state.line,
        state.line_segment.take(),
    );
}

fn swf_shape_push_segment(
    target: &mut HashMap<u32, Vec<SwfShapeSegment>>,
    index: u32,
    segment: Option<SwfShapeSegment>,
) {
    let Some(segment) = segment else {
        return;
    };
    if index == 0 || segment.edges.is_empty() {
        return;
    }
    target.entry(index).or_default().push(segment);
}

fn swf_shape_read_color(reader: &mut SwfReader, has_alpha: bool) -> (u32, f64) {
    let red = reader.read_uint8();
    let green = reader.read_uint8();
    let blue = reader.read_uint8();
    let alpha = if has_alpha { reader.read_uint8() } else { 0xff };
    return (
        u32::from(red) << 24 | u32::from(green) << 16 | u32::from(blue) << 8 | 0xff,
        f64::from(alpha) / 0xff as f64,
    );
}

fn swf_shape_read_edge(reader: &mut SwfReader, state: &mut SwfShapeState) -> bool {
    let from_x = state.x;
    let from_y = state.y;
    let record = match swf_shape_read_edge_record(reader, &mut state.x, &mut state.y) {
        Some(value) => value,
        None => return false,
    };
    let edge = SwfShapeEdge {
        control_x: record.control_x as f32,
        control_y: record.control_y as f32,
        curved: record.curved,
        end_control_x: None,
        end_control_y: None,
        end_to_x: None,
        end_to_y: None,
        to_x: record.to_x,
        to_y: record.to_y,
    };
    if state.fill_1 != 0 {
        state
            .fill_1_segment
            .get_or_insert_with(|| swf_shape_create_segment(from_x, from_y))
            .edges
            .push(edge.clone());
    }
    if state.fill_0 != 0 {
        state
            .fill_0_segment
            .get_or_insert_with(|| swf_shape_create_segment(from_x, from_y))
            .edges
            .push(edge.clone());
    }
    if state.line != 0 {
        state
            .line_segment
            .get_or_insert_with(|| swf_shape_create_segment(from_x, from_y))
            .edges
            .push(edge);
    }
    return true;
}

fn swf_shape_read_edge_record(
    reader: &mut SwfReader,
    pen_x: &mut i32,
    pen_y: &mut i32,
) -> Option<SwfShapeEdgeRecord> {
    let from_x = *pen_x;
    let from_y = *pen_y;
    let straight = reader.read_unsigned_bits(1) != 0.0;
    let bits = reader.read_unsigned_bits(4) as u8 + 2;
    let mut control_x = 0;
    let mut control_y = 0;
    let mut curved = false;
    if straight {
        if reader.read_unsigned_bits(1) != 0.0 {
            *pen_x += reader.read_signed_bits(bits) as i32;
            *pen_y += reader.read_signed_bits(bits) as i32;
        } else if reader.read_unsigned_bits(1) != 0.0 {
            *pen_y += reader.read_signed_bits(bits) as i32;
        } else {
            *pen_x += reader.read_signed_bits(bits) as i32;
        }
    } else {
        curved = true;
        control_x = from_x + reader.read_signed_bits(bits) as i32;
        control_y = from_y + reader.read_signed_bits(bits) as i32;
        *pen_x = control_x + reader.read_signed_bits(bits) as i32;
        *pen_y = control_y + reader.read_signed_bits(bits) as i32;
    }
    if !reader.valid {
        return None;
    }
    return Some(SwfShapeEdgeRecord {
        control_x,
        control_y,
        curved,
        to_x: *pen_x,
        to_y: *pen_y,
    });
}

fn swf_shape_read_fill_style(
    reader: &mut SwfReader,
    version: u32,
    has_alpha: bool,
    resolve_bitmap_fill: Option<&SwfBitmapFillResolver>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<SwfShapeFill> {
    let fill_type = reader.read_uint8();
    if fill_type == FILL_SOLID {
        let (color, opacity) = swf_shape_read_color(reader, has_alpha);
        return Some(swf_shape_create_fill(color, opacity));
    }
    if matches!(
        fill_type,
        FILL_LINEAR_GRADIENT | FILL_RADIAL_GRADIENT | FILL_FOCAL_GRADIENT
    ) {
        if fill_type == FILL_FOCAL_GRADIENT && version < 4 {
            return None;
        }
        let matrix = swf_shape_read_matrix(reader);
        let spread = reader.read_unsigned_bits(2) as u32;
        reader.read_unsigned_bits(2);
        let count = reader.read_unsigned_bits(4) as u32;
        reader.align_to_byte();
        if !reader.valid || count == 0 || count > MAX_GRADIENT_RECORDS {
            return None;
        }
        let mut colors = Vec::new();
        let mut alphas = Vec::new();
        let mut ratios = Vec::new();
        for _ in 0..count {
            ratios.push(f64::from(reader.read_uint8()));
            let (color, opacity) = swf_shape_read_color(reader, has_alpha);
            colors.push(color);
            alphas.push(opacity);
        }
        let focal_point = if fill_type == FILL_FOCAL_GRADIENT {
            f64::from(reader.read_fixed8())
        } else {
            0.0
        };
        if !reader.valid {
            return None;
        }
        return Some(SwfShapeFill {
            alphas,
            color: 0x000000ff,
            colors,
            focal_point,
            gradient_type: Some(if fill_type == FILL_LINEAR_GRADIENT {
                GradientType::Linear
            } else {
                GradientType::Radial
            }),
            matrix: Some(matrix),
            opacity: 1.0,
            ratios,
            spread_method: swf_shape_resolve_spread_method(spread),
            texture: None,
            texture_matrix: None,
        });
    }
    if matches!(
        fill_type,
        FILL_REPEATING_BITMAP
            | FILL_CLIPPED_BITMAP
            | FILL_NON_SMOOTHED_REPEATING_BITMAP
            | FILL_NON_SMOOTHED_CLIPPED_BITMAP
    ) {
        let character_id = u32::from(reader.read_uint16());
        let matrix = swf_shape_read_matrix(reader);
        if !reader.valid {
            return None;
        }
        let repeat = matches!(
            fill_type,
            FILL_REPEATING_BITMAP | FILL_NON_SMOOTHED_REPEATING_BITMAP
        );
        let smoothed = matches!(fill_type, FILL_REPEATING_BITMAP | FILL_CLIPPED_BITMAP);
        let mut fill = swf_shape_create_fill(0x000000ff, 1.0);
        fill.texture =
            resolve_bitmap_fill.and_then(|resolve| resolve(character_id, repeat, smoothed));
        let texture_matrix = create_matrix(
            matrix.a / TWIPS_PER_PIXEL as f32,
            matrix.b / TWIPS_PER_PIXEL as f32,
            matrix.c / TWIPS_PER_PIXEL as f32,
            matrix.d / TWIPS_PER_PIXEL as f32,
            matrix.tx,
            matrix.ty,
        );
        let mut inverse = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        if inverse_matrix(&mut inverse, &texture_matrix) {
            fill.texture_matrix = Some(texture_matrix);
        } else {
            let mut detail = HashMap::new();
            detail.insert(
                "character".to_string(),
                ImportDiagnosticDetailValue::Number(character_id as f32),
            );
            report_import_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "swf.fill-matrix-singular",
                "readSwfShapeFillStyle",
                Some(detail),
            );
        }
        return Some(fill);
    }
    return None;
}

fn swf_shape_read_line_style(
    reader: &mut SwfReader,
    version: u32,
    has_alpha: bool,
    resolve_bitmap_fill: Option<&SwfBitmapFillResolver>,
) -> Option<SwfShapeLine> {
    let width = u32::from(reader.read_uint16());
    if version < 4 {
        let (color, alpha) = swf_shape_read_color(reader, has_alpha);
        return reader.valid.then_some(SwfShapeLine {
            alpha,
            caps: CapsStyle::Round,
            color,
            joints: JointStyle::Round,
            miter_limit: 3.0,
            pixel_hinting: false,
            width,
        });
    }
    let start_cap = reader.read_unsigned_bits(2) as u32;
    let join = reader.read_unsigned_bits(2) as u32;
    let has_fill = reader.read_unsigned_bits(1) != 0.0;
    reader.read_unsigned_bits(2);
    let pixel_hinting = reader.read_unsigned_bits(1) != 0.0;
    reader.read_unsigned_bits(5);
    reader.read_unsigned_bits(1);
    reader.read_unsigned_bits(2);
    let miter_limit = if join == JOIN_MITER {
        f64::from(reader.read_fixed8())
    } else {
        3.0
    };
    if !reader.valid {
        return None;
    }
    let (color, alpha) = if has_fill {
        let fill =
            swf_shape_read_fill_style(reader, version, has_alpha, resolve_bitmap_fill, None)?;
        (fill.color, fill.opacity)
    } else {
        swf_shape_read_color(reader, has_alpha)
    };
    return reader.valid.then_some(SwfShapeLine {
        alpha,
        caps: swf_shape_resolve_caps_style(start_cap),
        color,
        joints: swf_shape_resolve_joint_style(join),
        miter_limit,
        pixel_hinting,
        width,
    });
}

fn swf_shape_read_matrix(reader: &mut SwfReader) -> Matrix {
    let mut a = 1.0;
    let mut d = 1.0;
    if reader.read_unsigned_bits(1) != 0.0 {
        let bits = reader.read_unsigned_bits(5) as u8;
        a = reader.read_signed_bits(bits) as f32 / FIXED_16_ONE;
        d = reader.read_signed_bits(bits) as f32 / FIXED_16_ONE;
    }
    let mut b = 0.0;
    let mut c = 0.0;
    if reader.read_unsigned_bits(1) != 0.0 {
        let bits = reader.read_unsigned_bits(5) as u8;
        b = reader.read_signed_bits(bits) as f32 / FIXED_16_ONE;
        c = reader.read_signed_bits(bits) as f32 / FIXED_16_ONE;
    }
    let bits = reader.read_unsigned_bits(5) as u8;
    let tx = reader.read_signed_bits(bits) as f32 / TWIPS_PER_PIXEL as f32;
    let ty = reader.read_signed_bits(bits) as f32 / TWIPS_PER_PIXEL as f32;
    reader.align_to_byte();
    return create_matrix(a, b, c, d, tx, ty);
}

fn swf_shape_read_record_list(reader: &mut SwfReader) -> Option<Vec<SwfShapeRecord>> {
    let fill_bits = reader.read_unsigned_bits(4) as u8;
    let line_bits = reader.read_unsigned_bits(4) as u8;
    if !reader.valid {
        return None;
    }
    let mut records = Vec::new();
    let mut x = 0;
    let mut y = 0;
    for count in 0..=MAX_SHAPE_RECORDS {
        if count == MAX_SHAPE_RECORDS {
            return None;
        }
        if reader.read_unsigned_bits(1) != 0.0 {
            records.push(SwfShapeRecord::Edge(swf_shape_read_edge_record(
                reader, &mut x, &mut y,
            )?));
            continue;
        }
        let flags = reader.read_unsigned_bits(5) as u32;
        if !reader.valid {
            return None;
        }
        if flags == 0 {
            return Some(records);
        }
        if flags & STATE_NEW_STYLES != 0 {
            return None;
        }
        let move_to = if flags & STATE_MOVE_TO != 0 {
            let bits = reader.read_unsigned_bits(5) as u8;
            x = reader.read_signed_bits(bits) as i32;
            y = reader.read_signed_bits(bits) as i32;
            Some((x, y))
        } else {
            None
        };
        let fill_0 =
            (flags & STATE_FILL_STYLE_0 != 0).then(|| reader.read_unsigned_bits(fill_bits) as u32);
        let fill_1 =
            (flags & STATE_FILL_STYLE_1 != 0).then(|| reader.read_unsigned_bits(fill_bits) as u32);
        let line =
            (flags & STATE_LINE_STYLE != 0).then(|| reader.read_unsigned_bits(line_bits) as u32);
        if !reader.valid {
            return None;
        }
        records.push(SwfShapeRecord::Style(SwfShapeStyleRecord {
            fill_0,
            fill_1,
            line,
            move_to,
        }));
    }
    return None;
}

fn swf_shape_read_style_count(reader: &mut SwfReader, version: u32) -> u32 {
    let count = reader.read_uint8();
    return if count == EXTENDED_STYLE_COUNT && version >= 2 {
        u32::from(reader.read_uint16())
    } else {
        u32::from(count)
    };
}

fn swf_shape_read_styles(
    reader: &mut SwfReader,
    version: u32,
    has_alpha: bool,
    resolve_bitmap_fill: Option<&SwfBitmapFillResolver>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<SwfShapeStyles> {
    let fill_count = swf_shape_read_style_count(reader, version);
    if !reader.valid || fill_count > MAX_SHAPE_STYLES {
        return None;
    }
    let mut fills = Vec::new();
    for _ in 0..fill_count {
        fills.push(swf_shape_read_fill_style(
            reader,
            version,
            has_alpha,
            resolve_bitmap_fill,
            diagnostics.as_deref_mut(),
        )?);
    }
    let line_count = swf_shape_read_style_count(reader, version);
    if !reader.valid || line_count > MAX_SHAPE_STYLES {
        return None;
    }
    let mut lines = Vec::new();
    for _ in 0..line_count {
        lines.push(swf_shape_read_line_style(
            reader,
            version,
            has_alpha,
            resolve_bitmap_fill,
        )?);
    }
    return reader.valid.then_some(SwfShapeStyles { fills, lines });
}

fn swf_shape_resolve_caps_style(value: u32) -> CapsStyle {
    if value == CAP_NONE {
        return CapsStyle::None;
    }
    return if value == CAP_SQUARE {
        CapsStyle::Square
    } else {
        CapsStyle::Round
    };
}

fn swf_shape_resolve_joint_style(value: u32) -> JointStyle {
    if value == JOIN_BEVEL {
        return JointStyle::Bevel;
    }
    return if value == JOIN_MITER {
        JointStyle::Miter
    } else {
        JointStyle::Round
    };
}

fn swf_shape_resolve_spread_method(value: u32) -> SpreadMethod {
    if value == SPREAD_REFLECT {
        return SpreadMethod::Reflect;
    }
    return if value == SPREAD_REPEAT {
        SpreadMethod::Repeat
    } else {
        SpreadMethod::Pad
    };
}

fn swf_shape_reverse_segment(segment: Option<SwfShapeSegment>) -> Option<SwfShapeSegment> {
    let segment = segment?;
    let last = segment.edges.last()?;
    let mut reversed = swf_shape_create_segment(last.to_x, last.to_y);
    reversed.end_start_x = last.end_to_x;
    reversed.end_start_y = last.end_to_y;
    for index in (0..segment.edges.len()).rev() {
        let edge = &segment.edges[index];
        let previous = index.checked_sub(1).map(|value| &segment.edges[value]);
        reversed.edges.push(SwfShapeEdge {
            control_x: edge.control_x,
            control_y: edge.control_y,
            curved: edge.curved,
            end_control_x: edge.end_control_x,
            end_control_y: edge.end_control_y,
            end_to_x: if index == 0 {
                segment.end_start_x
            } else {
                previous.and_then(|value| value.end_to_x)
            },
            end_to_y: if index == 0 {
                segment.end_start_y
            } else {
                previous.and_then(|value| value.end_to_y)
            },
            to_x: previous.map_or(segment.start_x, |value| value.to_x),
            to_y: previous.map_or(segment.start_y, |value| value.to_y),
        });
    }
    return Some(reversed);
}

// flight-lint: allow(hashmap-iteration) contour order is driven solely by the authored segment Vec; the map is point-key lookup only
fn swf_shape_stitch_segments(segments: &[SwfShapeSegment]) -> Vec<SwfShapeSegment> {
    let mut starts: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, segment) in segments.iter().enumerate() {
        starts
            .entry(swf_shape_create_point_key(segment.start_x, segment.start_y))
            .or_default()
            .push(index);
    }
    let mut used = vec![false; segments.len()];
    let mut contours = Vec::new();
    for index in 0..segments.len() {
        if used[index] {
            continue;
        }
        used[index] = true;
        let mut contour =
            swf_shape_create_segment(segments[index].start_x, segments[index].start_y);
        swf_shape_append_edges(&mut contour.edges, &segments[index].edges);
        loop {
            let Some(tail) = contour.edges.last() else {
                break;
            };
            if tail.to_x == contour.start_x && tail.to_y == contour.start_y {
                break;
            }
            let Some(candidates) = starts.get(&swf_shape_create_point_key(tail.to_x, tail.to_y))
            else {
                break;
            };
            let Some(next) = candidates.iter().copied().find(|next| !used[*next]) else {
                break;
            };
            used[next] = true;
            swf_shape_append_edges(&mut contour.edges, &segments[next].edges);
        }
        contours.push(contour);
    }
    return contours;
}

const CAP_NONE: u32 = 1;
const CAP_SQUARE: u32 = 2;
const EXTENDED_STYLE_COUNT: u8 = 0xff;
const FILL_CLIPPED_BITMAP: u8 = 0x41;
const FILL_FOCAL_GRADIENT: u8 = 0x13;
const FILL_LINEAR_GRADIENT: u8 = 0x10;
const FILL_NON_SMOOTHED_CLIPPED_BITMAP: u8 = 0x43;
const FILL_NON_SMOOTHED_REPEATING_BITMAP: u8 = 0x42;
const FILL_RADIAL_GRADIENT: u8 = 0x12;
const FILL_REPEATING_BITMAP: u8 = 0x40;
const FILL_SOLID: u8 = 0x00;
const FIXED_16_ONE: f32 = 0x10000 as f32;
const JOIN_BEVEL: u32 = 1;
const JOIN_MITER: u32 = 2;
const MAX_GRADIENT_RECORDS: u32 = 15;
const MAX_SHAPE_RECORDS: usize = 200_000;
const MAX_SHAPE_STYLES: u32 = 0xffff;
const SPREAD_REFLECT: u32 = 1;
const SPREAD_REPEAT: u32 = 2;
const STATE_FILL_STYLE_0: u32 = 0x02;
const STATE_FILL_STYLE_1: u32 = 0x04;
const STATE_LINE_STYLE: u32 = 0x08;
const STATE_MOVE_TO: u32 = 0x01;
const STATE_NEW_STYLES: u32 = 0x10;
const TWIPS_PER_PIXEL: f64 = 20.0;
