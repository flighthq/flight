use std::collections::HashSet;

use flight_path::{flatten_path, Path};

use crate::martinez_kernel::{PathBooleanFillRule, PathBooleanKernel};
use crate::resolve_path_regions::resolve_path_regions;

const DEFAULT_ARC_TOLERANCE: f64 = 0.25;
const DEFAULT_MITER_LIMIT: f64 = 2.0;
const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;
const HALF_PI: f64 = std::f64::consts::FRAC_PI_2;
const POINT_EPS: f64 = 1e-9;
const POINT_EPS_RELATIVE: f64 = 1e-9;
const PARALLEL_EPS: f64 = 1e-12;
const TWO_PI: f64 = std::f64::consts::PI * 2.0;

/// Join style for the convex side of offset path corners.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathOffsetJoin {
    Bevel,
    Miter,
    Round,
    Square,
}

/// End cap style for open path terminals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathOffsetEnd {
    Butt,
    Round,
    Square,
}

/// Options controlling the offset path operation.
#[derive(Debug, Clone)]
pub struct PathOffsetOptions {
    pub join: Option<PathOffsetJoin>,
    pub end: Option<PathOffsetEnd>,
    pub miter_limit: Option<f64>,
    pub tolerance: Option<f64>,
    pub arc_tolerance: Option<f64>,
}

impl Default for PathOffsetOptions {
    fn default() -> Self {
        return PathOffsetOptions {
            join: None,
            end: None,
            miter_limit: None,
            tolerance: None,
            arc_tolerance: None,
        };
    }
}

/// Offsets a path outward (positive `delta`, inflate) or inward (negative `delta`,
/// deflate) by a signed distance. The input is flattened to polygon contours;
/// closed contours are offset into grown/shrunk rings and open contours are offset
/// into closed slab outlines with end caps. Corner style is controlled by
/// `options.join`; open-path terminals by `options.end`. The raw offset rings are
/// then self-unioned under positive fill to resolve self-overlap, merge touching
/// rings, and emit a clean, hole-correct outline.
///
/// Alias-safe: the input path is fully captured (flattened) before any write to `out`.
pub fn offset_path(
    out: &mut Path,
    kernel: &PathBooleanKernel,
    path: &Path,
    delta: f64,
    options: Option<&PathOffsetOptions>,
) {
    let join = options
        .and_then(|o| o.join)
        .unwrap_or(PathOffsetJoin::Miter);
    let end = options
        .and_then(|o| o.end)
        .unwrap_or(PathOffsetEnd::Butt);
    let miter_limit = options
        .and_then(|o| o.miter_limit)
        .unwrap_or(DEFAULT_MITER_LIMIT);
    let arc_tolerance = options
        .and_then(|o| o.arc_tolerance)
        .unwrap_or(DEFAULT_ARC_TOLERANCE);
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let contours = flatten_path(path, Some(tolerance));
    let point_eps_sq = get_contour_point_eps(&contours).powi(2);

    let mut raw_rings: Vec<Vec<f64>> = Vec::new();
    for contour in &contours {
        let closed = is_closed_contour(contour, point_eps_sq);
        let vertices = get_clean_contour_vertices(contour, closed, point_eps_sq);
        if closed {
            if vertices.len() < 6 {
                continue;
            }
            let orientation = get_ring_orientation_sign(&vertices);
            let no_caps: HashSet<usize> = HashSet::new();
            let ring = build_offset_ring(
                &vertices,
                delta * orientation as f64,
                &no_caps,
                join,
                end,
                miter_limit,
                arc_tolerance,
            );
            if ring.len() < 6 {
                continue;
            }
            let offset_area = get_ring_signed_area(&ring);
            let inverted = offset_area.signum() as i32 != orientation;
            let not_reduced =
                delta < 0.0 && offset_area.abs() >= get_ring_signed_area(&vertices).abs();
            if inverted || not_reduced {
                continue;
            }
            if offset_area < 0.0 {
                raw_rings.push(reverse_vertex_loop(&ring));
            } else {
                raw_rings.push(ring);
            }
        } else {
            if vertices.len() < 4 {
                continue;
            }
            let count = vertices.len() / 2;
            let mut caps: HashSet<usize> = HashSet::new();
            caps.insert(0);
            caps.insert(count - 1);
            let loop_verts = get_open_contour_loop(&vertices);
            let ring = build_offset_ring(
                &loop_verts,
                delta.abs(),
                &caps,
                join,
                end,
                miter_limit,
                arc_tolerance,
            );
            if ring.len() >= 6 {
                if get_ring_signed_area(&ring) < 0.0 {
                    raw_rings.push(reverse_vertex_loop(&ring));
                } else {
                    raw_rings.push(ring);
                }
            }
        }
    }

    resolve_path_regions(out, kernel, &raw_rings, PathBooleanFillRule::Positive);
}

