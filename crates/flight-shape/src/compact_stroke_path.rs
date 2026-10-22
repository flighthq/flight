//! Centerline-to-outline stroke expansion (TS `compactStrokePath.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use flight_path::{Path, PathCommand, StrokeCap, StrokeJoin, StrokeStyle};

use crate::shape_fill::get_path_command_operand_count;

const MAX_SUBDIVISION_DEPTH: u32 = 16;

struct DashSegment {
    closed: bool,
    points: Vec<f64>,
}

struct StrokeSubpath {
    closed: bool,
    points: Vec<f64>,
}

pub(crate) fn _operand_count_is_used() -> usize {
    return get_path_command_operand_count(0);
}

fn add_arc_points(
    cx: f64,
    cy: f64,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    ccw: bool,
    tolerance: f64,
    out: &mut Vec<f64>,
) {
    let ratio = (tolerance / radius).max(0.0).min(1.0);
    let n = ((std::f64::consts::PI / (1.0 - ratio).acos()).ceil() as usize).max(4);
    let mut delta = end_angle - start_angle;
    if ccw {
        if delta > 0.0 {
            delta -= std::f64::consts::PI * 2.0;
        }
    } else if delta < 0.0 {
        delta += std::f64::consts::PI * 2.0;
    }
    let steps = (delta.abs() / (std::f64::consts::PI * 2.0 / n as f64)).ceil() as usize;
    if steps <= 1 {
        return;
    }
    let step_angle = delta / steps as f64;
    let mut index = 1;
    while index < steps {
        let angle = start_angle + index as f64 * step_angle;
        out.push(cx + angle.cos() * radius);
        out.push(cy + angle.sin() * radius);
        index += 1;
    }
}

fn add_cap(
    px: f64,
    py: f64,
    nx: f64,
    ny: f64,
    edx: f64,
    edy: f64,
    half_width: f64,
    cap: StrokeCap,
    left: &mut Vec<f64>,
    right: &mut Vec<f64>,
    tolerance: f64,
    is_start: bool,
) {
    let lx = px + nx * half_width;
    let ly = py + ny * half_width;
    let rx = px - nx * half_width;
    let ry = py - ny * half_width;
    match cap {
        StrokeCap::Butt => {
            left.push(lx);
            left.push(ly);
            right.push(rx);
            right.push(ry);
        }
        StrokeCap::Square => {
            left.push(lx + edx * half_width);
            left.push(ly + edy * half_width);
            right.push(rx + edx * half_width);
            right.push(ry + edy * half_width);
        }
        StrokeCap::Round => {
            if is_start {
                left.push(lx);
                left.push(ly);
                right.push(rx);
                right.push(ry);
                add_arc_points(
                    px,
                    py,
                    half_width,
                    (-ny).atan2(-nx),
                    ny.atan2(nx),
                    false,
                    tolerance,
                    right,
                );
            } else {
                left.push(lx);
                left.push(ly);
                add_arc_points(
                    px,
                    py,
                    half_width,
                    ny.atan2(nx),
                    (-ny).atan2(-nx),
                    true,
                    tolerance,
                    left,
                );
                right.push(rx);
                right.push(ry);
            }
        }
    }
}

