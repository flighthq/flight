use crate::path::{Path, PathMesh, PathMeshTyped};
use crate::tessellate_path::tessellate_path_into;
use crate::tessellate_path_typed::tessellate_path_typed_into;

const POOL_HIGH_WATER: usize = 64;

/// Pool-backed flatten+tessellate for hot-loop usage. Manages a reusable pool of PathMesh objects.
pub struct PathMeshPool {
    meshes: Vec<PathMesh>,
    typed_meshes: Vec<PathMeshTyped>,
}

// flight-lint: allow(conform-extra) D5: TS keeps the mesh pool as module state; Rust callers own an explicit pool
pub fn create_path_mesh_pool() -> PathMeshPool {
    return PathMeshPool { meshes: Vec::new(), typed_meshes: Vec::new() };
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Retrieves a PathMesh from the pool, tessellates the given path into it, and returns it.
// flight-lint: allow(conform-params) D5: TS keeps the mesh pool as module state; Rust takes the explicit pool first
pub fn acquire_path_mesh(pool: &mut PathMeshPool, path: &Path, tolerance: Option<f64>) -> PathMesh {
    let tolerance = tolerance.unwrap_or(0.25);
    let mut mesh = if !pool.meshes.is_empty() {
        pool.meshes.pop().unwrap()
    } else {
        PathMesh { vertices: Vec::new(), indices: Vec::new() }
    };
    tessellate_path_into(path, &mut mesh, Some(tolerance));
    return mesh;
}

/// Acquires a typed mesh from the pool (TS `acquirePathMeshTyped`, whose pool is module state; here it
/// is the explicit `pool`, D5) and tessellates `path` into it. `tolerance` defaults to 0.25.
// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
// flight-lint: allow(conform-params) D5: TS keeps the mesh pool as module state; Rust takes the explicit pool first
pub fn acquire_path_mesh_typed(pool: &mut PathMeshPool, path: &Path, tolerance: Option<f64>) -> PathMeshTyped {
    let mut mesh = match pool.typed_meshes.pop() {
        Some(mesh) => mesh,
        None => PathMeshTyped { vertices: Box::default(), indices: Box::default() },
    };
    tessellate_path_typed_into(path, &mut mesh, tolerance);
    return mesh;
}

/// Returns a PathMesh to the pool. The mesh must not be used after this call.
// flight-lint: allow(conform-params) D5: TS keeps the mesh pool as module state; Rust takes the explicit pool first
pub fn release_path_mesh(pool: &mut PathMeshPool, mesh: PathMesh) {
    if pool.meshes.len() < POOL_HIGH_WATER {
        pool.meshes.push(mesh);
    }
}

/// Returns a typed mesh to the pool for reuse, up to the pool's high-water mark.
// flight-lint: allow(conform-params) D5: TS keeps the mesh pool as module state; Rust takes the explicit pool first
pub fn release_path_mesh_typed(pool: &mut PathMeshPool, mesh: PathMeshTyped) {
    if pool.typed_meshes.len() < POOL_HIGH_WATER {
        pool.typed_meshes.push(mesh);
    }
}