fn build_offset_ring(
    vertices: &[f64],
    signed_delta: f64,
    cap_indices: &HashSet<usize>,
    join: PathOffsetJoin,
    end: PathOffsetEnd,
    miter_limit: f64,
    arc_tolerance: f64,
) -> Vec<f64> {
    let count = vertices.len() / 2;
    let mut dir_x: Vec<f64> = vec![0.0; count];
    let mut dir_y: Vec<f64> = vec![0.0; count];
    let mut normal_x: Vec<f64> = vec![0.0; count];
    let mut normal_y: Vec<f64> = vec![0.0; count];
    for k in 0..count {
        let kn = (k + 1) % count;
        let dx = vertices[2 * kn] - vertices[2 * k];
        let dy = vertices[2 * kn + 1] - vertices[2 * k + 1];
        let length = (dx * dx + dy * dy).sqrt();
        let inverse = if length > 0.0 { 1.0 / length } else { 0.0 };
        dir_x[k] = dx * inverse;
        dir_y[k] = dy * inverse;
        normal_x[k] = dir_y[k];
        normal_y[k] = -dir_x[k];
    }

    let mut ring: Vec<f64> = Vec::new();
    for k in 0..count {
        let previous = (k + count - 1) % count;
        let vx = vertices[2 * k];
        let vy = vertices[2 * k + 1];
        let previous_end_x = vx + signed_delta * normal_x[previous];
        let previous_end_y = vy + signed_delta * normal_y[previous];
        let this_start_x = vx + signed_delta * normal_x[k];
        let this_start_y = vy + signed_delta * normal_y[k];
        if cap_indices.contains(&k) {
            emit_offset_end_cap(
                &mut ring,
                vx,
                vy,
                previous_end_x,
                previous_end_y,
                this_start_x,
                this_start_y,
                dir_x[previous],
                dir_y[previous],
                dir_x[k],
                dir_y[k],
                signed_delta.abs(),
                end,
                arc_tolerance,
            );
        } else {
            emit_offset_join(
                &mut ring,
                vx,
                vy,
                previous_end_x,
                previous_end_y,
                this_start_x,
                this_start_y,
                dir_x[previous],
                dir_y[previous],
                dir_x[k],
                dir_y[k],
                signed_delta,
                join,
                miter_limit,
                arc_tolerance,
            );
        }
    }
    return ring;
}