fn add_join(
    px: f64,
    py: f64,
    nx0: f64,
    ny0: f64,
    nx1: f64,
    ny1: f64,
    half_width: f64,
    join: StrokeJoin,
    miter_limit: f64,
    left: &mut Vec<f64>,
    right: &mut Vec<f64>,
    tolerance: f64,
) {
    let lx0 = px + nx0 * half_width;
    let ly0 = py + ny0 * half_width;
    let rx0 = px - nx0 * half_width;
    let ry0 = py - ny0 * half_width;
    let lx1 = px + nx1 * half_width;
    let ly1 = py + ny1 * half_width;
    let rx1 = px - nx1 * half_width;
    let ry1 = py - ny1 * half_width;
    match join {
        StrokeJoin::Miter => {
            let cross = nx0 * ny1 - ny0 * nx1;
            if cross.abs() < 1e-8 {
                left.push(lx0);
                left.push(ly0);
                right.push(rx0);
                right.push(ry0);
                return;
            }
            let dx = lx1 - lx0;
            let dy = ly1 - ly0;
            let t = -(dx * nx1 + dy * ny1) / cross;
            let mx = lx0 + t * ny0;
            let my = ly0 - t * nx0;
            let miter_len = ((mx - px).powi(2) + (my - py).powi(2)).sqrt();
            if miter_len <= half_width * miter_limit {
                left.push(mx);
                left.push(my);
                right.push(px * 2.0 - mx);
                right.push(py * 2.0 - my);
            } else {
                left.push(lx0);
                left.push(ly0);
                left.push(lx1);
                left.push(ly1);
                right.push(rx0);
                right.push(ry0);
                right.push(rx1);
                right.push(ry1);
            }
        }
        StrokeJoin::Round => {
            left.push(lx0);
            left.push(ly0);
            add_arc_points(
                px,
                py,
                half_width,
                ny0.atan2(nx0),
                ny1.atan2(nx1),
                true,
                tolerance,
                left,
            );
            left.push(lx1);
            left.push(ly1);
            right.push(rx0);
            right.push(ry0);
            add_arc_points(
                px,
                py,
                half_width,
                (-ny0).atan2(-nx0),
                (-ny1).atan2(-nx1),
                false,
                tolerance,
                right,
            );
            right.push(rx1);
            right.push(ry1);
        }
        StrokeJoin::Bevel => {
            left.push(lx0);
            left.push(ly0);
            left.push(lx1);
            left.push(ly1);
            right.push(rx0);
            right.push(ry0);
            right.push(rx1);
            right.push(ry1);
        }
    }
}

fn apply_dash(points: &[f64], closed: bool, dash: &[f64], dash_offset: f64) -> Vec<DashSegment> {
    let mut result: Vec<DashSegment> = Vec::new();
    let total: f64 = dash.iter().sum();
    if total <= 0.0 {
        result.push(DashSegment {
            closed,
            points: points.to_vec(),
        });
        return result;
    }
    let offset = ((dash_offset % total) + total) % total;
    let mut dash_index = 0;
    let mut remaining = 0.0;
    let mut is_on = true;
    let mut accumulator = 0.0;
    for (index, value) in dash.iter().enumerate() {
        if accumulator + value > offset {
            dash_index = index;
            remaining = value - (offset - accumulator);
            is_on = index % 2 == 0;
            break;
        }
        accumulator += value;
    }
    let mut current: Option<Vec<f64>> = None;
    let count = points.len() / 2;
    let mut index = 0;
    while index + 1 < count {
        let x0 = points[index * 2];
        let y0 = points[index * 2 + 1];
        let x1 = points[(index + 1) * 2];
        let y1 = points[(index + 1) * 2 + 1];
        let dx = x1 - x0;
        let dy = y1 - y0;
        let segment_length = (dx * dx + dy * dy).sqrt();
        if is_on && current.is_none() {
            current = Some(vec![x0, y0]);
        }
        let mut consumed = 0.0;
        while consumed < segment_length {
            let step = remaining.min(segment_length - consumed);
            let t = (consumed + step) / segment_length;
            let ix = x0 + t * dx;
            let iy = y0 + t * dy;
            if is_on {
                let buffer = current.get_or_insert_with(|| {
                    vec![
                        x0 + (consumed / segment_length) * dx,
                        y0 + (consumed / segment_length) * dy,
                    ]
                });
                buffer.push(ix);
                buffer.push(iy);
            } else {
                if let Some(buffer) = current.take() {
                    if buffer.len() >= 4 {
                        result.push(DashSegment {
                            closed: false,
                            points: buffer,
                        });
                    }
                }
                if step >= remaining {
                    current = Some(vec![ix, iy]);
                }
            }
            consumed += step;
            remaining -= step;
            if remaining <= 1e-10 {
                dash_index = (dash_index + 1) % dash.len();
                remaining = dash[dash_index];
                is_on = dash_index % 2 == 0;
                if is_on && current.is_none() {
                    current = Some(vec![ix, iy]);
                } else if !is_on {
                    if let Some(buffer) = current.take() {
                        if buffer.len() >= 4 {
                            result.push(DashSegment {
                                closed: false,
                                points: buffer,
                            });
                        }
                    }
                }
            }
        }
        index += 1;
    }
    if let Some(buffer) = current.take() {
        if buffer.len() >= 4 {
            result.push(DashSegment {
                closed: false,
                points: buffer,
            });
        }
    }
    return result;
}

