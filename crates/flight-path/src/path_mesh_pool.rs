use crate::path::{Path, PathMesh};
use crate::tessellate_path::tessellate_path_into;

const POOL_HIGH_WATER: usize = 64;

/// Pool-backed flatten+tessellate for hot-loop usage. Manages a reusable pool of PathMesh objects.
pub struct PathMeshPool {
    meshes: Vec<PathMesh>,
}

pub fn create_path_mesh_pool() -> PathMeshPool {
    return PathMeshPool { meshes: Vec::new() };
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Retrieves a PathMesh from the pool, tessellates the given path into it, and returns it.
pub fn acquire_path_mesh(pool: &mut PathMeshPool, path: &Path, tolerance: f64) -> PathMesh {
    let mut mesh = if !pool.meshes.is_empty() {
        pool.meshes.pop().unwrap()
    } else {
        PathMesh { vertices: Vec::new(), indices: Vec::new() }
    };
    tessellate_path_into(path, &mut mesh, tolerance);
    return mesh;
}

/// Returns a PathMesh to the pool. The mesh must not be used after this call.
pub fn release_path_mesh(pool: &mut PathMeshPool, mesh: PathMesh) {
    if pool.meshes.len() < POOL_HIGH_WATER {
        pool.meshes.push(mesh);
    }
}
