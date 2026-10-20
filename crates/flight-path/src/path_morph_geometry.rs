use crate::path::{Path, PathCommand, PathMorph, PathMorphCreationReason, PathWinding, PathSegment};
use crate::for_each_path_segment::for_each_path_segment;

pub struct PathMorphBuildResult {
    pub contour: Option<usize>,
    pub issue: PathMorphCreationReason,
    pub morph: Option<PathMorph>,
}

#[derive(Clone)]
struct CubicSegment {
    control_x1: f64,
    control_y1: f64,
    control_x2: f64,
    control_y2: f64,
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
}

#[derive(Clone)]
struct CubicContour {
    closed: bool,
    current_x: f64,
    current_y: f64,
    segments: Vec<CubicSegment>,
    x: f64,
    y: f64,
}

/// Shared preparation used by the production constructor and its diagnostic.
pub fn build_path_morph(start: &Path, end: &Path) -> PathMorphBuildResult {
    if start.winding != end.winding {
        return PathMorphBuildResult { contour: None, issue: PathMorphCreationReason::WindingMismatch, morph: None };
    }

    let start_contours = decode_cubic_contours(start);
    let mut end_contours = decode_cubic_contours(end);
    if start_contours.len() != end_contours.len() {
        return PathMorphBuildResult { contour: None, issue: PathMorphCreationReason::ContourCountMismatch, morph: None };
    }

    for i in 0..start_contours.len() {
        if start_contours[i].closed != end_contours[i].closed {
            return PathMorphBuildResult { contour: Some(i), issue: PathMorphCreationReason::ContourClosednessMismatch, morph: None };
        }
    }

    let orientation_mismatch = normalize_cubic_contour_orientations(&start_contours, &mut end_contours, start.winding);
    if let Some(idx) = orientation_mismatch {
        return PathMorphBuildResult { contour: Some(idx), issue: PathMorphCreationReason::ContourOrientationMismatch, morph: None };
    }

    for i in 0..start_contours.len() {
        equalize_cubic_contour_segments(&mut start_contours.clone()[i], &mut end_contours[i]);
    }

    // Need mutable start_contours for equalize
    let mut start_contours_mut = start_contours;
    for i in 0..start_contours_mut.len() {
        equalize_cubic_contour_segments(&mut start_contours_mut[i], &mut end_contours[i]);
        align_closed_cubic_contour(&start_contours_mut[i], &mut end_contours[i]);
    }

    let mut commands: Vec<u8> = Vec::new();
    let mut start_data: Vec<f64> = Vec::new();
    let mut end_data: Vec<f64> = Vec::new();
    for i in 0..start_contours_mut.len() {
        append_cubic_contour_pair(&mut commands, &mut start_data, &mut end_data, &start_contours_mut[i], &end_contours[i]);
    }

    return PathMorphBuildResult {
        contour: None,
        issue: PathMorphCreationReason::Ok,
        morph: Some(PathMorph {
            commands,
            start_data,
            end_data,
            winding: start.winding,
        }),
    };
}

fn normalize_cubic_contour_orientations(
    start: &[CubicContour],
    end: &mut [CubicContour],
    winding: PathWinding,
) -> Option<usize> {
    if winding == PathWinding::EvenOdd {
        for i in 0..start.len() {
            let start_orientation = get_cubic_contour_orientation(&start[i]);
            let end_orientation = get_cubic_contour_orientation(&end[i]);
            if start_orientation != 0 && end_orientation != 0 && start_orientation != end_orientation {
                reverse_closed_cubic_contour(&mut end[i]);
            }
        }
        return None;
    }

    let mut reverse_end: Option<bool> = None;
    for i in 0..start.len() {
        let start_orientation = get_cubic_contour_orientation(&start[i]);
        let end_orientation = get_cubic_contour_orientation(&end[i]);
        if start_orientation == 0 || end_orientation == 0 { continue; }
        let reversed = start_orientation != end_orientation;
        if let Some(rev) = reverse_end {
            if rev != reversed { return Some(i); }
        } else {
            reverse_end = Some(reversed);
        }
    }
    if reverse_end == Some(true) {
        for i in 0..end.len() {
            if get_cubic_contour_orientation(&end[i]) != 0 {
                reverse_closed_cubic_contour(&mut end[i]);
            }
        }
    }
    return None;
}

