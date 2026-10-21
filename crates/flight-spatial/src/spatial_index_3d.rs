use std::collections::HashSet;

use crate::{
    SpatialIndexingExplanation, SpatialIndexingGuard, SpatialObjectId, SpatialPair,
    bvh_3d::{
        Bvh3D, DEFAULT_BVH_MARGIN_3D, clear_bvh_3d, create_bvh_3d, explain_bvh_3d,
        insert_bvh_3d, query_bvh_3d_pairs, query_bvh_3d_point, query_bvh_3d_ray,
        query_bvh_3d_region, remove_spatial_object_bvh_3d, update_bvh_3d,
    },
    uniform_grid_3d::{
        DEFAULT_SPATIAL_CELL_SIZE_3D, SpatialAabb3D, UniformGrid3D, clear_grid_3d,
        explain_grid_3d_indexing, insert_into_grid_3d, query_grid_3d_pairs, query_grid_3d_point,
        query_grid_3d_ray, query_grid_3d_region, remove_spatial_object_grid_3d,
        update_grid_3d_object,
    },
    SpatialIndexingOperation,
};

// ---------------------------------------------------------------------------
// Structs / enums
// ---------------------------------------------------------------------------

/// The frustum corner data for sliced frustum queries. Contains 24 floats: four near-plane
/// corners (xyz each) then four far-plane corners (xyz each).
#[derive(Debug, Clone, Default)]
pub struct SpatialFrustum3D {
    pub corners: Vec<f32>,
}

/// The backend discriminant. Two implementations: uniform grid and BVH.
pub enum SpatialBackend3D {
    UniformGrid(UniformGrid3D),
    Bvh(Bvh3D),
}

