use crate::path::{Path, StrokeCap, StrokeJoin, StrokeStyle, StrokePathTessellationReason};
use crate::flatten_path::flatten_path;

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
const GEOMETRY_EPSILON: f64 = 1e-8;

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
pub struct StrokePathPieceGeometry {
    pub closed: bool,
    pub end_cap: Vec<f64>,
    pub left: Vec<f64>,
    pub right: Vec<f64>,
    pub start_cap: Vec<f64>,
}

pub struct StrokePathGeometry {
    pub issue: StrokePathTessellationReason,
    pub issue_subpath: Option<usize>,
    pub pieces: Vec<StrokePathPieceGeometry>,
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
struct StrokeSubpath {
    closed: bool,
    points: Vec<f64>,
    source_index: usize,
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
struct SegmentFrame {
    nx: f64,
    ny: f64,
    tx: f64,
    ty: f64,
}

struct BuildResult {
    issue: StrokePathTessellationReason,
    piece: Option<StrokePathPieceGeometry>,
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn create_arc_interior_points(cx: f64, cy: f64, radius: f64, start_angle: f64, sweep: f64, tolerance: f64) -> Vec<f64> {
    let points = create_arc_points(cx, cy, radius, start_angle, sweep, tolerance);
    if points.len() <= 4 {
        return Vec::new();
    }
    return points[2..points.len() - 2].to_vec();
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn create_arc_points(cx: f64, cy: f64, radius: f64, start_angle: f64, sweep: f64, tolerance: f64) -> Vec<f64> {
    let ratio = (1.0 - tolerance / radius).max(-1.0).min(1.0);
    let max_step = (std::f64::consts::PI / 32.0).max(2.0 * ratio.acos());
    let steps = 1.max((sweep.abs() / max_step).ceil() as usize);
    let mut points: Vec<f64> = Vec::new();
    for i in 0..=steps {
        let angle = start_angle + (sweep * i as f64) / steps as f64;
        points.push(cx + angle.cos() * radius);
        points.push(cy + angle.sin() * radius);
    }
    return points;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn create_stroke_subpaths(path: &Path, tolerance: f64) -> Vec<StrokeSubpath> {
    let contours = flatten_path(path, Some(tolerance));
    let mut result: Vec<StrokeSubpath> = Vec::new();
    for i in 0..contours.len() {
        let points = remove_consecutive_duplicates(&contours[i]);
        if points.len() < 4 {
            continue;
        }
        let last = points.len() - 2;
        let closed = points.len() >= 8
            && approximately_equal(points[0], points[last])
            && approximately_equal(points[1], points[last + 1]);
        let mut pts = points;
        if closed {
            pts[last] = pts[0];
            pts[last + 1] = pts[1];
        }
        result.push(StrokeSubpath { closed, points: pts, source_index: i });
    }
    return result;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_endpoint_section(
    piece: &mut StrokePathPieceGeometry,
    px: f64, py: f64,
    frame: &SegmentFrame,
    half_width: f64,
    cap: StrokeCap,
    start: bool,
    tolerance: f64,
) {
    let extension = if cap == StrokeCap::Square {
        if start { -half_width } else { half_width }
    } else { 0.0 };
    let cx = px + frame.tx * extension;
    let cy = py + frame.ty * extension;
    append_section(piece, cx + frame.nx * half_width, cy + frame.ny * half_width, cx - frame.nx * half_width, cy - frame.ny * half_width);
    if cap != StrokeCap::Round {
        return;
    }
    if start {
        piece.start_cap = create_arc_interior_points(px, py, half_width, (-frame.ny).atan2(-frame.nx), -std::f64::consts::PI, tolerance);
    } else {
        piece.end_cap = create_arc_interior_points(px, py, half_width, frame.ny.atan2(frame.nx), -std::f64::consts::PI, tolerance);
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_join_sections(
    piece: &mut StrokePathPieceGeometry,
    px: f64, py: f64,
    previous: &SegmentFrame,
    next: &SegmentFrame,
    half_width: f64,
    join: StrokeJoin,
    miter_limit: f64,
    tolerance: f64,
) -> StrokePathTessellationReason {
    let turn = cross(previous.tx, previous.ty, next.tx, next.ty);
    let direction = previous.tx * next.tx + previous.ty * next.ty;
    if turn.abs() <= GEOMETRY_EPSILON {
        if direction < 0.0 {
            return StrokePathTessellationReason::ReversingJoin;
        }
        append_section(piece, px + next.nx * half_width, py + next.ny * half_width, px - next.nx * half_width, py - next.ny * half_width);
        return StrokePathTessellationReason::Ok;
    }

    let left0x = px + previous.nx * half_width;
    let left0y = py + previous.ny * half_width;
    let left1x = px + next.nx * half_width;
    let left1y = py + next.ny * half_width;
    let right0x = px - previous.nx * half_width;
    let right0y = py - previous.ny * half_width;
    let right1x = px - next.nx * half_width;
    let right1y = py - next.ny * half_width;
    let left_intersection = intersect_lines(left0x, left0y, previous.tx, previous.ty, left1x, left1y, next.tx, next.ty);
    let right_intersection = intersect_lines(right0x, right0y, previous.tx, previous.ty, right1x, right1y, next.tx, next.ty);
    if left_intersection.is_none() || right_intersection.is_none() {
        return StrokePathTessellationReason::ReversingJoin;
    }
    let left_int = left_intersection.unwrap();
    let right_int = right_intersection.unwrap();

    let outer_intersection = if turn > 0.0 { right_int } else { left_int };
    let outer_distance = ((outer_intersection.0 - px).powi(2) + (outer_intersection.1 - py).powi(2)).sqrt();
    if join == StrokeJoin::Miter && miter_limit.is_finite() && outer_distance <= half_width * miter_limit.max(0.0) {
        append_section(piece, left_int.0, left_int.1, right_int.0, right_int.1);
        return StrokePathTessellationReason::Ok;
    }

    let inner = if turn > 0.0 { left_int } else { right_int };
    if join == StrokeJoin::Round {
        let outer0x = if turn > 0.0 { right0x } else { left0x };
        let outer0y = if turn > 0.0 { right0y } else { left0y };
        let outer_start_angle = (outer0y - py).atan2(outer0x - px);
        let sweep = signed_join_sweep(previous, next, turn);
        let outer = create_arc_points(px, py, half_width, outer_start_angle, sweep, tolerance);
        let mut i = 0;
        while i < outer.len() {
            if turn > 0.0 {
                append_section(piece, inner.0, inner.1, outer[i], outer[i + 1]);
            } else {
                append_section(piece, outer[i], outer[i + 1], inner.0, inner.1);
            }
            i += 2;
        }
    } else if turn > 0.0 {
        append_section(piece, inner.0, inner.1, right0x, right0y);
        append_section(piece, inner.0, inner.1, right1x, right1y);
    } else {
        append_section(piece, left0x, left0y, inner.0, inner.1);
        append_section(piece, left1x, left1y, inner.0, inner.1);
    }
    return StrokePathTessellationReason::Ok;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_section(piece: &mut StrokePathPieceGeometry, lx: f64, ly: f64, rx: f64, ry: f64) {
    piece.left.push(lx);
    piece.left.push(ly);
    piece.right.push(rx);
    piece.right.push(ry);
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn apply_dash(subpath: &StrokeSubpath, dash: &[f64], dash_offset: f64) -> Vec<StrokeSubpath> {
    let pattern: Vec<f64> = if dash.len() % 2 == 0 {
        dash.to_vec()
    } else {
        let mut p = dash.to_vec();
        p.extend_from_slice(dash);
        p
    };
    let total: f64 = pattern.iter().sum();
    if total <= GEOMETRY_EPSILON {
        return vec![StrokeSubpath {
            closed: subpath.closed,
            points: subpath.points.clone(),
            source_index: subpath.source_index,
        }];
    }

    let offset = ((dash_offset % total) + total) % total;
    let mut pattern_index: usize = 0;
    let mut consumed_offset = offset;
    loop {
        if pattern[pattern_index] > GEOMETRY_EPSILON && consumed_offset < pattern[pattern_index] {
            break;
        }
        if pattern[pattern_index] > GEOMETRY_EPSILON {
            consumed_offset -= pattern[pattern_index];
        }
        pattern_index = (pattern_index + 1) % pattern.len();
    }
    let mut remaining = pattern[pattern_index] - consumed_offset;
    let mut on = pattern_index % 2 == 0;
    let mut result: Vec<StrokeSubpath> = Vec::new();
    let mut current: Option<Vec<f64>> = None;
    let points = &subpath.points;
    let seg_count = points.len() / 2 - 1;
    for segment in 0..seg_count {
        let x0 = points[segment * 2];
        let y0 = points[segment * 2 + 1];
        let x1 = points[(segment + 1) * 2];
        let y1 = points[(segment + 1) * 2 + 1];
        let dx = x1 - x0;
        let dy = y1 - y0;
        let length = (dx * dx + dy * dy).sqrt();
        let mut distance: f64 = 0.0;
        while distance < length - GEOMETRY_EPSILON {
            while remaining <= GEOMETRY_EPSILON {
                pattern_index = (pattern_index + 1) % pattern.len();
                remaining = pattern[pattern_index];
                on = pattern_index % 2 == 0;
                if !on {
                    if let Some(c) = current.take() {
                        push_dash(&mut result, c, subpath.source_index);
                    }
                }
            }
            let step = remaining.min(length - distance);
            let start_x = x0 + (dx * distance) / length;
            let start_y = y0 + (dy * distance) / length;
            distance += step;
            let end_x = x0 + (dx * distance) / length;
            let end_y = y0 + (dy * distance) / length;
            if on {
                if current.is_none() {
                    current = Some(vec![start_x, start_y]);
                }
                current.as_mut().unwrap().push(end_x);
                current.as_mut().unwrap().push(end_y);
            } else if let Some(c) = current.take() {
                push_dash(&mut result, c, subpath.source_index);
            }
            remaining -= step;
        }
    }
    if let Some(c) = current {
        push_dash(&mut result, c, subpath.source_index);
    }
    return result;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn approximately_equal(a: f64, b: f64) -> bool {
    return (a - b).abs() <= GEOMETRY_EPSILON;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn are_finite_points(points: &[f64]) -> bool {
    for i in 0..points.len() {
        if !points[i].is_finite() { return false; }
    }
    return true;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Shared stroke kernel used by both strokePath and tessellateStrokePath.
pub fn build_stroke_path_geometry(
    path: &Path,
    style: &StrokeStyle,
    tolerance: f64,
) -> StrokePathGeometry {
    let width = style.width;
    let dash_offset = style.dash_offset;
    let miter_limit = style.miter_limit;
    if !width.is_finite() || width <= 0.0
        || !tolerance.is_finite() || tolerance <= 0.0
        || !dash_offset.is_finite()
        || !miter_limit.is_finite() || miter_limit < 0.0
    {
        return StrokePathGeometry {
            issue: StrokePathTessellationReason::InvalidStyle,
            issue_subpath: None,
            pieces: Vec::new(),
        };
    }
    let dash = &style.dash;
    for i in 0..dash.len() {
        if !dash[i].is_finite() || dash[i] < 0.0 {
            return StrokePathGeometry {
                issue: StrokePathTessellationReason::InvalidStyle,
                issue_subpath: None,
                pieces: Vec::new(),
            };
        }
    }

    let source = create_stroke_subpaths(path, tolerance);
    for i in 0..source.len() {
        if !are_finite_points(&source[i].points) {
            return StrokePathGeometry {
                issue: StrokePathTessellationReason::InvalidPath,
                issue_subpath: Some(source[i].source_index),
                pieces: Vec::new(),
            };
        }
    }
    let centerline_intersection = find_centerline_intersection(&source);
    let mut issue = if centerline_intersection.is_none() {
        StrokePathTessellationReason::Ok
    } else {
        StrokePathTessellationReason::SelfIntersectingCenterline
    };
    let mut issue_subpath = centerline_intersection;

    let mut pieces: Vec<StrokePathPieceGeometry> = Vec::new();
    let half_width = width / 2.0;
    let cap = style.cap;
    let join = style.join;
    for i in 0..source.len() {
        let subpath = &source[i];
        let spans = if !dash.is_empty() {
            apply_dash(subpath, dash, dash_offset)
        } else {
            vec![StrokeSubpath {
                closed: subpath.closed,
                points: subpath.points.clone(),
                source_index: subpath.source_index,
            }]
        };
        for j in 0..spans.len() {
            let built = build_stroke_piece(&spans[j], half_width, join, cap, miter_limit, tolerance);
            if let Some(piece) = built.piece {
                if issue == StrokePathTessellationReason::Ok && has_invalid_outline(&piece) {
                    issue = StrokePathTessellationReason::SelfIntersectingOutline;
                    issue_subpath = Some(subpath.source_index);
                }
                pieces.push(piece);
            }
            if issue == StrokePathTessellationReason::Ok && built.issue != StrokePathTessellationReason::Ok {
                issue = built.issue;
                issue_subpath = Some(subpath.source_index);
            }
        }
    }

    return StrokePathGeometry { issue, issue_subpath, pieces };
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn build_stroke_piece(
    subpath: &StrokeSubpath,
    half_width: f64,
    join: StrokeJoin,
    cap: StrokeCap,
    miter_limit: f64,
    tolerance: f64,
) -> BuildResult {
    let points = &subpath.points;
    let point_count = points.len() / 2;
    let segment_count = point_count - 1;
    if segment_count < 1 {
        return BuildResult { issue: StrokePathTessellationReason::Ok, piece: None };
    }

    let mut frames: Vec<SegmentFrame> = Vec::new();
    for i in 0..segment_count {
        let x0 = points[i * 2];
        let y0 = points[i * 2 + 1];
        let dx = points[(i + 1) * 2] - x0;
        let dy = points[(i + 1) * 2 + 1] - y0;
        let length = (dx * dx + dy * dy).sqrt();
        if length <= GEOMETRY_EPSILON {
            continue;
        }
        let tx = dx / length;
        let ty = dy / length;
        frames.push(SegmentFrame { nx: -ty, ny: tx, tx, ty });
    }
    if frames.len() != segment_count {
        return BuildResult { issue: StrokePathTessellationReason::InvalidPath, piece: None };
    }

    let mut piece = StrokePathPieceGeometry {
        closed: subpath.closed,
        end_cap: Vec::new(),
        left: Vec::new(),
        right: Vec::new(),
        start_cap: Vec::new(),
    };

    if !subpath.closed {
        append_endpoint_section(&mut piece, points[0], points[1], &frames[0], half_width, cap, true, tolerance);
        for i in 1..point_count - 1 {
            let issue = append_join_sections(
                &mut piece,
                points[i * 2], points[i * 2 + 1],
                &frames[i - 1], &frames[i],
                half_width, join, miter_limit, tolerance,
            );
            if issue != StrokePathTessellationReason::Ok {
                return BuildResult { issue, piece: Some(piece) };
            }
        }
        append_endpoint_section(
            &mut piece,
            points[(point_count - 1) * 2], points[(point_count - 1) * 2 + 1],
            &frames[frames.len() - 1],
            half_width, cap, false, tolerance,
        );
    } else {
        let unique_point_count = point_count - 1;
        for i in 0..unique_point_count {
            let issue = append_join_sections(
                &mut piece,
                points[i * 2], points[i * 2 + 1],
                &frames[(i + frames.len() - 1) % frames.len()],
                &frames[i],
                half_width, join, miter_limit, tolerance,
            );
            if issue != StrokePathTessellationReason::Ok {
                return BuildResult { issue, piece: Some(piece) };
            }
        }
    }
    return BuildResult { issue: StrokePathTessellationReason::Ok, piece: Some(piece) };
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn cross(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    return ax * by - ay * bx;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn do_polylines_intersect(a: &[f64], a_closed: bool, b: &[f64], b_closed: bool) -> bool {
    let a_count = get_polyline_point_count(a, a_closed);
    let b_count = get_polyline_point_count(b, b_closed);
    let a_segments = if a_closed { a_count } else { a_count - 1 };
    let b_segments = if b_closed { b_count } else { b_count - 1 };
    for i in 0..a_segments {
        let i_next = (i + 1) % a_count;
        if same_point(a, i, i_next) { continue; }
        for j in 0..b_segments {
            let j_next = (j + 1) % b_count;
            if same_point(b, j, j_next) { continue; }
            if segments_intersect(a, i, i_next, b, j, j_next) { return true; }
        }
    }
    return false;
}

fn find_centerline_intersection(subpaths: &[StrokeSubpath]) -> Option<usize> {
    for i in 0..subpaths.len() {
        if has_polyline_self_intersection(&subpaths[i].points, subpaths[i].closed) {
            return Some(subpaths[i].source_index);
        }
        for j in 0..i {
            if do_polylines_intersect(&subpaths[i].points, subpaths[i].closed, &subpaths[j].points, subpaths[j].closed) {
                return Some(subpaths[i].source_index);
            }
        }
    }
    return None;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn get_polyline_point_count(points: &[f64], closed: bool) -> usize {
    let count = points.len() / 2;
    if closed && count > 1 && same_point(points, 0, count - 1) { return count - 1; }
    return count;
}

fn has_invalid_outline(piece: &StrokePathPieceGeometry) -> bool {
    let left = remove_consecutive_duplicates(&piece.left);
    let right = remove_consecutive_duplicates(&piece.right);
    if piece.closed {
        return has_polyline_self_intersection(&left, true)
            || has_polyline_self_intersection(&right, true)
            || do_polylines_intersect(&left, true, &right, true);
    }
    let mut outline = left;
    outline.extend_from_slice(&piece.end_cap);
    let rev_right = reverse_points(&right);
    outline.extend_from_slice(&rev_right);
    outline.extend_from_slice(&piece.start_cap);
    let outline = remove_consecutive_duplicates(&outline);
    return has_polyline_self_intersection(&outline, true);
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn has_polyline_self_intersection(points: &[f64], closed: bool) -> bool {
    let count = get_polyline_point_count(points, closed);
    let segment_count = if closed { count } else { count - 1 };
    for i in 0..segment_count {
        let i_next = (i + 1) % count;
        if same_point(points, i, i_next) { continue; }
        for j in (i + 1)..segment_count {
            let j_next = (j + 1) % count;
            if same_point(points, j, j_next) || segments_are_adjacent(i, j, segment_count, closed) { continue; }
            if segments_intersect(points, i, i_next, points, j, j_next) { return true; }
        }
    }
    return false;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn intersect_lines(
    ax: f64, ay: f64, adx: f64, ady: f64,
    bx: f64, by: f64, bdx: f64, bdy: f64,
) -> Option<(f64, f64)> {
    let denominator = cross(adx, ady, bdx, bdy);
    if denominator.abs() <= GEOMETRY_EPSILON {
        return None;
    }
    let scale = cross(bx - ax, by - ay, bdx, bdy) / denominator;
    return Some((ax + adx * scale, ay + ady * scale));
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn point_on_segment(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64) -> bool {
    return px >= ax.min(bx) - GEOMETRY_EPSILON
        && px <= ax.max(bx) + GEOMETRY_EPSILON
        && py >= ay.min(by) - GEOMETRY_EPSILON
        && py <= ay.max(by) + GEOMETRY_EPSILON;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn push_dash(result: &mut Vec<StrokeSubpath>, points: Vec<f64>, source_index: usize) {
    if points.len() >= 4 {
        result.push(StrokeSubpath { closed: false, points, source_index });
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn remove_consecutive_duplicates(source: &[f64]) -> Vec<f64> {
    let mut result: Vec<f64> = Vec::new();
    let mut i = 0;
    while i < source.len() {
        if result.len() > 0
            && approximately_equal(result[result.len() - 2], source[i])
            && approximately_equal(result[result.len() - 1], source[i + 1])
        {
            i += 2;
            continue;
        }
        result.push(source[i]);
        result.push(source[i + 1]);
        i += 2;
    }
    return result;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn reverse_points(points: &[f64]) -> Vec<f64> {
    let mut result: Vec<f64> = Vec::new();
    let mut i = points.len() as isize - 2;
    while i >= 0 {
        result.push(points[i as usize]);
        result.push(points[i as usize + 1]);
        i -= 2;
    }
    return result;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn same_point(points: &[f64], a: usize, b: usize) -> bool {
    return approximately_equal(points[a * 2], points[b * 2])
        && approximately_equal(points[a * 2 + 1], points[b * 2 + 1]);
}

fn segments_are_adjacent(a: usize, b: usize, segment_count: usize, closed: bool) -> bool {
    if b == a + 1 { return true; }
    return closed && a == 0 && b == segment_count - 1;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn segments_intersect(a: &[f64], ai: usize, aj: usize, b: &[f64], bi: usize, bj: usize) -> bool {
    let ax = a[ai * 2];
    let ay = a[ai * 2 + 1];
    let bx = a[aj * 2];
    let by = a[aj * 2 + 1];
    let cx = b[bi * 2];
    let cy = b[bi * 2 + 1];
    let dx = b[bj * 2];
    let dy = b[bj * 2 + 1];
    let ab_c = cross(bx - ax, by - ay, cx - ax, cy - ay);
    let ab_d = cross(bx - ax, by - ay, dx - ax, dy - ay);
    let cd_a = cross(dx - cx, dy - cy, ax - cx, ay - cy);
    let cd_b = cross(dx - cx, dy - cy, bx - cx, by - cy);
    if ((ab_c > GEOMETRY_EPSILON && ab_d < -GEOMETRY_EPSILON) || (ab_c < -GEOMETRY_EPSILON && ab_d > GEOMETRY_EPSILON))
        && ((cd_a > GEOMETRY_EPSILON && cd_b < -GEOMETRY_EPSILON) || (cd_a < -GEOMETRY_EPSILON && cd_b > GEOMETRY_EPSILON))
    {
        return true;
    }
    if ab_c.abs() <= GEOMETRY_EPSILON && point_on_segment(cx, cy, ax, ay, bx, by) { return true; }
    if ab_d.abs() <= GEOMETRY_EPSILON && point_on_segment(dx, dy, ax, ay, bx, by) { return true; }
    if cd_a.abs() <= GEOMETRY_EPSILON && point_on_segment(ax, ay, cx, cy, dx, dy) { return true; }
    return cd_b.abs() <= GEOMETRY_EPSILON && point_on_segment(bx, by, cx, cy, dx, dy);
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn signed_join_sweep(previous: &SegmentFrame, next: &SegmentFrame, turn: f64) -> f64 {
    let start = if turn > 0.0 { (-previous.ny).atan2(-previous.nx) } else { previous.ny.atan2(previous.nx) };
    let end = if turn > 0.0 { (-next.ny).atan2(-next.nx) } else { next.ny.atan2(next.nx) };
    let mut sweep = end - start;
    if turn > 0.0 && sweep < 0.0 { sweep += std::f64::consts::PI * 2.0; }
    if turn < 0.0 && sweep > 0.0 { sweep -= std::f64::consts::PI * 2.0; }
    return sweep;
}
