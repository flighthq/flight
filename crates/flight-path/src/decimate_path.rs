use crate::path::{Path, PathCommand};
use crate::flatten_path::flatten_path;

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Decimates `source` by flattening curves and applying Douglas-Peucker point reduction.
/// Removes points that deviate less than `tolerance` from the decimated line.
/// Alias-safe: `out` may be the same object as `source`.
pub fn decimate_path(source: &Path, tolerance: f64, out: &mut Path, flatten_tolerance: f64) {
    let contours = flatten_path(source, flatten_tolerance);
    out.commands.clear();
    out.data.clear();
    out.winding = source.winding;

    for contour in &contours {
        let n = contour.len() / 2;
        if n < 2 {
            continue;
        }

        let closed = n >= 3
            && contour[0] == contour[contour.len() - 2]
            && contour[1] == contour[contour.len() - 1];
        let last = if closed { n - 1 } else { n };
        let mut keep = vec![0u8; last];
        keep[0] = 1;
        keep[last - 1] = 1;
        douglas_peucker(contour, 0, last - 1, tolerance * tolerance, &mut keep);

        let mut first = true;
        for i in 0..last {
            if keep[i] == 0 {
                continue;
            }
            if first {
                out.commands.push(PathCommand::MoveTo as u8);
                first = false;
            } else {
                out.commands.push(PathCommand::LineTo as u8);
            }
            out.data.push(contour[i * 2]);
            out.data.push(contour[i * 2 + 1]);
        }
        if closed {
            out.commands.push(PathCommand::Close as u8);
        }
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn douglas_peucker(
    pts: &[f64],
    first: usize,
    last: usize,
    tolerance_sq: f64,
    keep: &mut Vec<u8>,
) {
    if last - first < 2 {
        return;
    }

    let x0 = pts[first * 2];
    let y0 = pts[first * 2 + 1];
    let x1 = pts[last * 2];
    let y1 = pts[last * 2 + 1];
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len_sq = dx * dx + dy * dy;

    let mut max_dist_sq: f64 = 0.0;
    let mut max_idx = first;
    for i in (first + 1)..last {
        let px = pts[i * 2];
        let py = pts[i * 2 + 1];
        let dist_sq;
        if len_sq == 0.0 {
            let ax = px - x0;
            let ay = py - y0;
            dist_sq = ax * ax + ay * ay;
        } else {
            let cross = dx * (y0 - py) - dy * (x0 - px);
            dist_sq = (cross * cross) / len_sq;
        }
        if dist_sq > max_dist_sq {
            max_dist_sq = dist_sq;
            max_idx = i;
        }
    }

    if max_dist_sq > tolerance_sq {
        keep[max_idx] = 1;
        douglas_peucker(pts, first, max_idx, tolerance_sq, keep);
        douglas_peucker(pts, max_idx, last, tolerance_sq, keep);
    }
}
