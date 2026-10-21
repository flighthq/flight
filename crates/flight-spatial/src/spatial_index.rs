use crate::{SpatialIndexingExplanation, SpatialObjectId, create_uniform_grid_spatial_backend_2d};
use flight_entity::{EntityRuntimeSlot, allocate_entity};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SpatialAabb2D {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SpatialPair {
    pub a: SpatialObjectId,
    pub b: SpatialObjectId,
}

/// An open dispatch record; callbacks capture the chosen backend's state.
#[derive(Clone)]
pub struct SpatialIndexBackend2D {
    pub clear_spatial_index: Arc<dyn Fn() + Send + Sync>,
    pub explain_spatial_indexing:
        Arc<dyn Fn(SpatialObjectId) -> SpatialIndexingExplanation + Send + Sync>,
    pub insert_spatial_object: Arc<dyn Fn(SpatialObjectId, &SpatialAabb2D) -> bool + Send + Sync>,
    pub query_spatial_pairs: Arc<dyn Fn(&mut Vec<SpatialPair>) + Send + Sync>,
    pub query_spatial_point: Arc<dyn Fn(&mut Vec<SpatialObjectId>, f32, f32) + Send + Sync>,
    pub query_spatial_ray: Arc<dyn Fn(&mut Vec<SpatialObjectId>, f32, f32, f32, f32) + Send + Sync>,
    pub query_spatial_region: Arc<dyn Fn(&mut Vec<SpatialObjectId>, &SpatialAabb2D) + Send + Sync>,
    pub remove_spatial_object: Arc<dyn Fn(SpatialObjectId) + Send + Sync>,
    pub update_spatial_object: Arc<dyn Fn(SpatialObjectId, &SpatialAabb2D) -> bool + Send + Sync>,
}

struct SpatialIndexRuntime2D {
    backend: SpatialIndexBackend2D,
    pairs: Vec<SpatialPair>,
}

#[derive(Default)]
pub struct SpatialIndex2D {
    runtime: EntityRuntimeSlot,
    index_runtime: Option<SpatialIndexRuntime2D>,
}

pub const DEFAULT_SPATIAL_CELL_SIZE: f32 = 128.0;

pub fn create_spatial_index_2d(backend: Option<SpatialIndexBackend2D>) -> SpatialIndex2D {
    let mut out = allocate_entity();
    initialize_spatial_index_2d(&mut out, backend);
    return out;
}

pub fn initialize_spatial_index_2d(
    out: &mut SpatialIndex2D,
    backend: Option<SpatialIndexBackend2D>,
) {
    out.index_runtime = Some(SpatialIndexRuntime2D {
        backend: backend
            .unwrap_or_else(|| create_uniform_grid_spatial_backend_2d(DEFAULT_SPATIAL_CELL_SIZE)),
        pairs: Vec::new(),
    });
}

pub fn clear_spatial_index_2d(index: &mut SpatialIndex2D) {
    let state = index
        .index_runtime
        .as_mut()
        .expect("initialized spatial index");
    (state.backend.clear_spatial_index)();
    state.pairs.clear();
}

pub(crate) fn explain_index_2d(
    index: &SpatialIndex2D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    return (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .explain_spatial_indexing)(id);
}

pub fn insert_spatial_object_2d(
    index: &mut SpatialIndex2D,
    id: SpatialObjectId,
    bounds: &SpatialAabb2D,
) -> bool {
    return (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .insert_spatial_object)(id, bounds);
}

/// Borrow the index's reusable pair storage. A steady topology preserves pair addresses.
// flight-lint: allow(conform-params) Principal-approved borrowed pair view replaces TS caller-owned output to preserve pair identity without allocation
pub fn query_spatial_pairs_2d(index: &mut SpatialIndex2D) -> &[SpatialPair] {
    let state = index
        .index_runtime
        .as_mut()
        .expect("initialized spatial index");
    (state.backend.query_spatial_pairs)(&mut state.pairs);
    return &state.pairs;
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_point_2d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex2D,
    x: f32,
    y: f32,
) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .query_spatial_point)(out, x, y);
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_ray_2d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex2D,
    x: f32,
    y: f32,
    dx: f32,
    dy: f32,
) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .query_spatial_ray)(out, x, y, dx, dy);
}

// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_region_2d(
    out: &mut Vec<SpatialObjectId>,
    index: &mut SpatialIndex2D,
    region: &SpatialAabb2D,
) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .query_spatial_region)(out, region);
}

pub fn remove_spatial_object_2d(index: &mut SpatialIndex2D, id: SpatialObjectId) {
    (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .remove_spatial_object)(id);
}

pub fn update_spatial_object_2d(
    index: &mut SpatialIndex2D,
    id: SpatialObjectId,
    bounds: &SpatialAabb2D,
) -> bool {
    return (index
        .index_runtime
        .as_ref()
        .expect("initialized spatial index")
        .backend
        .update_spatial_object)(id, bounds);
}

impl SpatialIndex2D {
    pub fn new(backend: Option<SpatialIndexBackend2D>) -> Self {
        return create_spatial_index_2d(backend);
    }
    pub fn clear(&mut self) {
        clear_spatial_index_2d(self);
    }
    pub fn insert(&mut self, id: SpatialObjectId, bounds: &SpatialAabb2D) -> bool {
        return insert_spatial_object_2d(self, id, bounds);
    }
    pub fn remove(&mut self, id: SpatialObjectId) {
        remove_spatial_object_2d(self, id);
    }
    pub fn update(&mut self, id: SpatialObjectId, bounds: &SpatialAabb2D) -> bool {
        return update_spatial_object_2d(self, id, bounds);
    }
}

flight_entity::impl_entity!(SpatialIndex2D);