fn emit_offset_end_cap(
    ring: &mut Vec<f64>,
    vx: f64,
    vy: f64,
    previous_end_x: f64,
    previous_end_y: f64,
    this_start_x: f64,
    this_start_y: f64,
    previous_dir_x: f64,
    previous_dir_y: f64,
    this_dir_x: f64,
    this_dir_y: f64,
    radius: f64,
    end: PathOffsetEnd,
    arc_tolerance: f64,
) {
    ring.push(previous_end_x);
    ring.push(previous_end_y);
    match end {
        PathOffsetEnd::Square => {
            ring.push(previous_end_x + radius * previous_dir_x);
            ring.push(previous_end_y + radius * previous_dir_y);
            ring.push(this_start_x - radius * this_dir_x);
            ring.push(this_start_y - radius * this_dir_y);
        }
        PathOffsetEnd::Round => {
            let start_angle =
                (previous_end_y - vy).atan2(previous_end_x - vx);
            let mid_x = (start_angle + HALF_PI).cos();
            let mid_y = (start_angle + HALF_PI).sin();
            let sweep = if mid_x * previous_dir_x + mid_y * previous_dir_y >= 0.0 {
                1.0
            } else {
                -1.0
            } * std::f64::consts::PI;
            push_offset_arc(ring, vx, vy, radius, start_angle, sweep, arc_tolerance);
        }
        PathOffsetEnd::Butt => {}
    }
    ring.push(this_start_x);
    ring.push(this_start_y);
}

fn emit_offset_join(
    ring: &mut Vec<f64>,
    vx: f64,
    vy: f64,
    previous_end_x: f64,
    previous_end_y: f64,
    this_start_x: f64,
    this_start_y: f64,
    previous_dir_x: f64,
    previous_dir_y: f64,
    this_dir_x: f64,
    this_dir_y: f64,
    signed_delta: f64,
    join: PathOffsetJoin,
    miter_limit: f64,
    arc_tolerance: f64,
) {
    ring.push(previous_end_x);
    ring.push(previous_end_y);
    let turn = previous_dir_x * this_dir_y - previous_dir_y * this_dir_x;
    let convex = turn * signed_delta > 0.0;
    if !convex {
        if turn.abs() > PARALLEL_EPS {
            let advance = ((this_start_x - previous_end_x) * this_dir_y
                - (this_start_y - previous_end_y) * this_dir_x)
                / turn;
            ring.push(previous_end_x + advance * previous_dir_x);
            ring.push(previous_end_y + advance * previous_dir_y);
        }
    } else {
        match join {
            PathOffsetJoin::Miter => {
                if turn.abs() > PARALLEL_EPS {
                    let advance = ((this_start_x - previous_end_x) * this_dir_y
                        - (this_start_y - previous_end_y) * this_dir_x)
                        / turn;
                    let apex_x = previous_end_x + advance * previous_dir_x;
                    let apex_y = previous_end_y + advance * previous_dir_y;
                    let miter_length =
                        ((apex_x - vx) * (apex_x - vx) + (apex_y - vy) * (apex_y - vy)).sqrt();
                    if miter_length <= miter_limit * signed_delta.abs() {
                        ring.push(apex_x);
                        ring.push(apex_y);
                    }
                }
            }
            PathOffsetJoin::Square => {
                let radius = signed_delta.abs();
                ring.push(previous_end_x + radius * previous_dir_x);
                ring.push(previous_end_y + radius * previous_dir_y);
                ring.push(this_start_x - radius * this_dir_x);
                ring.push(this_start_y - radius * this_dir_y);
            }
            PathOffsetJoin::Round => {
                let radius = signed_delta.abs();
                let start_angle =
                    (previous_end_y - vy).atan2(previous_end_x - vx);
                let end_angle =
                    (this_start_y - vy).atan2(this_start_x - vx);
                push_offset_arc(
                    ring,
                    vx,
                    vy,
                    radius,
                    start_angle,
                    get_short_sweep(start_angle, end_angle),
                    arc_tolerance,
                );
            }
            PathOffsetJoin::Bevel => {}
        }
    }
    ring.push(this_start_x);
    ring.push(this_start_y);
}