fn get_cubic_contour_orientation(contour: &CubicContour) -> i32 {
    if !contour.closed { return 0; }
    let area = get_cubic_contour_signed_area(contour);
    if area < 0.0 { return -1; }
    if area > 0.0 { return 1; }
    return 0;
}

fn reverse_closed_cubic_contour(contour: &mut CubicContour) {
    let mut reversed: Vec<CubicSegment> = Vec::new();
    for i in (0..contour.segments.len()).rev() {
        let segment = &contour.segments[i];
        reversed.push(CubicSegment {
            control_x1: segment.control_x2,
            control_y1: segment.control_y2,
            control_x2: segment.control_x1,
            control_y2: segment.control_y1,
            x0: segment.x1,
            y0: segment.y1,
            x1: segment.x0,
            y1: segment.y0,
        });
    }
    contour.segments = reversed;
    if !contour.segments.is_empty() {
        contour.x = contour.segments[0].x0;
        contour.y = contour.segments[0].y0;
    }
    contour.current_x = contour.x;
    contour.current_y = contour.y;
}

fn get_cubic_contour_signed_area(contour: &CubicContour) -> f64 {
    let mut twice_area: f64 = 0.0;
    let mut extent: f64 = 0.0;
    for i in 0..contour.segments.len() {
        let segment = &contour.segments[i];
        let x0 = segment.x0 - contour.x;
        let cx1 = segment.control_x1 - contour.x;
        let cx2 = segment.control_x2 - contour.x;
        let x1 = segment.x1 - contour.x;
        let y0 = segment.y0 - contour.y;
        let cy1 = segment.control_y1 - contour.y;
        let cy2 = segment.control_y2 - contour.y;
        let y1 = segment.y1 - contour.y;
        extent = extent
            .max(x0.abs()).max(cx1.abs()).max(cx2.abs()).max(x1.abs())
            .max(y0.abs()).max(cy1.abs()).max(cy2.abs()).max(y1.abs());
        let xc = get_cubic_power_coefficients(x0, cx1, cx2, x1);
        let yc = get_cubic_power_coefficients(y0, cy1, cy2, y1);
        for xi in 0..4usize {
            for yi in 1..4usize {
                twice_area += (xc[xi] * yi as f64 * yc[yi] - yc[xi] * yi as f64 * xc[yi]) / (xi + yi) as f64;
            }
        }
    }
    let area = twice_area / 2.0;
    let area_epsilon = 1.0f64.max(extent * extent) * f64::EPSILON * 64.0;
    if area.abs() <= area_epsilon { return 0.0; }
    return area;
}

fn get_cubic_power_coefficients(p0: f64, p1: f64, p2: f64, p3: f64) -> [f64; 4] {
    return [p0, 3.0 * (p1 - p0), 3.0 * (p0 - 2.0 * p1 + p2), -p0 + 3.0 * p1 - 3.0 * p2 + p3];
}

fn align_closed_cubic_contour(start: &CubicContour, end: &mut CubicContour) {
    let count = start.segments.len();
    if !start.closed || count < 2 { return; }
    let mut best_offset: usize = 0;
    let mut best_distance = f64::INFINITY;
    for offset in 0..count {
        let mut distance: f64 = 0.0;
        for i in 0..count {
            let a = &start.segments[i];
            let b = &end.segments[(i + offset) % count];
            let dx = a.x0 - b.x0;
            let dy = a.y0 - b.y0;
            distance += dx * dx + dy * dy;
        }
        if distance < best_distance {
            best_distance = distance;
            best_offset = offset;
        }
    }
    if best_offset == 0 { return; }
    let mut rotated: Vec<CubicSegment> = Vec::new();
    for i in 0..count {
        let src = &end.segments[(i + best_offset) % count];
        rotated.push(CubicSegment {
            control_x1: src.control_x1, control_y1: src.control_y1,
            control_x2: src.control_x2, control_y2: src.control_y2,
            x0: src.x0, y0: src.y0, x1: src.x1, y1: src.y1,
        });
    }
    end.segments = rotated;
    end.x = end.segments[0].x0;
    end.y = end.segments[0].y0;
}

