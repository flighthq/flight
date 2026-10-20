use crate::path::{Path, PathWinding, StrokeStyle,
    append_path_close, append_path_line_to, append_path_move_to, create_path};
use crate::stroke_path_geometry::{build_stroke_path_geometry, StrokePathPieceGeometry};

/// Converts a centerline Path into its fill outline.
pub fn stroke_path(path: &Path, style: &StrokeStyle, tolerance: f64) -> Path {
    let mut result = create_path(PathWinding::NonZero);
    let geometry = build_stroke_path_geometry(path, style, tolerance);
    for i in 0..geometry.pieces.len() {
        append_piece_outline(&mut result, &geometry.pieces[i]);
    }
    return result;
}

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
        if piece.closed { &empty } else { &piece.start_cap },
        &piece.right,
    );
    if piece.closed {
        append_contour(path, &piece.right, true, &empty, &empty, &empty);
    }
}

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

fn append_points(path: &mut Path, points: &[f64], start: usize, step: usize) {
    let mut i = start;
    while i < points.len() {
        append_path_line_to(path, points[i], points[i + 1]);
        i += step;
    }
}

fn append_points_reverse(path: &mut Path, points: &[f64]) {
    let mut i = points.len() as isize - 2;
    while i >= 0 {
        append_path_line_to(path, points[i as usize], points[i as usize + 1]);
        i -= 2;
    }
}