fn get_clean_contour_vertices(
    contour: &[f64],
    closed: bool,
    point_eps_sq: f64,
) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();
    let mut i = 0;
    while i < contour.len() {
        let x = contour[i];
        let y = contour[i + 1];
        if out.len() >= 2 {
            let dx = x - out[out.len() - 2];
            let dy = y - out[out.len() - 1];
            if dx * dx + dy * dy <= point_eps_sq {
                i += 2;
                continue;
            }
        }
        out.push(x);
        out.push(y);
        i += 2;
    }
    if closed && out.len() >= 4 {
        let dx = out[0] - out[out.len() - 2];
        let dy = out[1] - out[out.len() - 1];
        if dx * dx + dy * dy <= point_eps_sq {
            out.truncate(out.len() - 2);
        }
    }
    return out;
}

fn get_contour_point_eps(contours: &[Vec<f64>]) -> f64 {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for contour in contours {
        let mut i = 0;
        while i < contour.len() {
            let x = contour[i];
            let y = contour[i + 1];
            if x < min_x { min_x = x; }
            if x > max_x { max_x = x; }
            if y < min_y { min_y = y; }
            if y > max_y { max_y = y; }
            i += 2;
        }
    }
    let extent = f64::max(max_x - min_x, max_y - min_y);
    return if extent > 0.0 { extent * POINT_EPS_RELATIVE } else { POINT_EPS };
}

fn get_open_contour_loop(vertices: &[f64]) -> Vec<f64> {
    let count = vertices.len() / 2;
    let mut result = vertices.to_vec();
    let mut k = count as i64 - 2;
    while k >= 1 {
        result.push(vertices[2 * k as usize]);
        result.push(vertices[2 * k as usize + 1]);
        k -= 1;
    }
    return result;
}

fn get_ring_orientation_sign(vertices: &[f64]) -> i32 {
    let sign = get_ring_signed_area(vertices);
    if sign > 0.0 {
        return 1;
    }
    if sign < 0.0 {
        return -1;
    }
    return 1;
}

fn get_ring_signed_area(vertices: &[f64]) -> f64 {
    let mut area: f64 = 0.0;
    let count = vertices.len() / 2;
    for k in 0..count {
        let kn = (k + 1) % count;
        area += vertices[2 * k] * vertices[2 * kn + 1] - vertices[2 * kn] * vertices[2 * k + 1];
    }
    return area * 0.5;
}

fn get_short_sweep(start_angle: f64, end_angle: f64) -> f64 {
    let mut sweep = end_angle - start_angle;
    while sweep <= -std::f64::consts::PI {
        sweep += TWO_PI;
    }
    while sweep > std::f64::consts::PI {
        sweep -= TWO_PI;
    }
    return sweep;
}

fn is_closed_contour(contour: &[f64], point_eps_sq: f64) -> bool {
    let n = contour.len();
    if n < 6 {
        return false;
    }
    let dx = contour[0] - contour[n - 2];
    let dy = contour[1] - contour[n - 1];
    return dx * dx + dy * dy <= point_eps_sq;
}

fn push_offset_arc(
    ring: &mut Vec<f64>,
    cx: f64,
    cy: f64,
    radius: f64,
    start_angle: f64,
    sweep: f64,
    arc_tolerance: f64,
) {
    let max_angle = if arc_tolerance > 0.0 && arc_tolerance < radius {
        2.0 * (1.0 - arc_tolerance / radius).acos()
    } else {
        std::f64::consts::PI
    };
    let steps = 1.max((sweep.abs() / max_angle).ceil() as usize);
    for i in 1..steps {
        let angle = start_angle + sweep * (i as f64 / steps as f64);
        ring.push(cx + radius * angle.cos());
        ring.push(cy + radius * angle.sin());
    }
}

fn reverse_vertex_loop(vertices: &[f64]) -> Vec<f64> {
    let count = vertices.len() / 2;
    let mut out = vec![0.0; vertices.len()];
    out[0] = vertices[0];
    out[1] = vertices[1];
    for k in 1..count {
        let source = count - k;
        out[2 * k] = vertices[2 * source];
        out[2 * k + 1] = vertices[2 * source + 1];
    }
    return out;
}
