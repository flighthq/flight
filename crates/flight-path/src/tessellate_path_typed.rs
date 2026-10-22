use crate::path::{Path, PathMeshTyped};
use crate::tessellate_path::tessellate_path;

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
    fn path_tessellate_typed_matches_tessellate_path_typed() {
        let s = test_path();
        let ra = s.tessellate_typed(Some(0.5));
        let rb = tessellate_path_typed(&s, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn path_tessellate_typed_into_matches_tessellate_path_typed_into() {
        let mut oa0 = PathMeshTyped {
            vertices: Vec::new().into_boxed_slice(),
            indices: Vec::new().into_boxed_slice(),
        };
        let mut ob0 = PathMeshTyped {
            vertices: Vec::new().into_boxed_slice(),
            indices: Vec::new().into_boxed_slice(),
        };
        let s = test_path();
        s.tessellate_typed_into(&mut oa0, Some(0.5));
        tessellate_path_typed_into(&s, &mut ob0, Some(0.5));
        assert_eq!(format!("{:?}", oa0), format!("{:?}", ob0));
    }
}

/// Tessellates `path` into a typed-array mesh (TS `tessellatePathTyped`); `tolerance` defaults to
/// 0.25. Vertices narrow to f32 exactly as a TS `Float32Array` store rounds.
// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
pub fn tessellate_path_typed(path: &Path, tolerance: Option<f64>) -> PathMeshTyped {
    let mesh = tessellate_path(path, tolerance);
    let vertices: Vec<f32> = mesh.vertices.iter().map(|v| *v as f32).collect();
    return PathMeshTyped {
        vertices: vertices.into_boxed_slice(),
        indices: mesh.indices.into_boxed_slice(),
    };
}

/// Tessellates `path` into `out`, growing either buffer only when it is too short and otherwise
/// reusing it (TS `tessellatePathTypedInto`); entries past the new mesh keep their old values, as in
/// TS. `tolerance` defaults to 0.25.
// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
pub fn tessellate_path_typed_into(path: &Path, out: &mut PathMeshTyped, tolerance: Option<f64>) {
    let mesh = tessellate_path(path, tolerance);
    let v_len = mesh.vertices.len();
    let i_len = mesh.indices.len();
    if out.vertices.len() < v_len {
        out.vertices = vec![0.0_f32; v_len].into_boxed_slice();
    }
    if out.indices.len() < i_len {
        out.indices = vec![0_u32; i_len].into_boxed_slice();
    }
    for i in 0..v_len {
        out.vertices[i] = mesh.vertices[i] as f32;
    }
    for i in 0..i_len {
        out.indices[i] = mesh.indices[i];
    }
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn tessellate_typed(&self, tolerance: Option<f64>) -> PathMeshTyped {
        return tessellate_path_typed(self, tolerance);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn tessellate_typed_into(&self, out: &mut PathMeshTyped, tolerance: Option<f64>) {
        return tessellate_path_typed_into(self, out, tolerance);
    }
}