/// Converts the centerline path into fillable closed outline contours (TS `compactStrokePath`).
// flight-lint: allow(f64) D1: path coordinates, stroke widths and tolerances are the canonical f64 path lane
// flight-lint: allow(conform-params) D24: Rust &mut out-param; TS returns allocated Path
pub fn compact_stroke_path(
    out: &mut Path,
    path: &Path,
    style: &StrokeStyle,
    tolerance: Option<f64>,
) {
    let tolerance = tolerance.unwrap_or(0.25);
    let half_width = style.width / 2.0;
    out.commands.clear();
    out.data.clear();
    let subpaths = decode_subpaths(path, tolerance);
    let dash = if style.dash.is_empty() {
        None
    } else {
        Some(style.dash.as_slice())
    };
    for subpath in subpaths {
        if subpath.points.len() < 4 {
            continue;
        }
        let segments = match dash {
            Some(pattern) => {
                apply_dash(&subpath.points, subpath.closed, pattern, style.dash_offset)
            }
            None => vec![DashSegment {
                closed: subpath.closed,
                points: subpath.points.clone(),
            }],
        };
        for segment in segments {
            if segment.points.len() < 4 {
                continue;
            }
            stroke_subpath(
                &segment.points,
                segment.closed,
                half_width,
                style.join,
                style.cap,
                style.miter_limit,
                out,
                tolerance,
            );
        }
    }
}

fn decode_subpaths(path: &Path, tolerance: f64) -> Vec<StrokeSubpath> {
    let commands = &path.commands;
    let data = &path.data;
    let tolerance_sq = tolerance * tolerance;
    let mut subpaths: Vec<StrokeSubpath> = Vec::new();
    let mut current_index: Option<usize> = None;
    let mut x = 0.0;
    let mut y = 0.0;
    let mut contour_start_x = 0.0;
    let mut contour_start_y = 0.0;
    let mut data_index = 0;
    for command in commands {
        match *command {
            1 => {
                x = data[data_index];
                y = data[data_index + 1];
                data_index += 2;
                contour_start_x = x;
                contour_start_y = y;
                subpaths.push(StrokeSubpath {
                    closed: false,
                    points: vec![x, y],
                });
                current_index = Some(subpaths.len() - 1);
            }
            4 => {
                x = data[data_index + 2];
                y = data[data_index + 3];
                data_index += 4;
                contour_start_x = x;
                contour_start_y = y;
                subpaths.push(StrokeSubpath {
                    closed: false,
                    points: vec![x, y],
                });
                current_index = Some(subpaths.len() - 1);
            }
            2 => {
                if current_index.is_none() {
                    subpaths.push(StrokeSubpath {
                        closed: false,
                        points: vec![0.0, 0.0],
                    });
                    current_index = Some(subpaths.len() - 1);
                }
                x = data[data_index];
                y = data[data_index + 1];
                data_index += 2;
                if let Some(index) = current_index {
                    let subpath = &mut subpaths[index];
                    subpath.points.push(x);
                    subpath.points.push(y);
                }
            }
            5 => {
                if current_index.is_none() {
                    subpaths.push(StrokeSubpath {
                        closed: false,
                        points: vec![0.0, 0.0],
                    });
                    current_index = Some(subpaths.len() - 1);
                }
                x = data[data_index + 2];
                y = data[data_index + 3];
                data_index += 4;
                if let Some(index) = current_index {
                    let subpath = &mut subpaths[index];
                    subpath.points.push(x);
                    subpath.points.push(y);
                }
            }
            3 => {
                if current_index.is_none() {
                    subpaths.push(StrokeSubpath {
                        closed: false,
                        points: vec![0.0, 0.0],
                    });
                    current_index = Some(subpaths.len() - 1);
                }
                let (cx, cy, x1, y1) = (
                    data[data_index],
                    data[data_index + 1],
                    data[data_index + 2],
                    data[data_index + 3],
                );
                if let Some(index) = current_index {
                    let subpath = &mut subpaths[index];
                    flatten_quadratic(&mut subpath.points, x, y, cx, cy, x1, y1, tolerance_sq, 0);
                }
                x = x1;
                y = y1;
                data_index += 4;
            }
            6 => {
                if current_index.is_none() {
                    subpaths.push(StrokeSubpath {
                        closed: false,
                        points: vec![0.0, 0.0],
                    });
                    current_index = Some(subpaths.len() - 1);
                }
                let (c1x, c1y, c2x, c2y, x1, y1) = (
                    data[data_index],
                    data[data_index + 1],
                    data[data_index + 2],
                    data[data_index + 3],
                    data[data_index + 4],
                    data[data_index + 5],
                );
                if let Some(index) = current_index {
                    let subpath = &mut subpaths[index];
                    flatten_cubic(
                        &mut subpath.points,
                        x,
                        y,
                        c1x,
                        c1y,
                        c2x,
                        c2y,
                        x1,
                        y1,
                        tolerance_sq,
                        0,
                    );
                }
                x = x1;
                y = y1;
                data_index += 6;
            }
            7 => {
                if let Some(index) = current_index {
                    let subpath = &mut subpaths[index];
                    subpath.closed = true;
                }
                x = contour_start_x;
                y = contour_start_y;
                current_index = None;
            }
            _ => {}
        }
    }
    return subpaths;
}

