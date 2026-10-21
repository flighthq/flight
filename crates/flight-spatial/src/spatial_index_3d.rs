use crate::uniform_grid_3d::DEFAULT_SPATIAL_CELL_SIZE_3D;
use crate::{
    SpatialAabb3D, SpatialIndexingExplanation, SpatialObjectId, SpatialPair,
    create_uniform_grid_spatial_backend_3d,
};
use flight_entity::{EntityRuntimeSlot, allocate_entity};
use std::collections::HashSet;
use std::sync::Arc;

/// Four near-plane xyz corners followed by four corresponding far-plane xyz corners.
#[derive(Debug, Clone, Default)]
pub struct SpatialFrustum3D {
    pub corners: [f32; 24],
}

/// An open dispatch record, including third-party spatial backend implementations.
#[derive(Clone)]
pub struct SpatialIndexBackend3D {
    runtime: EntityRuntimeSlot,
    pub clear_spatial_index: Arc<dyn Fn() + Send + Sync>,
    pub explain_spatial_indexing:
        Arc<dyn Fn(SpatialObjectId) -> SpatialIndexingExplanation + Send + Sync>,
    pub insert_spatial_object: Arc<dyn Fn(SpatialObjectId, &SpatialAabb3D) -> bool + Send + Sync>,
    pub query_spatial_pairs: Arc<dyn Fn(&mut Vec<SpatialPair>) + Send + Sync>,
    pub query_spatial_point: Arc<dyn Fn(&mut Vec<SpatialObjectId>, f32, f32, f32) + Send + Sync>,
    pub query_spatial_ray:
        Arc<dyn Fn(&mut Vec<SpatialObjectId>, f32, f32, f32, f32, f32, f32) + Send + Sync>,
    pub query_spatial_region: Arc<dyn Fn(&mut Vec<SpatialObjectId>, &SpatialAabb3D) + Send + Sync>,
    pub remove_spatial_object: Arc<dyn Fn(SpatialObjectId) + Send + Sync>,
    pub update_spatial_object: Arc<dyn Fn(SpatialObjectId, &SpatialAabb3D) -> bool + Send + Sync>,
}

struct SpatialIndexRuntime3D {
    backend: SpatialIndexBackend3D,
    pairs: Vec<SpatialPair>,
    frustum_seen: HashSet<SpatialObjectId>,
    frustum_slice: Vec<SpatialObjectId>,
}

#[derive(Default)]
pub struct SpatialIndex3D {
    runtime: EntityRuntimeSlot,
    index_runtime: Option<SpatialIndexRuntime3D>,
}

const DEFAULT_FRUSTUM_SLICES: u32 = 8;

pub fn create_spatial_index_3d(backend: Option<SpatialIndexBackend3D>) -> SpatialIndex3D {
    let mut out = allocate_entity();
    initialize_spatial_index_3d(&mut out, backend);
    return out;
}

pub fn initialize_spatial_index_3d(
    out: &mut SpatialIndex3D,
    backend: Option<SpatialIndexBackend3D>,
) {
    out.index_runtime = Some(SpatialIndexRuntime3D {
        backend: backend.unwrap_or_else(|| {
            create_uniform_grid_spatial_backend_3d(DEFAULT_SPATIAL_CELL_SIZE_3D)
        }),
        pairs: Vec::new(),
        frustum_seen: HashSet::new(),
        frustum_slice: Vec::new(),
    });
}

pub fn clear_spatial_index_3d(index: &mut SpatialIndex3D) {
    let state = index
        .index_runtime
        .as_mut()
        .expect("initialized spatial index");
    (state.backend.clear_spatial_index)();
    state.pairs.clear();
    state.frustum_seen.clear();
    state.frustum_slice.clear();
}

fn dispatch_query_region_3d(
    index: &SpatialIndex3D,
    region: &SpatialAabb3D,
    out: &mut Vec<SpatialObjectId>,
) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .query_spatial_region)(out, region);
}

pub(crate) fn explain_spatial_indexing_3d_impl(
    index: &SpatialIndex3D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    return (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .explain_spatial_indexing)(id);
}

