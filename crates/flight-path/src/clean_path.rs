use crate::flatten_path::flatten_path;
use crate::path::{Path, PathCommand};

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path();
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_clean_matches_clean_path() {
        let mut oa1 = create_path();
        let mut ob1 = create_path();
        let s = test_path();
        s.clean(0.5, &mut oa1, Some(0.5));
        clean_path(&s, 0.5, &mut ob1, Some(0.5));
        assert_eq!(format!("{:?}", oa1), format!("{:?}", ob1));
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Cleans `source` by flattening curves and removing redundant vertices from each contour.
/// Removes consecutive coincident points, near-collinear vertices, and zero-area spikes.
/// Alias-safe: captures all input before writing to `out`.
pub fn clean_path(source: &Path, tolerance: f64, out: &mut Path, flatten_tolerance: Option<f64>) {
    let flatten_tolerance = flatten_tolerance.unwrap_or(0.25);
    let mut contours = Vec::new();
    flatten_path(&mut contours, source, Some(flatten_tolerance));
    let winding = source.winding;
    let tolerance_sq = tolerance * tolerance;
    out.commands.clear();
    out.data.clear();
    out.winding = winding;

    for contour in &contours {
        let n = contour.len() / 2;
        if n < 2 {
            continue;
        }

        let closed = n >= 3
            && within_tolerance(
                contour[0],
                contour[1],
                contour[n * 2 - 2],
                contour[n * 2 - 1],
                tolerance_sq,
            );
        let count = if closed { n - 1 } else { n };

        let mut kept: Vec<f64> = Vec::new();
        for i in 0..count {
            push_clean_vertex(&mut kept, contour[i * 2], contour[i * 2 + 1], tolerance_sq);
        }
        if closed {
            collapse_closed_seam(&mut kept, tolerance_sq);
        }

        let kept_count = kept.len() / 2;
        if closed {
            if kept_count < 3 {
                continue;
            }
        } else {
            if kept_count < 2 {
                continue;
            }
        }

        out.commands.push(PathCommand::MoveTo as u8);
        out.data.push(kept[0]);
        out.data.push(kept[1]);
        for i in 1..kept_count {
            out.commands.push(PathCommand::LineTo as u8);
            out.data.push(kept[i * 2]);
            out.data.push(kept[i * 2 + 1]);
        }
        if closed {
            out.commands.push(PathCommand::Close as u8);
        }
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn collapse_closed_seam(kept: &mut Vec<f64>, tolerance_sq: f64) {
    let mut changed = true;
    while changed && kept.len() / 2 > 3 {
        changed = false;
        let last = kept.len() / 2;
        if is_middle_removable(kept, last - 2, last - 1, 0, tolerance_sq) {
            kept.truncate(kept.len() - 2);
            changed = true;
            continue;
        }
        if is_middle_removable(kept, last - 1, 0, 1, tolerance_sq) {
            kept.drain(0..2);
            changed = true;
        }
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn is_middle_removable(
    kept: &[f64],
    prev: usize,
    mid: usize,
    next: usize,
    tolerance_sq: f64,
) -> bool {
    let px = kept[prev * 2];
    let py = kept[prev * 2 + 1];
    let mx = kept[mid * 2];
    let my = kept[mid * 2 + 1];
    let sx = kept[next * 2];
    let sy = kept[next * 2 + 1];
    return is_redundant_middle(px, py, mx, my, sx, sy, tolerance_sq);
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn is_redundant_middle(
    px: f64,
    py: f64,
    mx: f64,
    my: f64,
    sx: f64,
    sy: f64,
    tolerance_sq: f64,
) -> bool {
    let dx = sx - px;
    let dy = sy - py;
    let length_sq = dx * dx + dy * dy;
    if length_sq <= tolerance_sq {
        return true;
    }
    let cross = dx * (py - my) - dy * (px - mx);
    return (cross * cross) / length_sq <= tolerance_sq;
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn push_clean_vertex(kept: &mut Vec<f64>, x: f64, y: f64, tolerance_sq: f64) {
    let k = kept.len();
    if k >= 2 && within_tolerance(kept[k - 2], kept[k - 1], x, y, tolerance_sq) {
        return;
    }
    while kept.len() >= 4 {
        let m = kept.len();
        if !is_redundant_middle(
            kept[m - 4],
            kept[m - 3],
            kept[m - 2],
            kept[m - 1],
            x,
            y,
            tolerance_sq,
        ) {
            break;
        }
        kept.truncate(m - 2);
    }
    kept.push(x);
    kept.push(y);
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn within_tolerance(ax: f64, ay: f64, bx: f64, by: f64, tolerance_sq: f64) -> bool {
    let dx = ax - bx;
    let dy = ay - by;
    return dx * dx + dy * dy <= tolerance_sq;
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn clean(&self, tolerance: f64, out: &mut Path, flatten_tolerance: Option<f64>) {
        return clean_path(self, tolerance, out, flatten_tolerance);
    }
}