/// A 3D spatial index that dispatches to either a uniform grid or a BVH backend.
pub struct SpatialIndex3D {
    pub backend: SpatialBackend3D,
    pub guard: Option<SpatialIndexingGuard>,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FRUSTUM_SLICES: u32 = 8;

// ---------------------------------------------------------------------------
// Free functions -- constructors
// ---------------------------------------------------------------------------

/// Creates a 3D spatial index backed by a BVH (exported name matching TS).
pub fn create_bvh_spatial_backend_3d(margin: f32) -> SpatialIndex3D {
    return create_spatial_index_3d_with_bvh(margin);
}

pub fn create_spatial_frustum_3d(corners: Vec<f32>) -> SpatialFrustum3D {
    return SpatialFrustum3D { corners };
}

/// Creates a 3D spatial index with the default uniform-grid backend.
pub fn create_spatial_index_3d(cell_size: f32) -> SpatialIndex3D {
    let mut out = SpatialIndex3D {
        backend: SpatialBackend3D::UniformGrid(UniformGrid3D::default()),
        guard: None,
    };
    initialize_spatial_index_3d(&mut out, cell_size);
    return out;
}

/// Creates a 3D spatial index with the BVH backend.
pub fn create_spatial_index_3d_with_bvh(margin: f32) -> SpatialIndex3D {
    return SpatialIndex3D {
        backend: SpatialBackend3D::Bvh(create_bvh_3d(margin)),
        guard: None,
    };
}

/// Creates a 3D spatial index backed by a uniform grid (exported name matching TS).
pub fn create_uniform_grid_spatial_backend_3d(cell_size: f32) -> SpatialIndex3D {
    return create_spatial_index_3d(cell_size);
}

pub fn initialize_bvh_spatial_backend_3d(out: &mut SpatialIndex3D, margin: f32) {
    out.backend = SpatialBackend3D::Bvh(create_bvh_3d(margin));
    out.guard = None;
}

pub fn initialize_spatial_index_3d(out: &mut SpatialIndex3D, cell_size: f32) {
    let mut grid = UniformGrid3D::default();
    grid.cell_size = cell_size;
    out.backend = SpatialBackend3D::UniformGrid(grid);
    out.guard = None;
}

pub fn initialize_uniform_grid_spatial_backend_3d(out: &mut SpatialIndex3D, cell_size: f32) {
    initialize_spatial_index_3d(out, cell_size);
}

pub fn clear_spatial_index_3d(index: &mut SpatialIndex3D) {
    match &mut index.backend {
        SpatialBackend3D::UniformGrid(grid) => clear_grid_3d(grid),
        SpatialBackend3D::Bvh(bvh) => clear_bvh_3d(bvh),
    }
}

fn dispatch_query_region_3d(
    backend: &mut SpatialBackend3D,
    region: &SpatialAabb3D,
    out: &mut Vec<SpatialObjectId>,
) {
    match backend {
        SpatialBackend3D::UniformGrid(grid) => query_grid_3d_region(grid, region, out),
        SpatialBackend3D::Bvh(bvh) => query_bvh_3d_region(bvh, region, out),
    }
}

pub(crate) fn explain_spatial_indexing_3d_impl(
    index: &SpatialIndex3D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    match &index.backend {
        SpatialBackend3D::UniformGrid(grid) => explain_grid_3d_indexing(grid, id),
        SpatialBackend3D::Bvh(bvh) => explain_bvh_3d(bvh, id),
    }
}

pub fn insert_spatial_object_3d(
    index: &mut SpatialIndex3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
) -> bool {
    let guard = index.guard;
    match &mut index.backend {
        SpatialBackend3D::UniformGrid(grid) => {
            insert_into_grid_3d(grid, id, bounds, SpatialIndexingOperation::Insert, guard)
        }
        SpatialBackend3D::Bvh(bvh) => {
            insert_bvh_3d(bvh, id, bounds, SpatialIndexingOperation::Insert, guard)
        }
    }
}

/// Fills `out` (cleared first) with candidate ids whose bounds may lie inside the view frustum.
/// The frustum is sliced into axis-aligned sub-boxes for tighter coverage.
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_frustum_3d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex3D, frustum: &SpatialFrustum3D, slices: Option<u32>) {
    out.clear();
    let corners = &frustum.corners;
    let slice_count = slices.unwrap_or(DEFAULT_FRUSTUM_SLICES);
    if corners.len() < 24 || !(slice_count >= 1) {
        return;
    }

    let steps = slice_count;
    let mut frustum_seen: HashSet<SpatialObjectId> = HashSet::new();
    let mut frustum_slice: Vec<SpatialObjectId> = Vec::new();

    for slice in 0..steps {
        let near_t = slice as f32 / steps as f32;
        let far_t = (slice + 1) as f32 / steps as f32;

        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut min_z = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut max_z = f32::NEG_INFINITY;

        for corner in 0..4u32 {
            let near_idx = (corner * 3) as usize;
            let far_idx = (12 + corner * 3) as usize;
            for &t in &[near_t, far_t] {
                let x = corners[near_idx] + (corners[far_idx] - corners[near_idx]) * t;
                let y = corners[near_idx + 1]
                    + (corners[far_idx + 1] - corners[near_idx + 1]) * t;
                let z = corners[near_idx + 2]
                    + (corners[far_idx + 2] - corners[near_idx + 2]) * t;
                if x < min_x { min_x = x; }
                if x > max_x { max_x = x; }
                if y < min_y { min_y = y; }
                if y > max_y { max_y = y; }
                if z < min_z { min_z = z; }
                if z > max_z { max_z = z; }
            }
        }
        if !min_x.is_finite() || !max_z.is_finite() {
            return;
        }

        let region = SpatialAabb3D { min_x, min_y, min_z, max_x, max_y, max_z };
        dispatch_query_region_3d(&mut index.backend, &region, &mut frustum_slice);

        for &id in &frustum_slice {
            if frustum_seen.contains(&id) { continue; }
            frustum_seen.insert(id);
            out.push(id);
        }
    }
}

