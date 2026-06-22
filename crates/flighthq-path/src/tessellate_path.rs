//! Path tessellation — triangulates a [`Path`]'s fill into a [`PathMesh`].
//!
//! Curves are first flattened via [`flatten_path`], then each contour is ear-clipped into
//! triangles. Concave outlines are handled; holes/overlap/self-intersection are **not**
//! subtracted here. Use the flatten + stencil-then-cover route for those. Winding rule is
//! not consulted by this triangulator.

use flighthq_types::{Path, PathMesh};

use crate::flatten_path::flatten_path;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/// Triangulates a path's fill into a [`PathMesh`] by flattening its curves then
/// ear-clipping each contour.
///
/// `tolerance` controls the flatness of curve subdivision (same units as the path).
pub fn tessellate_path(path: &Path, tolerance: f32, out: &mut PathMesh) {
    let contours = flatten_path(path, tolerance);
    for contour in &contours {
        tessellate_contour(contour, &mut out.vertices, &mut out.indices);
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Ear-clips one simple polygon contour (flat x, y pairs) into the shared vertex/index
/// buffers. Vertices are appended in source order; the working ring is normalised to CCW
/// so a positive cross product identifies a convex (ear-candidate) vertex.
fn tessellate_contour(source: &[f32], vertices: &mut Vec<f32>, indices: &mut Vec<u32>) {
    // Drop coincident consecutive points (zero-length edges) into `pts` first. A duplicate
    // vertex makes a degenerate corner that is never a valid ear, which stalls the clip loop
    // and leaves the polygon only partly triangulated — common when an outline repeats its
    // start point (moveTo P then lineTo P).
    let mut pts: Vec<f32> = Vec::with_capacity(source.len());
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
    // Drop a trailing point coincident with the first (an explicitly closed contour).
    if count >= 2 && pts[0] == pts[(count - 1) * 2] && pts[1] == pts[(count - 1) * 2 + 1] {
        count -= 1;
    }
    if count < 3 {
        return;
    }

    let base = (vertices.len() / 2) as u32;
    for k in 0..count {
        vertices.push(pts[k * 2]);
        vertices.push(pts[k * 2 + 1]);
    }

    // Compute signed twice-area (shoelace formula) to determine winding.
    let mut twice_area = 0.0f32;
    for k in 0..count {
        let j = (k + 1) % count;
        twice_area += pts[k * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[k * 2 + 1];
    }

    // Build working ring normalised to counter-clockwise so a positive cross product means
    // a convex (ear-candidate) vertex.
    let mut ring: Vec<usize> = Vec::with_capacity(count);
    if twice_area < 0.0 {
        for k in (0..count).rev() {
            ring.push(k);
        }
    } else {
        for k in 0..count {
            ring.push(k);
        }
    }

    let mut guard = (ring.len() * ring.len()) as isize;
    while ring.len() > 3 && guard > 0 {
        guard -= 1;
        let mut clipped = false;
        let rlen = ring.len();
        let mut k = 0;
        while k < ring.len() {
            let a = ring[(k + rlen - 1) % rlen];
            let b = ring[k];
            let c = ring[(k + 1) % rlen];
            if is_ear(&pts, &ring, a, b, c) {
                indices.push(base + a as u32);
                indices.push(base + b as u32);
                indices.push(base + c as u32);
                ring.remove(k);
                clipped = true;
                break;
            }
            k += 1;
        }
        if !clipped {
            break; // degenerate (e.g. self-intersection); stop rather than spin
        }
    }
    if ring.len() == 3 {
        indices.push(base + ring[0] as u32);
        indices.push(base + ring[1] as u32);
        indices.push(base + ring[2] as u32);
    }
}

/// Returns `true` when triangle `(a, b, c)` is a convex CCW corner containing no other
/// ring vertex.
fn is_ear(contour: &[f32], ring: &[usize], a: usize, b: usize, c: usize) -> bool {
    let ax = contour[a * 2];
    let ay = contour[a * 2 + 1];
    let bx = contour[b * 2];
    let by = contour[b * 2 + 1];
    let cx = contour[c * 2];
    let cy = contour[c * 2 + 1];
    // Reflex or collinear corner is not an ear.
    if (bx - ax) * (cy - by) - (by - ay) * (cx - bx) <= 0.0 {
        return false;
    }
    for &p in ring {
        if p == a || p == b || p == c {
            continue;
        }
        if is_point_in_triangle(contour[p * 2], contour[p * 2 + 1], ax, ay, bx, by, cx, cy) {
            return false;
        }
    }
    true
}

fn is_point_in_triangle(
    px: f32,
    py: f32,
    ax: f32,
    ay: f32,
    bx: f32,
    by: f32,
    cx: f32,
    cy: f32,
) -> bool {
    let d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    let d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    let d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    let has_negative = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_positive = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(has_negative && has_positive)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{
        append_path_curve_to, append_path_line_to, append_path_move_to, create_path,
    };
    use flighthq_types::PathWinding;

    fn make_triangle_path() -> Path {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 5.0, 10.0);
        p
    }

    fn make_square_path() -> Path {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 10.0, 10.0);
        append_path_line_to(&mut p, 0.0, 10.0);
        p
    }

    // is_point_in_triangle
    #[test]
    fn is_point_in_triangle_centroid_is_inside() {
        // Triangle (0,0),(6,0),(3,6): centroid ≈ (3,2)
        assert!(is_point_in_triangle(3.0, 2.0, 0.0, 0.0, 6.0, 0.0, 3.0, 6.0));
    }

    #[test]
    fn is_point_in_triangle_outside_point() {
        assert!(!is_point_in_triangle(
            10.0, 10.0, 0.0, 0.0, 6.0, 0.0, 3.0, 6.0
        ));
    }

    // tessellate_path — empty path produces empty mesh
    #[test]
    fn tessellate_path_empty_path_empty_mesh() {
        let p = create_path(PathWinding::NonZero);
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        assert!(mesh.vertices.is_empty());
        assert!(mesh.indices.is_empty());
    }

    // tessellate_path — triangle produces exactly one triangle
    #[test]
    fn tessellate_path_triangle_produces_one_triangle() {
        let p = make_triangle_path();
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        // 3 vertices, 3 indices
        assert_eq!(mesh.vertices.len(), 6);
        assert_eq!(mesh.indices.len(), 3);
    }

    // tessellate_path — square produces 2 triangles (4 verts, 6 indices)
    #[test]
    fn tessellate_path_square_produces_two_triangles() {
        let p = make_square_path();
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        assert_eq!(mesh.vertices.len(), 8);
        assert_eq!(mesh.indices.len(), 6);
    }

    // tessellate_path — all indices are in bounds
    #[test]
    fn tessellate_path_indices_in_bounds() {
        let p = make_square_path();
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        let vertex_count = (mesh.vertices.len() / 2) as u32;
        for &idx in &mesh.indices {
            assert!(
                idx < vertex_count,
                "index {idx} out of bounds (vertex_count={vertex_count})"
            );
        }
    }

    // tessellate_path — degenerate (< 3 unique points) is skipped
    #[test]
    fn tessellate_path_degenerate_two_point_path_skipped() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 1.0, 1.0);
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        assert!(mesh.indices.is_empty());
    }

    // tessellate_path — two contours produce independent vertex sets
    #[test]
    fn tessellate_path_two_triangles_independent_indices() {
        let mut p = create_path(PathWinding::NonZero);
        // First triangle
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 5.0, 10.0);
        // Second triangle
        append_path_move_to(&mut p, 20.0, 0.0);
        append_path_line_to(&mut p, 30.0, 0.0);
        append_path_line_to(&mut p, 25.0, 10.0);
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        assert_eq!(mesh.vertices.len(), 12); // 6 verts × 2
        assert_eq!(mesh.indices.len(), 6); // 2 triangles × 3
        // Second triangle's indices should be offset by 3
        let second = &mesh.indices[3..];
        assert!(second.iter().all(|&i| i >= 3 && i < 6));
    }

    // tessellate_path — quadratic curve path triangulates without panic
    #[test]
    fn tessellate_path_quadratic_curve_completes() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_curve_to(&mut p, 50.0, 100.0, 100.0, 0.0);
        append_path_line_to(&mut p, 0.0, 0.0);
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        assert!(!mesh.indices.is_empty());
        assert_eq!(mesh.indices.len() % 3, 0);
    }

    // tessellate_path — closed contour (trailing point == first point) is handled
    #[test]
    fn tessellate_path_closed_contour_deduplicated() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 5.0, 10.0);
        append_path_line_to(&mut p, 0.0, 0.0); // explicit close back to start
        let mut mesh = PathMesh::default();
        tessellate_path(&p, 0.25, &mut mesh);
        // Should still produce exactly one triangle despite the duplicate closing point
        assert_eq!(mesh.vertices.len(), 6);
        assert_eq!(mesh.indices.len(), 3);
    }
}