fn dist_chord_sq(px: f64, py: f64, x0: f64, y0: f64, x1: f64, y1: f64) -> f64 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0.0 {
        let ax = px - x0;
        let ay = py - y0;
        return ax * ax + ay * ay;
    }
    let cross = dx * (y0 - py) - dy * (x0 - px);
    return (cross * cross) / len_sq;
}

#[allow(clippy::too_many_arguments)]
fn flatten_cubic(
    out: &mut Vec<f64>,
    x0: f64,
    y0: f64,
    c1x: f64,
    c1y: f64,
    c2x: f64,
    c2y: f64,
    x1: f64,
    y1: f64,
    tolerance_sq: f64,
    depth: u32,
) {
    let d1 = dist_chord_sq(c1x, c1y, x0, y0, x1, y1);
    let d2 = dist_chord_sq(c2x, c2y, x0, y0, x1, y1);
    if depth >= MAX_SUBDIVISION_DEPTH || (d1 <= tolerance_sq && d2 <= tolerance_sq) {
        out.push(x1);
        out.push(y1);
        return;
    }
    let x01 = (x0 + c1x) / 2.0;
    let y01 = (y0 + c1y) / 2.0;
    let x12 = (c1x + c2x) / 2.0;
    let y12 = (c1y + c2y) / 2.0;
    let x23 = (c2x + x1) / 2.0;
    let y23 = (c2y + y1) / 2.0;
    let x012 = (x01 + x12) / 2.0;
    let y012 = (y01 + y12) / 2.0;
    let x123 = (x12 + x23) / 2.0;
    let y123 = (y12 + y23) / 2.0;
    let xm = (x012 + x123) / 2.0;
    let ym = (y012 + y123) / 2.0;
    flatten_cubic(
        out,
        x0,
        y0,
        x01,
        y01,
        x012,
        y012,
        xm,
        ym,
        tolerance_sq,
        depth + 1,
    );
    flatten_cubic(
        out,
        xm,
        ym,
        x123,
        y123,
        x23,
        y23,
        x1,
        y1,
        tolerance_sq,
        depth + 1,
    );
}