/// Fill the cleared output with deduplicated candidate pairs.
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_pairs_3d(out: &mut Vec<SpatialPair>, index: &mut SpatialIndex3D) {
    match &mut index.backend {
        SpatialBackend3D::UniformGrid(grid) => query_grid_3d_pairs(grid, out),
        SpatialBackend3D::Bvh(bvh) => query_bvh_3d_pairs(bvh, out),
    }
}

/// Fill the cleared output with objects whose bounds contain the point.
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_point_3d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex3D, x: f32, y: f32, z: f32) {
    match &mut index.backend {
        SpatialBackend3D::UniformGrid(grid) => query_grid_3d_point(grid, x, y, z, out),
        SpatialBackend3D::Bvh(bvh) => query_bvh_3d_point(bvh, x, y, z, out),
    }
}

#[allow(clippy::too_many_arguments)]
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_ray_3d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex3D, x: f32, y: f32, z: f32, dx: f32, dy: f32, dz: f32) {
    match &mut index.backend {
        SpatialBackend3D::UniformGrid(grid) => query_grid_3d_ray(grid, x, y, z, dx, dy, dz, out),
        SpatialBackend3D::Bvh(bvh) => query_bvh_3d_ray(bvh, x, y, z, dx, dy, dz, out),
    }
}

/// Fill the cleared output with objects whose bounds overlap the region.
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_region_3d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex3D, region: &SpatialAabb3D) {
    dispatch_query_region_3d(&mut index.backend, region, out);
}

/// Fills `out` (cleared first) with candidate ids whose bounds may lie within `radius` of a
/// point. Uses the sphere's bounding cube, not an exact sphere test.
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_sphere_3d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex3D, x: f32, y: f32, z: f32, radius: f32) {
    out.clear();
    if !x.is_finite() || !y.is_finite() || !z.is_finite() || !(radius >= 0.0) {
        return;
    }
    let region = SpatialAabb3D {
        min_x: x - radius,
        min_y: y - radius,
        min_z: z - radius,
        max_x: x + radius,
        max_y: y + radius,
        max_z: z + radius,
    };
    dispatch_query_region_3d(&mut index.backend, &region, out);
}

pub fn remove_spatial_object_3d(index: &mut SpatialIndex3D, id: SpatialObjectId) {
    let guard = index.guard;
    match &mut index.backend {
        SpatialBackend3D::UniformGrid(grid) => remove_spatial_object_grid_3d(grid, id, guard),
        SpatialBackend3D::Bvh(bvh) => remove_spatial_object_bvh_3d(bvh, id, guard),
    }
}

pub fn set_spatial_indexing_guard_3d(
    index: &mut SpatialIndex3D,
    guard: Option<SpatialIndexingGuard>,
) {
    index.guard = guard;
}

pub fn update_spatial_object_3d(
    index: &mut SpatialIndex3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
) -> bool {
    let guard = index.guard;
    match &mut index.backend {
        SpatialBackend3D::UniformGrid(grid) => update_grid_3d_object(grid, id, bounds, guard),
        SpatialBackend3D::Bvh(bvh) => update_bvh_3d(bvh, id, bounds, guard),
    }
}

// ---------------------------------------------------------------------------
// impl blocks (Rust-side sugar, NOT transpiled)
// ---------------------------------------------------------------------------

impl SpatialIndex3D {
    pub fn clear(&mut self) {
        clear_spatial_index_3d(self);
    }

    pub fn insert(&mut self, id: SpatialObjectId, bounds: &SpatialAabb3D) -> bool {
        return insert_spatial_object_3d(self, id, bounds);
    }

    pub fn new_bvh(margin: f32) -> Self {
        return create_spatial_index_3d_with_bvh(margin);
    }

    pub fn new_grid(cell_size: f32) -> Self {
        return create_spatial_index_3d(cell_size);
    }

    pub fn remove(&mut self, id: SpatialObjectId) {
        remove_spatial_object_3d(self, id);
    }

    pub fn update(&mut self, id: SpatialObjectId, bounds: &SpatialAabb3D) -> bool {
        return update_spatial_object_3d(self, id, bounds);
    }
}
