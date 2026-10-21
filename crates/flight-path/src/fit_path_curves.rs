use crate::path::{Path, PathCommand};
use crate::flatten_path::flatten_path;

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn chord_length_parameterize(pts: &[f64], first: usize, last: usize) -> Vec<f64> {
    let mut u = vec![0.0f64];
    for i in (first + 1)..=last {
        let dx = pts[i * 2] - pts[(i - 1) * 2];
        let dy = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1];
        u.push(u[u.len() - 1] + (dx * dx + dy * dy).sqrt());
    }
    let total = u[u.len() - 1];
    if total > 0.0 {
        for i in 1..u.len() {
            u[i] /= total;
        }
    }
    return u;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn compute_center_tangent(pts: &[f64], idx: usize) -> (f64, f64) {
    let dx = pts[(idx - 1) * 2] - pts[(idx + 1) * 2];
    let dy = pts[(idx - 1) * 2 + 1] - pts[(idx + 1) * 2 + 1];
    let len = (dx * dx + dy * dy).sqrt();
    if len > 0.0 { return (dx / len, dy / len); }
    return (1.0, 0.0);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn compute_left_tangent(pts: &[f64], idx: usize) -> (f64, f64) {
    let dx = pts[(idx + 1) * 2] - pts[idx * 2];
    let dy = pts[(idx + 1) * 2 + 1] - pts[idx * 2 + 1];
    let len = (dx * dx + dy * dy).sqrt();
    if len > 0.0 { return (dx / len, dy / len); }
    return (1.0, 0.0);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn compute_max_error(
    pts: &[f64],
    first: usize,
    last: usize,
    bezier: &[f64],
    u: &[f64],
) -> (f64, usize) {
    let mut max_dist: f64 = 0.0;
    let mut split_point = (last - first + 1) / 2;

    for i in 1..(last - first) {
        let t = u[i];
        let mt = 1.0 - t;
        let bx = mt * mt * mt * bezier[0] + 3.0 * mt * mt * t * bezier[2]
            + 3.0 * mt * t * t * bezier[4] + t * t * t * bezier[6];
        let by = mt * mt * mt * bezier[1] + 3.0 * mt * mt * t * bezier[3]
            + 3.0 * mt * t * t * bezier[5] + t * t * t * bezier[7];
        let dx = pts[(first + i) * 2] - bx;
        let dy = pts[(first + i) * 2 + 1] - by;
        let dist_sq = dx * dx + dy * dy;
        if dist_sq >= max_dist {
            max_dist = dist_sq;
            split_point = first + i;
        }
    }

    return (max_dist, split_point);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn compute_right_tangent(pts: &[f64], idx: usize) -> (f64, f64) {
    let dx = pts[(idx - 1) * 2] - pts[idx * 2];
    let dy = pts[(idx - 1) * 2 + 1] - pts[idx * 2 + 1];
    let len = (dx * dx + dy * dy).sqrt();
    if len > 0.0 { return (dx / len, dy / len); }
    return (-1.0, 0.0);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn find_corners(pts: &[f64], n: usize) -> Vec<usize> {
    let mut corners = vec![0usize];
    for i in 1..n - 1 {
        let dx0 = pts[i * 2] - pts[(i - 1) * 2];
        let dy0 = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1];
        let dx1 = pts[(i + 1) * 2] - pts[i * 2];
        let dy1 = pts[(i + 1) * 2 + 1] - pts[i * 2 + 1];
        let len0 = (dx0 * dx0 + dy0 * dy0).sqrt();
        let len1 = (dx1 * dx1 + dy1 * dy1).sqrt();
        if len0 == 0.0 || len1 == 0.0 {
            continue;
        }
        let dot = (dx0 * dx1 + dy0 * dy1) / (len0 * len1);
        if dot < 0.5 {
            corners.push(i);
        }
    }
    corners.push(n - 1);
    return corners;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn fit_cubic(
    pts: &[f64],
    first: usize,
    last: usize,
    t_hat1: (f64, f64),
    t_hat2: (f64, f64),
    tolerance_sq: f64,
    out: &mut Path,
) {
    let n_pts = last - first + 1;
    if n_pts == 2 {
        let dx = pts[last * 2] - pts[first * 2];
        let dy = pts[last * 2 + 1] - pts[first * 2 + 1];
        let dist = (dx * dx + dy * dy).sqrt();
        let d = dist / 3.0;
        out.commands.push(PathCommand::CubicCurveTo as u8);
        out.data.push(pts[first * 2] + t_hat1.0 * d);
        out.data.push(pts[first * 2 + 1] + t_hat1.1 * d);
        out.data.push(pts[last * 2] + t_hat2.0 * d);
        out.data.push(pts[last * 2 + 1] + t_hat2.1 * d);
        out.data.push(pts[last * 2]);
        out.data.push(pts[last * 2 + 1]);
        return;
    }

    let mut u = chord_length_parameterize(pts, first, last);
    let max_iterations = 4;
    for iter in 0..=max_iterations {
        let bezier = generate_bezier(pts, first, last, &u, t_hat1, t_hat2);
        let (max_err, split_point) = compute_max_error(pts, first, last, &bezier, &u);

        if max_err < tolerance_sq {
            out.commands.push(PathCommand::CubicCurveTo as u8);
            out.data.push(bezier[2]);
            out.data.push(bezier[3]);
            out.data.push(bezier[4]);
            out.data.push(bezier[5]);
            out.data.push(bezier[6]);
            out.data.push(bezier[7]);
            return;
        }

        if iter < max_iterations {
            u = reparameterize(pts, first, last, &u, &bezier);
        } else {
            let t_hat_center = compute_center_tangent(pts, split_point);
            fit_cubic(pts, first, split_point, t_hat1, (-t_hat_center.0, -t_hat_center.1), tolerance_sq, out);
            fit_cubic(pts, split_point, last, t_hat_center, t_hat2, tolerance_sq, out);
        }
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Re-curves a polyline (or any flattened path) into smooth cubic bezier segments using
/// Schneider's algorithm. Alias-safe.
pub fn fit_path_curves(source: &Path, tolerance: f64, out: &mut Path, flatten_tolerance: Option<f64>) {
    let flatten_tolerance = flatten_tolerance.unwrap_or(0.25);
    let contours = flatten_path(source, Some(flatten_tolerance));
    out.commands.clear();
    out.data.clear();
    out.winding = source.winding;

    let tolerance_sq = tolerance * tolerance;
    for contour in &contours {
        let n = contour.len() / 2;
        if n < 2 {
            continue;
        }

        let closed = n >= 3
            && contour[0] == contour[contour.len() - 2]
            && contour[1] == contour[contour.len() - 1];
        let pts: Vec<f64> = if closed { contour[0..(n - 1) * 2].to_vec() } else { contour.clone() };
        let pn = pts.len() / 2;

        if pn < 2 {
            continue;
        }
        if pn == 2 {
            out.commands.push(PathCommand::MoveTo as u8);
            out.data.push(pts[0]);
            out.data.push(pts[1]);
            out.commands.push(PathCommand::LineTo as u8);
            out.data.push(pts[2]);
            out.data.push(pts[3]);
            if closed {
                out.commands.push(PathCommand::Close as u8);
            }
            continue;
        }

        let corners = find_corners(&pts, pn);
        out.commands.push(PathCommand::MoveTo as u8);
        out.data.push(pts[0]);
        out.data.push(pts[1]);

        for ci in 0..corners.len() - 1 {
            let first = corners[ci];
            let last = corners[ci + 1];
            if last - first < 2 {
                out.commands.push(PathCommand::LineTo as u8);
                out.data.push(pts[last * 2]);
                out.data.push(pts[last * 2 + 1]);
                continue;
            }
            let t_hat1 = compute_left_tangent(&pts, first);
            let t_hat2 = compute_right_tangent(&pts, last);
            fit_cubic(&pts, first, last, t_hat1, t_hat2, tolerance_sq, out);
        }

        if closed {
            out.commands.push(PathCommand::Close as u8);
        }
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn generate_bezier(
    pts: &[f64],
    first: usize,
    last: usize,
    u: &[f64],
    t_hat1: (f64, f64),
    t_hat2: (f64, f64),
) -> Vec<f64> {
    let n_pts = last - first + 1;
    let mut c00: f64 = 0.0;
    let mut c01: f64 = 0.0;
    let mut c11: f64 = 0.0;
    let mut x0: f64 = 0.0;
    let mut x1: f64 = 0.0;

    for i in 0..n_pts {
        let t = u[i];
        let b1 = 3.0 * t * (1.0 - t) * (1.0 - t);
        let b2 = 3.0 * t * t * (1.0 - t);
        let a1x = t_hat1.0 * b1;
        let a1y = t_hat1.1 * b1;
        let a2x = t_hat2.0 * b2;
        let a2y = t_hat2.1 * b2;

        c00 += a1x * a1x + a1y * a1y;
        c01 += a1x * a2x + a1y * a2y;
        c11 += a2x * a2x + a2y * a2y;

        let b0 = (1.0 - t) * (1.0 - t) * (1.0 - t);
        let b3 = t * t * t;
        let tmpx = pts[(first + i) * 2]
            - (pts[first * 2] * b0 + pts[first * 2] * b1 + pts[last * 2] * b2 + pts[last * 2] * b3);
        let tmpy = pts[(first + i) * 2 + 1]
            - (pts[first * 2 + 1] * b0 + pts[first * 2 + 1] * b1 + pts[last * 2 + 1] * b2 + pts[last * 2 + 1] * b3);
        x0 += a1x * tmpx + a1y * tmpy;
        x1 += a2x * tmpx + a2y * tmpy;
    }

    let det = c00 * c11 - c01 * c01;
    let alpha1;
    let alpha2;

    if det.abs() < 1e-12 {
        let dx = pts[last * 2] - pts[first * 2];
        let dy = pts[last * 2 + 1] - pts[first * 2 + 1];
        let dist = (dx * dx + dy * dy).sqrt();
        let a = dist / 3.0;
        alpha1 = a;
        alpha2 = a;
    } else {
        alpha1 = (c11 * x0 - c01 * x1) / det;
        alpha2 = (c00 * x1 - c01 * x0) / det;
    }

    let dx = pts[last * 2] - pts[first * 2];
    let dy = pts[last * 2 + 1] - pts[first * 2 + 1];
    let seg_length = (dx * dx + dy * dy).sqrt();
    let epsilon = 1e-6 * seg_length;

    let (a1, a2) = if alpha1 < epsilon || alpha2 < epsilon {
        let a = seg_length / 3.0;
        (a, a)
    } else {
        (alpha1, alpha2)
    };

    return vec![
        pts[first * 2], pts[first * 2 + 1],
        pts[first * 2] + t_hat1.0 * a1, pts[first * 2 + 1] + t_hat1.1 * a1,
        pts[last * 2] + t_hat2.0 * a2, pts[last * 2 + 1] + t_hat2.1 * a2,
        pts[last * 2], pts[last * 2 + 1],
    ];
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn newton_raphson_root_find(bezier: &[f64], px: f64, py: f64, u: f64) -> f64 {
    let mt = 1.0 - u;
    let qx = mt * mt * mt * bezier[0] + 3.0 * mt * mt * u * bezier[2]
        + 3.0 * mt * u * u * bezier[4] + u * u * u * bezier[6];
    let qy = mt * mt * mt * bezier[1] + 3.0 * mt * mt * u * bezier[3]
        + 3.0 * mt * u * u * bezier[5] + u * u * u * bezier[7];

    let q1x = 3.0 * mt * mt * (bezier[2] - bezier[0])
        + 6.0 * mt * u * (bezier[4] - bezier[2])
        + 3.0 * u * u * (bezier[6] - bezier[4]);
    let q1y = 3.0 * mt * mt * (bezier[3] - bezier[1])
        + 6.0 * mt * u * (bezier[5] - bezier[3])
        + 3.0 * u * u * (bezier[7] - bezier[5]);

    let num = (qx - px) * q1x + (qy - py) * q1y;
    let q2x = 6.0 * mt * (bezier[4] - 2.0 * bezier[2] + bezier[0])
        + 6.0 * u * (bezier[6] - 2.0 * bezier[4] + bezier[2]);
    let q2y = 6.0 * mt * (bezier[5] - 2.0 * bezier[3] + bezier[1])
        + 6.0 * u * (bezier[7] - 2.0 * bezier[5] + bezier[3]);
    let den = q1x * q1x + q1y * q1y + (qx - px) * q2x + (qy - py) * q2y;

    if den.abs() < 1e-12 {
        return u;
    }
    return (u - num / den).max(0.0).min(1.0);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn reparameterize(
    pts: &[f64],
    first: usize,
    last: usize,
    u: &[f64],
    bezier: &[f64],
) -> Vec<f64> {
    let mut u_prime: Vec<f64> = Vec::new();
    for i in 0..=(last - first) {
        u_prime.push(newton_raphson_root_find(bezier, pts[(first + i) * 2], pts[(first + i) * 2 + 1], u[i]));
    }
    return u_prime;
}