#[allow(clippy::too_many_arguments)]
fn flatten_quadratic(
    out: &mut Vec<f64>,
    x0: f64,
    y0: f64,
    cx: f64,
    cy: f64,
    x1: f64,
    y1: f64,
    tolerance_sq: f64,
    depth: u32,
) {
    let dist_sq = dist_chord_sq(cx, cy, x0, y0, x1, y1);
    if depth >= MAX_SUBDIVISION_DEPTH || dist_sq <= tolerance_sq {
        out.push(x1);
        out.push(y1);
        return;
    }
    let x01 = (x0 + cx) / 2.0;
    let y01 = (y0 + cy) / 2.0;
    let x12 = (cx + x1) / 2.0;
    let y12 = (cy + y1) / 2.0;
    let xm = (x01 + x12) / 2.0;
    let ym = (y01 + y12) / 2.0;
    flatten_quadratic(out, x0, y0, x01, y01, xm, ym, tolerance_sq, depth + 1);
    flatten_quadratic(out, xm, ym, x12, y12, x1, y1, tolerance_sq, depth + 1);
}

#[allow(clippy::too_many_arguments)]
fn stroke_subpath(
    points: &[f64],
    closed: bool,
    half_width: f64,
    join: StrokeJoin,
    cap: StrokeCap,
    miter_limit: f64,
    out: &mut Path,
    tolerance: f64,
) {
    let count = points.len() / 2;
    if count < 2 {
        return;
    }
    let mut left: Vec<f64> = Vec::new();
    let mut right: Vec<f64> = Vec::new();
    let mut normals = vec![0.0f64; (count - 1) * 2];
    let mut index = 0;
    while index + 1 < count {
        let dx = points[(index + 1) * 2] - points[index * 2];
        let dy = points[(index + 1) * 2 + 1] - points[index * 2 + 1];
        let len = (dx * dx + dy * dy).sqrt();
        if len > 0.0 {
            normals[index * 2] = -dy / len;
            normals[index * 2 + 1] = dx / len;
        } else if index > 0 {
            normals[index * 2] = normals[(index - 1) * 2];
            normals[index * 2 + 1] = normals[(index - 1) * 2 + 1];
        } else {
            normals[0] = 0.0;
            normals[1] = 1.0;
        }
        index += 1;
    }
    if closed {
        let mut i = 0;
        while i < count - 1 {
            let previous = (i + count - 2) % (count - 1);
            add_join(
                points[i * 2],
                points[i * 2 + 1],
                normals[previous * 2],
                normals[previous * 2 + 1],
                normals[i * 2],
                normals[i * 2 + 1],
                half_width,
                join,
                miter_limit,
                &mut left,
                &mut right,
                tolerance,
            );
            i += 1;
        }
    } else {
        add_cap(
            points[0],
            points[1],
            normals[0],
            normals[1],
            -normals[1],
            normals[0],
            half_width,
            cap,
            &mut left,
            &mut right,
            tolerance,
            true,
        );
        let mut i = 1;
        while i + 1 < count {
            add_join(
                points[i * 2],
                points[i * 2 + 1],
                normals[(i - 1) * 2],
                normals[(i - 1) * 2 + 1],
                normals[i * 2],
                normals[i * 2 + 1],
                half_width,
                join,
                miter_limit,
                &mut left,
                &mut right,
                tolerance,
            );
            i += 1;
        }
        let last = (count - 2) * 2;
        add_cap(
            points[(count - 1) * 2],
            points[(count - 1) * 2 + 1],
            normals[last],
            normals[last + 1],
            normals[last + 1],
            -normals[last],
            half_width,
            cap,
            &mut left,
            &mut right,
            tolerance,
            false,
        );
    }
    if left.len() < 4 {
        return;
    }
    out.commands.push(PathCommand::MoveTo as u8);
    out.data.push(left[0]);
    out.data.push(left[1]);
    let mut index = 2;
    while index < left.len() {
        out.commands.push(PathCommand::LineTo as u8);
        out.data.push(left[index]);
        out.data.push(left[index + 1]);
        index += 2;
    }
    let mut index = right.len();
    while index >= 2 {
        index -= 2;
        out.commands.push(PathCommand::LineTo as u8);
        out.data.push(right[index]);
        out.data.push(right[index + 1]);
    }
    out.commands.push(PathCommand::Close as u8);
}
