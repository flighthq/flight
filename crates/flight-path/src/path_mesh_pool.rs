//! flight-compiler: target-native
//! flight-compiler: contract acquirePathMesh acquirePathMeshTyped releasePathMesh releasePathMeshTyped
use crate::path::{Path, PathMesh, PathMeshTyped};
use crate::tessellate_path::tessellate_path_into;
use crate::tessellate_path_typed::tessellate_path_typed_into;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn pathmeshpool_acquire_mesh_matches_acquire_path_mesh() {
        let mut a = create_path_mesh_pool();
        let mut b = create_path_mesh_pool();
        let ra = a.acquire_mesh(&test_path(), Some(0.5));
        let rb = acquire_path_mesh(&mut b, &test_path(), Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn pathmeshpool_acquire_mesh_typed_matches_acquire_path_mesh_typed() {
        let mut a = create_path_mesh_pool();
        let mut b = create_path_mesh_pool();
        let ra = a.acquire_mesh_typed(&test_path(), Some(0.5));
        let rb = acquire_path_mesh_typed(&mut b, &test_path(), Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn pathmeshpool_new_matches_create_path_mesh_pool() {
        let ra = PathMeshPool::new();
        let rb = create_path_mesh_pool();
        assert_eq!(
            format!("{:?}", (ra.meshes.len(), ra.typed_meshes.len())),
            format!("{:?}", (rb.meshes.len(), rb.typed_meshes.len()))
        );
    }

    #[test]
    fn pathmeshpool_release_mesh_matches_release_path_mesh() {
        let mut a = create_path_mesh_pool();
        let mut b = create_path_mesh_pool();
        a.release_mesh(PathMesh {
            vertices: vec![1.0],
            indices: vec![0],
        });
        release_path_mesh(
            &mut b,
            PathMesh {
                vertices: vec![1.0],
                indices: vec![0],
            },
        );
        assert_eq!(a.meshes, b.meshes);
        assert_eq!(
            a.meshes,
            vec![PathMesh {
                vertices: vec![1.0],
                indices: vec![0]
            }]
        );
    }

    #[test]
    fn pathmeshpool_release_mesh_typed_matches_release_path_mesh_typed() {
        let mut a = create_path_mesh_pool();
        let mut b = create_path_mesh_pool();
        a.release_mesh_typed(PathMeshTyped {
            vertices: vec![1.0].into_boxed_slice(),
            indices: vec![0].into_boxed_slice(),
        });
        release_path_mesh_typed(
            &mut b,
            PathMeshTyped {
                vertices: vec![1.0].into_boxed_slice(),
                indices: vec![0].into_boxed_slice(),
            },
        );
        assert_eq!(a.typed_meshes, b.typed_meshes);
        assert_eq!(
            a.typed_meshes,
            vec![PathMeshTyped {
                vertices: vec![1.0].into_boxed_slice(),
                indices: vec![0].into_boxed_slice()
            }]
        );
    }
}

const POOL_HIGH_WATER: usize = 64;

/// Pool-backed flatten+tessellate for hot-loop usage. Manages a reusable pool of PathMesh objects.
pub struct PathMeshPool {
    meshes: Vec<PathMesh>,
    typed_meshes: Vec<PathMeshTyped>,
}

// flight-lint: allow(conform-extra) D5: TS keeps the mesh pool as module state; Rust callers own an explicit pool
pub fn create_path_mesh_pool() -> PathMeshPool {
    return PathMeshPool {
        meshes: Vec::new(),
        typed_meshes: Vec::new(),
    };
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Retrieves a PathMesh from the pool, tessellates the given path into it, and returns it.
// flight-lint: allow(conform-params) D5: TS keeps the mesh pool as module state; Rust takes the explicit pool first
pub fn acquire_path_mesh(pool: &mut PathMeshPool, path: &Path, tolerance: Option<f64>) -> PathMesh {
    let tolerance = tolerance.unwrap_or(0.25);
    let mut mesh = if !pool.meshes.is_empty() {
        pool.meshes.pop().unwrap()
    } else {
        PathMesh {
            vertices: Vec::new(),
            indices: Vec::new(),
        }
    };
    tessellate_path_into(path, &mut mesh, Some(tolerance));
    return mesh;
}

/// Acquires a typed mesh from the pool (TS `acquirePathMeshTyped`, whose pool is module state; here it
/// is the explicit `pool`, D5) and tessellates `path` into it. `tolerance` defaults to 0.25.
// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
// flight-lint: allow(conform-params) D5: TS keeps the mesh pool as module state; Rust takes the explicit pool first
pub fn acquire_path_mesh_typed(
    pool: &mut PathMeshPool,
    path: &Path,
    tolerance: Option<f64>,
) -> PathMeshTyped {
    let mut mesh = match pool.typed_meshes.pop() {
        Some(mesh) => mesh,
        None => PathMeshTyped {
            vertices: Box::default(),
            indices: Box::default(),
        },
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

impl PathMeshPool {
    pub fn new() -> Self {
        return create_path_mesh_pool();
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn acquire_mesh(&mut self, path: &Path, tolerance: Option<f64>) -> PathMesh {
        return acquire_path_mesh(self, path, tolerance);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn acquire_mesh_typed(&mut self, path: &Path, tolerance: Option<f64>) -> PathMeshTyped {
        return acquire_path_mesh_typed(self, path, tolerance);
    }

    pub fn release_mesh(&mut self, mesh: PathMesh) {
        return release_path_mesh(self, mesh);
    }

    pub fn release_mesh_typed(&mut self, mesh: PathMeshTyped) {
        return release_path_mesh_typed(self, mesh);
    }
}
