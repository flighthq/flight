use crate::path::Path;
use crate::flatten_path::flatten_path;

/// Returns the signed curvature of the path at `distance` arc-length units from the start.
/// Positive curvature is a left turn in screen space (y-down). Returns 0 for empty paths,
/// straight segments, or degenerate geometry.
pub fn get_path_curvature_at_distance(path: &Path, distance: f64, tolerance: f64) -> f64 {
    let contours = flatten_path(path, tolerance);
    return sample_path_curvature(&contours, distance);
}

fn sample_path_curvature(contours: &[Vec<f64>], distance: f64) -> f64 {
    if contours.is_empty() {
        return 0.0;
    }
    let mut remaining = distance;

    for ci in 0..contours.len() {
        let contour = &contours[ci];
        let n = contour.len() / 2;
        if n < 2 {
            continue;
        }

        if remaining <= 0.0 {
            return curvature_at_vertex(contour, n, 0);
        }

        for i in 1..n {
            let dx = contour[i * 2] - contour[(i - 1) * 2];
            let dy = contour[i * 2 + 1] - contour[(i - 1) * 2 + 1];
            let seg_len = (dx * dx + dy * dy).sqrt();

            if remaining <= seg_len {
                let nearest = if seg_len == 0.0 || remaining * 2.0 >= seg_len { i } else { i - 1 };
                return curvature_at_vertex(contour, n, nearest);
            }
            remaining -= seg_len;
        }
    }

    let last = &contours[contours.len() - 1];
    let n = last.len() / 2;
    if n < 3 {
        return 0.0;
    }
    return menger_curvature(
        last[(n - 3) * 2], last[(n - 3) * 2 + 1],
        last[(n - 2) * 2], last[(n - 2) * 2 + 1],
        last[(n - 1) * 2], last[(n - 1) * 2 + 1],
    );
}

fn curvature_at_vertex(contour: &[f64], count: usize, vertex: usize) -> f64 {
    if count < 3 {
        return 0.0;
    }
    let middle = 1.max(vertex.min(count - 2));
    return menger_curvature(
        contour[(middle - 1) * 2], contour[(middle - 1) * 2 + 1],
        contour[middle * 2], contour[middle * 2 + 1],
        contour[(middle + 1) * 2], contour[(middle + 1) * 2 + 1],
    );
}

fn menger_curvature(x0: f64, y0: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let ax = x1 - x0;
    let ay = y1 - y0;
    let bx = x2 - x1;
    let by = y2 - y1;
    let cross = ax * by - ay * bx;
    let a = (ax * ax + ay * ay).sqrt();
    let b = (bx * bx + by * by).sqrt();
    let cx = x2 - x0;
    let cy = y2 - y0;
    let c = (cx * cx + cy * cy).sqrt();
    let denom = a * b * c;
    if denom == 0.0 {
        return 0.0;
    }
    return (2.0 * cross) / denom;
}