fn append_cubic_contour_pair(
    commands: &mut Vec<u8>,
    start_data: &mut Vec<f64>,
    end_data: &mut Vec<f64>,
    start: &CubicContour,
    end: &CubicContour,
) {
    commands.push(PathCommand::MoveTo as u8);
    start_data.push(start.x);
    start_data.push(start.y);
    end_data.push(end.x);
    end_data.push(end.y);
    for i in 0..start.segments.len() {
        let a = &start.segments[i];
        let b = &end.segments[i];
        commands.push(PathCommand::CubicCurveTo as u8);
        start_data.push(a.control_x1);
        start_data.push(a.control_y1);
        start_data.push(a.control_x2);
        start_data.push(a.control_y2);
        start_data.push(a.x1);
        start_data.push(a.y1);
        end_data.push(b.control_x1);
        end_data.push(b.control_y1);
        end_data.push(b.control_x2);
        end_data.push(b.control_y2);
        end_data.push(b.x1);
        end_data.push(b.y1);
    }
    if start.closed {
        commands.push(PathCommand::Close as u8);
    }
}

fn append_cubic_segment(contour: &mut CubicContour, cx1: f64, cy1: f64, cx2: f64, cy2: f64, x: f64, y: f64) {
    contour.segments.push(CubicSegment {
        control_x1: cx1, control_y1: cy1,
        control_x2: cx2, control_y2: cy2,
        x0: contour.current_x, y0: contour.current_y,
        x1: x, y1: y,
    });
    contour.current_x = x;
    contour.current_y = y;
}

fn append_line_as_cubic(contour: &mut CubicContour, x: f64, y: f64) {
    let x0 = contour.current_x;
    let y0 = contour.current_y;
    append_cubic_segment(
        contour,
        x0 + (x - x0) / 3.0, y0 + (y - y0) / 3.0,
        x0 + (x - x0) * 2.0 / 3.0, y0 + (y - y0) * 2.0 / 3.0,
        x, y,
    );
}

fn append_quadratic_as_cubic(contour: &mut CubicContour, cx: f64, cy: f64, x: f64, y: f64) {
    let x0 = contour.current_x;
    let y0 = contour.current_y;
    append_cubic_segment(
        contour,
        x0 + (cx - x0) * 2.0 / 3.0, y0 + (cy - y0) * 2.0 / 3.0,
        x + (cx - x) * 2.0 / 3.0, y + (cy - y) * 2.0 / 3.0,
        x, y,
    );
}

fn close_cubic_contour(contour: &mut CubicContour) {
    if contour.current_x != contour.x || contour.current_y != contour.y {
        append_line_as_cubic(contour, contour.x, contour.y);
    }
    contour.closed = true;
}

fn create_cubic_contour(x: f64, y: f64) -> CubicContour {
    return CubicContour { closed: false, current_x: x, current_y: y, segments: Vec::new(), x, y };
}

fn cubic_control_polygon_length(segment: &CubicSegment) -> f64 {
    return point_distance(segment.x0, segment.y0, segment.control_x1, segment.control_y1)
        + point_distance(segment.control_x1, segment.control_y1, segment.control_x2, segment.control_y2)
        + point_distance(segment.control_x2, segment.control_y2, segment.x1, segment.y1);
}

fn decode_cubic_contours(path: &Path) -> Vec<CubicContour> {
    let segments = for_each_path_segment(path);
    let mut contours: Vec<CubicContour> = Vec::new();
    let mut current: Option<usize> = None;

    for segment in &segments {
        match segment {
            PathSegment::MoveTo { x, y } => {
                contours.push(create_cubic_contour(*x, *y));
                current = Some(contours.len() - 1);
            }
            PathSegment::LineTo { x, y } => {
                if current.is_none() {
                    contours.push(create_cubic_contour(0.0, 0.0));
                    current = Some(contours.len() - 1);
                }
                append_line_as_cubic(&mut contours[current.unwrap()], *x, *y);
            }
            PathSegment::QuadraticCurveTo { control_x, control_y, x, y } => {
                if current.is_none() {
                    contours.push(create_cubic_contour(0.0, 0.0));
                    current = Some(contours.len() - 1);
                }
                append_quadratic_as_cubic(&mut contours[current.unwrap()], *control_x, *control_y, *x, *y);
            }
            PathSegment::CubicCurveTo { control_x1, control_y1, control_x2, control_y2, x, y } => {
                if current.is_none() {
                    contours.push(create_cubic_contour(0.0, 0.0));
                    current = Some(contours.len() - 1);
                }
                append_cubic_segment(&mut contours[current.unwrap()], *control_x1, *control_y1, *control_x2, *control_y2, *x, *y);
            }
            PathSegment::Close => {
                if let Some(idx) = current {
                    close_cubic_contour(&mut contours[idx]);
                    current = None;
                }
            }
        }
    }
    return contours;
}