pub fn insert_spatial_object_3d(
    index: &mut SpatialIndex3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
) -> bool {
    return (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .insert_spatial_object)(id, bounds);
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_frustum_3d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex3D,
    frustum: &SpatialFrustum3D,
    slices: Option<u32>,
) {
    out.clear();
    let corners = &frustum.corners;
    let slice_count = slices.unwrap_or(DEFAULT_FRUSTUM_SLICES);
    if !(slice_count >= 1) {
        return;
    }

    let steps = slice_count;
    let state = index
        .index_runtime
        .as_mut()
        .expect("initialized spatial index");
    state.frustum_seen.clear();

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
                let y = corners[near_idx + 1] + (corners[far_idx + 1] - corners[near_idx + 1]) * t;
                let z = corners[near_idx + 2] + (corners[far_idx + 2] - corners[near_idx + 2]) * t;
                if x < min_x {
                    min_x = x;
                }
                if x > max_x {
                    max_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if y > max_y {
                    max_y = y;
                }
                if z < min_z {
                    min_z = z;
                }
                if z > max_z {
                    max_z = z;
                }
            }
        }
        if !min_x.is_finite() || !max_z.is_finite() {
            return;
        }

        let region = SpatialAabb3D {
            min_x,
            min_y,
            min_z,
            max_x,
            max_y,
            max_z,
        };
        (state.backend.query_spatial_region)(&mut state.frustum_slice, &region);

        for &id in &state.frustum_slice {
            if state.frustum_seen.contains(&id) {
                continue;
            }
            state.frustum_seen.insert(id);
            out.push(id);
        }
    }
}

/// Borrow stable index-owned pair storage, preserving addresses for a steady topology.
// flight-lint: allow(conform-params) Principal-approved borrowed pair view replaces TS caller-owned output to preserve pair identity without allocation
pub fn query_spatial_pairs_3d(index: &mut SpatialIndex3D) -> &[SpatialPair] {
    let state = index
        .index_runtime
        .as_mut()
        .expect("initialized spatial index");
    (state.backend.query_spatial_pairs)(&mut state.pairs);
    return &state.pairs;
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_point_3d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex3D,
    x: f32,
    y: f32,
    z: f32,
) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .query_spatial_point)(out, x, y, z);
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_ray_3d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex3D,
    x: f32,
    y: f32,
    z: f32,
    dx: f32,
    dy: f32,
    dz: f32,
) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .query_spatial_ray)(out, x, y, z, dx, dy, dz);
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_region_3d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex3D,
    region: &SpatialAabb3D,
) {
    dispatch_query_region_3d(index, region, out);
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_sphere_3d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex3D,
    x: f32,
    y: f32,
    z: f32,
    radius: f32,
) {
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
    dispatch_query_region_3d(index, &region, out);
}

pub fn remove_spatial_object_3d(index: &mut SpatialIndex3D, id: SpatialObjectId) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .remove_spatial_object)(id);
}

pub fn update_spatial_object_3d(
    index: &mut SpatialIndex3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
) -> bool {
    return (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .update_spatial_object)(id, bounds);
}

impl Default for SpatialIndexBackend3D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            clear_spatial_index: Arc::new(|| unreachable!("uninitialized spatial backend")),
            explain_spatial_indexing: Arc::new(|_| unreachable!("uninitialized spatial backend")),
            insert_spatial_object: Arc::new(|_, _| unreachable!("uninitialized spatial backend")),
            query_spatial_pairs: Arc::new(|_| unreachable!("uninitialized spatial backend")),
            query_spatial_point: Arc::new(|_, _, _, _| {
                unreachable!("uninitialized spatial backend")
            }),
            query_spatial_ray: Arc::new(|_, _, _, _, _, _, _| {
                unreachable!("uninitialized spatial backend")
            }),
            query_spatial_region: Arc::new(|_, _| unreachable!("uninitialized spatial backend")),
            remove_spatial_object: Arc::new(|_| unreachable!("uninitialized spatial backend")),
            update_spatial_object: Arc::new(|_, _| unreachable!("uninitialized spatial backend")),
        };
    }
}

flight_entity::impl_entity!(SpatialIndex3D);

flight_entity::impl_entity!(SpatialIndexBackend3D);
