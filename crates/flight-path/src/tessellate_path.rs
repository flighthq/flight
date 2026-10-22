use crate::path::{Path, PathMesh};
use crate::flatten_path::flatten_path;

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
    fn path_tessellate_matches_tessellate_path() {
        let s = test_path();
        let ra = s.tessellate(Some(0.5));
        let rb = tessellate_path(&s, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn path_tessellate_into_matches_tessellate_path_into() {
        let mut oa0 = PathMesh { vertices: Vec::new(), indices: Vec::new() };
        let mut ob0 = PathMesh { vertices: Vec::new(), indices: Vec::new() };
        let s = test_path();
        s.tessellate_into(&mut oa0, Some(0.5));
        tessellate_path_into(&s, &mut ob0, Some(0.5));
        assert_eq!(format!("{:?}", oa0), format!("{:?}", ob0));
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn is_ear(contour: &[f64], ring: &[usize], a: usize, b: usize, c: usize) -> bool {
    let ax = contour[a * 2];
    let ay = contour[a * 2 + 1];
    let bx = contour[b * 2];
    let by = contour[b * 2 + 1];
    let cx = contour[c * 2];
    let cy = contour[c * 2 + 1];
    if (bx - ax) * (cy - by) - (by - ay) * (cx - bx) <= 0.0 {
        return false;
    }
    for i in 0..ring.len() {
        let p = ring[i];
        if p == a || p == b || p == c {
            continue;
        }
        if is_point_in_triangle(contour[p * 2], contour[p * 2 + 1], ax, ay, bx, by, cx, cy) {
            return false;
        }
    }
    return true;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn is_point_in_triangle(
    px: f64, py: f64,
    ax: f64, ay: f64,
    bx: f64, by: f64,
    cx: f64, cy: f64,
) -> bool {
    let d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    let d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    let d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    let has_negative = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_positive = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    return !(has_negative && has_positive);
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn tessellate_contour(source: &[f64], vertices: &mut Vec<f64>, indices: &mut Vec<u32>) {
    let mut pts: Vec<f64> = Vec::new();
    let mut i = 0;
    while i < source.len() {
        let x = source[i];
        let y = source[i + 1];
        if pts.len() >= 2 && pts[pts.len() - 2] == x && pts[pts.len() - 1] == y {
            i += 2;
            continue;
        }
        pts.push(x);
        pts.push(y);
        i += 2;
    }

    let mut count = pts.len() / 2;
    if count >= 2 && pts[0] == pts[(count - 1) * 2] && pts[1] == pts[(count - 1) * 2 + 1] {
        count -= 1;
    }
    if count < 3 {
        return;
    }

    let base = (vertices.len() / 2) as u32;
    for i in 0..count {
        vertices.push(pts[i * 2]);
        vertices.push(pts[i * 2 + 1]);
    }

    let mut twice_area: f64 = 0.0;
    for i in 0..count {
        let j = (i + 1) % count;
        twice_area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
    }

    let mut ring: Vec<usize> = Vec::new();
    if twice_area < 0.0 {
        for i in (0..count).rev() {
            ring.push(i);
        }
    } else {
        for i in 0..count {
            ring.push(i);
        }
    }

    let mut guard = ring.len() * ring.len();
    while ring.len() > 3 && guard > 0 {
        guard -= 1;
        let mut clipped = false;
        for i in 0..ring.len() {
            let a = ring[(i + ring.len() - 1) % ring.len()];
            let b = ring[i];
            let c = ring[(i + 1) % ring.len()];
            if is_ear(&pts, &ring, a, b, c) {
                indices.push(base + a as u32);
                indices.push(base + b as u32);
                indices.push(base + c as u32);
                ring.remove(i);
                clipped = true;
                break;
            }
        }
        if !clipped {
            break;
        }
    }
    if ring.len() == 3 {
        indices.push(base + ring[0] as u32);
        indices.push(base + ring[1] as u32);
        indices.push(base + ring[2] as u32);
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Triangulates a path's fill into a PathMesh by flattening its curves, then ear-clipping each contour.
pub fn tessellate_path(path: &Path, tolerance: Option<f64>) -> PathMesh {
    let tolerance = tolerance.unwrap_or(0.25);
    let mut vertices: Vec<f64> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();
    let mut contours = Vec::new();
    flatten_path(&mut contours, path, Some(tolerance));
    for i in 0..contours.len() {
        tessellate_contour(&contours[i], &mut vertices, &mut indices);
    }
    return PathMesh { vertices, indices };
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Tessellates into an existing `PathMesh`, clearing and reusing its backing arrays.
pub fn tessellate_path_into(path: &Path, out: &mut PathMesh, tolerance: Option<f64>) {
    let tolerance = tolerance.unwrap_or(0.25);
    out.vertices.clear();
    out.indices.clear();
    let mut contours = Vec::new();
    flatten_path(&mut contours, path, Some(tolerance));
    for i in 0..contours.len() {
        tessellate_contour(&contours[i], &mut out.vertices, &mut out.indices);
    }
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn tessellate(&self, tolerance: Option<f64>) -> PathMesh {
        return tessellate_path(self, tolerance);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn tessellate_into(&self, out: &mut PathMesh, tolerance: Option<f64>) {
        return tessellate_path_into(self, out, tolerance);
    }
}
