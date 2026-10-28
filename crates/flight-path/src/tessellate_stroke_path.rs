use crate::path::{Path, PathMesh, StrokePathTessellationReason, StrokeStyle};
use crate::stroke_path_geometry::{StrokePathPieceGeometry, build_stroke_path_geometry};

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(PathWinding::NonZero);
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    fn test_style() -> StrokeStyle {
        return StrokeStyle {
            width: 2.0,
            cap: StrokeCap::Round,
            join: StrokeJoin::Round,
            miter_limit: 4.0,
            dash: Vec::new(),
            dash_offset: 0.0,
        };
    }

    #[test]
    fn path_tessellate_stroke_matches_tessellate_stroke_path() {
        let s = test_path();
        let ra = s.tessellate_stroke(&test_style(), Some(0.5));
        let rb = tessellate_stroke_path(&s, &test_style(), Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
const TRIANGLE_EPSILON: f64 = 1e-10;

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn append_round_cap(mesh: &mut PathMesh, start: &[f64], interior: &[f64], end: &[f64]) {
    let center = (mesh.vertices.len() / 2) as u32;
    mesh.vertices.push((start[0] + end[0]) / 2.0);
    mesh.vertices.push((start[1] + end[1]) / 2.0);
    let arc_base = (mesh.vertices.len() / 2) as u32;
    mesh.vertices.push(start[0]);
    mesh.vertices.push(start[1]);
    mesh.vertices.extend_from_slice(interior);
    mesh.vertices.push(end[0]);
    mesh.vertices.push(end[1]);
    let arc_count = (interior.len() / 2) + 2;
    for i in 0..arc_count - 1 {
        append_triangle(mesh, center, arc_base + i as u32, arc_base + i as u32 + 1);
    }
}

fn append_stroke_piece_mesh(mesh: &mut PathMesh, piece: &StrokePathPieceGeometry) {
    let section_count = piece.left.len() / 2;
    if section_count < 2 {
        return;
    }
    let base = (mesh.vertices.len() / 2) as u32;
    for i in 0..section_count {
        mesh.vertices.push(piece.left[i * 2]);
        mesh.vertices.push(piece.left[i * 2 + 1]);
        mesh.vertices.push(piece.right[i * 2]);
        mesh.vertices.push(piece.right[i * 2 + 1]);
    }
    let connection_count = if piece.closed {
        section_count
    } else {
        section_count - 1
    };
    for i in 0..connection_count {
        let next = ((i + 1) % section_count) as u32;
        let left = base + i as u32 * 2;
        let right = left + 1;
        let next_left = base + next * 2;
        let next_right = next_left + 1;
        append_triangle(mesh, left, right, next_left);
        append_triangle(mesh, next_left, right, next_right);
    }
    if !piece.closed && !piece.start_cap.is_empty() {
        let right = vec![piece.right[0], piece.right[1]];
        let left = vec![piece.left[0], piece.left[1]];
        append_round_cap(mesh, &right, &piece.start_cap, &left);
    }
    if !piece.closed && !piece.end_cap.is_empty() {
        let end = piece.left.len() - 2;
        let left = vec![piece.left[end], piece.left[end + 1]];
        let right = vec![piece.right[end], piece.right[end + 1]];
        append_round_cap(mesh, &left, &piece.end_cap, &right);
    }
}

fn append_triangle(mesh: &mut PathMesh, a: u32, b: u32, c: u32) {
    let ax = mesh.vertices[a as usize * 2];
    let ay = mesh.vertices[a as usize * 2 + 1];
    let bx = mesh.vertices[b as usize * 2];
    let by = mesh.vertices[b as usize * 2 + 1];
    let cx = mesh.vertices[c as usize * 2];
    let cy = mesh.vertices[c as usize * 2 + 1];
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)).abs() <= TRIANGLE_EPSILON {
        return;
    }
    mesh.indices.push(a);
    mesh.indices.push(b);
    mesh.indices.push(c);
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Builds a non-overlapping triangle mesh directly from stroke cross-sections.
/// Returns `None` if the centerline or its offset outline is pathological.
pub fn tessellate_stroke_path(
    path: &Path,
    style: &StrokeStyle,
    tolerance: Option<f64>,
) -> Option<PathMesh> {
    let tolerance = tolerance.unwrap_or(0.25);
    let geometry = build_stroke_path_geometry(path, style, tolerance);
    if geometry.issue != StrokePathTessellationReason::Ok {
        return None;
    }
    let mut mesh = PathMesh {
        vertices: Vec::new(),
        indices: Vec::new(),
    };
    for i in 0..geometry.pieces.len() {
        append_stroke_piece_mesh(&mut mesh, &geometry.pieces[i]);
    }
    if mesh.vertices.is_empty() {
        return None;
    }
    return Some(mesh);
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn tessellate_stroke(
        &self,
        style: &StrokeStyle,
        tolerance: Option<f64>,
    ) -> Option<PathMesh> {
        return tessellate_stroke_path(self, style, tolerance);
    }
}
