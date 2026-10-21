use crate::path::{Path, PathMeshTyped};
use crate::tessellate_path::tessellate_path;

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