fn equalize_cubic_contour_segments(start: &mut CubicContour, end: &mut CubicContour) {
    let target_count = start.segments.len().max(end.segments.len());
    if target_count == 0 { return; }
    start.segments = subdivide_cubic_segments(&start.segments, target_count, start.x, start.y);
    end.segments = subdivide_cubic_segments(&end.segments, target_count, end.x, end.y);
}

fn point_distance(x0: f64, y0: f64, x1: f64, y1: f64) -> f64 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    return (dx * dx + dy * dy).sqrt();
}

fn split_cubic_segment(segment: &CubicSegment, t: f64) -> (CubicSegment, CubicSegment) {
    let x01 = segment.x0 + (segment.control_x1 - segment.x0) * t;
    let y01 = segment.y0 + (segment.control_y1 - segment.y0) * t;
    let x12 = segment.control_x1 + (segment.control_x2 - segment.control_x1) * t;
    let y12 = segment.control_y1 + (segment.control_y2 - segment.control_y1) * t;
    let x23 = segment.control_x2 + (segment.x1 - segment.control_x2) * t;
    let y23 = segment.control_y2 + (segment.y1 - segment.control_y2) * t;
    let x012 = x01 + (x12 - x01) * t;
    let y012 = y01 + (y12 - y01) * t;
    let x123 = x12 + (x23 - x12) * t;
    let y123 = y12 + (y23 - y12) * t;
    let x = x012 + (x123 - x012) * t;
    let y = y012 + (y123 - y012) * t;
    return (
        CubicSegment {
            control_x1: x01, control_y1: y01,
            control_x2: x012, control_y2: y012,
            x0: segment.x0, y0: segment.y0,
            x1: x, y1: y,
        },
        CubicSegment {
            control_x1: x123, control_y1: y123,
            control_x2: x23, control_y2: y23,
            x0: x, y0: y,
            x1: segment.x1, y1: segment.y1,
        },
    );
}

fn subdivide_cubic_segments(
    source: &[CubicSegment],
    target_count: usize,
    point_x: f64,
    point_y: f64,
) -> Vec<CubicSegment> {
    if source.len() == target_count {
        return source.iter().map(|s| CubicSegment {
            control_x1: s.control_x1, control_y1: s.control_y1,
            control_x2: s.control_x2, control_y2: s.control_y2,
            x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1,
        }).collect();
    }
    if source.is_empty() {
        let mut segments: Vec<CubicSegment> = Vec::new();
        for _ in 0..target_count {
            segments.push(CubicSegment {
                control_x1: point_x, control_y1: point_y,
                control_x2: point_x, control_y2: point_y,
                x0: point_x, y0: point_y,
                x1: point_x, y1: point_y,
            });
        }
        return segments;
    }

    let mut part_counts: Vec<usize> = vec![1; source.len()];
    let lengths: Vec<f64> = source.iter().map(|s| cubic_control_polygon_length(s)).collect();
    let mut total = source.len();
    while total < target_count {
        let mut best: usize = 0;
        let mut best_length: f64 = -1.0;
        for i in 0..source.len() {
            let part_length = lengths[i] / part_counts[i] as f64;
            if part_length > best_length {
                best = i;
                best_length = part_length;
            }
        }
        part_counts[best] += 1;
        total += 1;
    }

    let mut segments: Vec<CubicSegment> = Vec::new();
    for i in 0..source.len() {
        let mut remainder = CubicSegment {
            control_x1: source[i].control_x1, control_y1: source[i].control_y1,
            control_x2: source[i].control_x2, control_y2: source[i].control_y2,
            x0: source[i].x0, y0: source[i].y0,
            x1: source[i].x1, y1: source[i].y1,
        };
        let mut parts = part_counts[i];
        while parts > 1 {
            let (first, second) = split_cubic_segment(&remainder, 1.0 / parts as f64);
            segments.push(first);
            remainder = second;
            parts -= 1;
        }
        segments.push(remainder);
    }
    return segments;
}
