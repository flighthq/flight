use crate::path::{
    Path, PathWinding, StrokeStyle, append_path_close, append_path_line_to, append_path_move_to,
    create_path,
};
use crate::stroke_path_geometry::{StrokePathPieceGeometry, build_stroke_path_geometry};

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    fn test_style() -> StrokeStyle {
        return StrokeStyle {
            width: Some(2.0),
            cap: Some(StrokeCap::Round),
            join: Some(StrokeJoin::Round),
            miter_limit: Some(4.0),
            dash: Some(Vec::new()),
            dash_offset: Some(0.0),
        };
    }

    #[test]
    fn path_stroke_matches_stroke_path() {
        let s = test_path();
        let ra = s.stroke(&test_style(), Some(0.5));
        let rb = stroke_path(&s, &test_style(), Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_contour(
    path: &mut Path,
    primary: &[f64],
    reverse_primary: bool,
    after_primary: &[f64],
    after_secondary: &[f64],
    secondary: &[f64],
) {
    if reverse_primary {
        append_path_move_to(path, primary[primary.len() - 2], primary[primary.len() - 1]);
        let mut i = primary.len() as isize - 4;
        while i >= 0 {
            append_path_line_to(path, primary[i as usize], primary[i as usize + 1]);
            i -= 2;
        }
    } else {
        append_path_move_to(path, primary[0], primary[1]);
        append_points(path, primary, 2, 2);
    }
    append_points(path, after_primary, 0, 2);
    if secondary.len() >= 2 {
        append_points_reverse(path, secondary);
    }
    append_points(path, after_secondary, 0, 2);
    append_path_close(path);
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_piece_outline(path: &mut Path, piece: &StrokePathPieceGeometry) {
    if piece.left.len() < 4 || piece.right.len() < 4 {
        return;
    }
    let empty: Vec<f64> = Vec::new();
    append_contour(
        path,
        &piece.left,
        false,
        if piece.closed { &empty } else { &piece.end_cap },
        if piece.closed {
            &empty
        } else {
            &piece.start_cap
        },
        &piece.right,
    );
    if piece.closed {
        append_contour(path, &piece.right, true, &empty, &empty, &empty);
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_points(path: &mut Path, points: &[f64], start: usize, step: usize) {
    let mut i = start;
    while i < points.len() {
        append_path_line_to(path, points[i], points[i + 1]);
        i += step;
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_points_reverse(path: &mut Path, points: &[f64]) {
    let mut i = points.len() as isize - 2;
    while i >= 0 {
        append_path_line_to(path, points[i as usize], points[i as usize + 1]);
        i -= 2;
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Converts a centerline Path into its fill outline.
pub fn stroke_path(path: &Path, style: &StrokeStyle, tolerance: Option<f64>) -> Path {
    let tolerance = tolerance.unwrap_or(0.25);
    let mut result = create_path(Some(PathWinding::NonZero));
    let geometry = build_stroke_path_geometry(path, style, tolerance);
    for i in 0..geometry.pieces.len() {
        append_piece_outline(&mut result, &geometry.pieces[i]);
    }
    return result;
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn stroke(&self, style: &StrokeStyle, tolerance: Option<f64>) -> Path {
        return stroke_path(self, style, tolerance);
    }
}
