//! QuadBatch display object — GPU-accelerated batch of axis-aligned or
//! affine-transformed quads sourced from a texture atlas.
//!
//! Stores parallel arrays (`ids`, `transforms`) for up to `instance_count`
//! instances. Two layout variants are supported:
//!
//! - `Vector2` — each instance uses 2 floats `[x, y]` (translation only).
//! - `Matrix3x2` — each instance uses 6 floats `[a, b, c, d, tx, ty]`
//!   (full affine 3×2 matrix).

use flighthq_node::NodeId;
use flighthq_types::{
    QuadBatchData, QuadTransformType, Rectangle, TextureAtlas, Vector2Like, quad_batch_kind,
};

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};

// ---------------------------------------------------------------------------
// QuadBatchRuntime — per-node render-side cache
// ---------------------------------------------------------------------------

/// Per-node runtime state for a QuadBatch.
///
/// Stored as a separate struct in `DisplayObjectNode.data` alongside `QuadBatchData`
/// via the `QuadBatchMeta` wrapper, so that the local bounds cache and optional
/// per-instance velocity buffer stay collocated with the data.
#[derive(Debug, Default)]
pub struct QuadBatchMeta {
    pub data: QuadBatchData,
    /// Cached local bounds rectangle, or `None` when computed dynamically.
    pub local_bounds_rectangle: Option<Rectangle>,
    /// Per-instance velocity `[vx, vy]`, one pair per instance. `None` when
    /// no per-instance velocity is tracked (falls back to coarse world-bounds vel).
    pub instance_velocities: Option<Vec<f32>>,
}

/// Runtime behavior for a quad batch.
///
/// Mirrors TS `QuadBatchRuntime`. The runtime's distinguishing behavior is its
/// bounds-compute method; in the Rust arena model the mutable per-node caches
/// (`local_bounds_rectangle`, `instance_velocities`) live on [`QuadBatchMeta`],
/// and the runtime is the bounds-compute function the batch installs.
pub type QuadBatchRuntime = fn(&mut Rectangle, &DisplayObjectArena, NodeId);

// ---------------------------------------------------------------------------
// compute_quad_batch_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Computes and writes the tight local bounds of all active instances into `out`.
///
/// Iterates over `instance_count` quads, expanding a bounding box for each.
/// Uses a faster path for `Vector2` transforms (no rotation/scale).
pub fn compute_quad_batch_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    let Some(meta) = get_quad_batch_meta(arena, source) else {
        return;
    };
    let data = &meta.data;
    let atlas = match &data.atlas {
        Some(a) => a,
        None => {
            *out = Rectangle::default();
            return;
        }
    };
    if data.instance_count == 0 {
        *out = Rectangle::default();
        return;
    }
    let regions = &atlas.regions;
    let num_regions = regions.len() as u32;
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;

    match data.transform_type {
        QuadTransformType::Vector2 => {
            for i in 0..data.instance_count as usize {
                let id = data.ids.get(i).copied().unwrap_or(u16::MAX) as u32;
                if id >= num_regions {
                    continue;
                }
                let region = &regions[id as usize];
                if region.width <= 0.0 || region.height <= 0.0 {
                    continue;
                }
                let dx = data.transforms.get(i * 2).copied().unwrap_or(0.0);
                let dy = data.transforms.get(i * 2 + 1).copied().unwrap_or(0.0);
                min_x = min_x.min(dx);
                min_y = min_y.min(dy);
                max_x = max_x.max(dx + region.width);
                max_y = max_y.max(dy + region.height);
            }
        }
        QuadTransformType::Matrix3x2 => {
            for i in 0..data.instance_count as usize {
                let id = data.ids.get(i).copied().unwrap_or(u16::MAX) as u32;
                if id >= num_regions {
                    continue;
                }
                let region = &regions[id as usize];
                if region.width <= 0.0 || region.height <= 0.0 {
                    continue;
                }
                let o = i * 6;
                let a = data.transforms.get(o).copied().unwrap_or(1.0);
                let b = data.transforms.get(o + 1).copied().unwrap_or(0.0);
                let c = data.transforms.get(o + 2).copied().unwrap_or(0.0);
                let d = data.transforms.get(o + 3).copied().unwrap_or(1.0);
                let tx = data.transforms.get(o + 4).copied().unwrap_or(0.0);
                let ty = data.transforms.get(o + 5).copied().unwrap_or(0.0);
                let w = region.width;
                let h = region.height;
                let x0 = tx;
                let y0 = ty;
                let x1 = a * w + tx;
                let y1 = b * w + ty;
                let x2 = c * h + tx;
                let y2 = d * h + ty;
                let x3 = a * w + c * h + tx;
                let y3 = b * w + d * h + ty;
                let qmin_x = x0.min(x1).min(x2).min(x3);
                let qmin_y = y0.min(y1).min(y2).min(y3);
                let qmax_x = x0.max(x1).max(x2).max(x3);
                let qmax_y = y0.max(y1).max(y2).max(y3);
                min_x = min_x.min(qmin_x);
                min_y = min_y.min(qmin_y);
                max_x = max_x.max(qmax_x);
                max_y = max_y.max(qmax_y);
            }
        }
    }

    if min_x == f32::INFINITY {
        *out = Rectangle::default();
    } else {
        out.x = min_x;
        out.y = min_y;
        out.width = max_x - min_x;
        out.height = max_y - min_y;
    }
}

// ---------------------------------------------------------------------------
// create_quad_batch
// ---------------------------------------------------------------------------

/// Inserts a new quad batch node into `arena` and returns its id.
pub fn create_quad_batch(arena: &mut DisplayObjectArena) -> NodeId {
    let meta: Box<dyn std::any::Any + Send + Sync> = Box::new(QuadBatchMeta::default());
    create_display_object_generic(arena, quad_batch_kind(), Some(meta))
}

// ---------------------------------------------------------------------------
// create_quad_batch_data
// ---------------------------------------------------------------------------

/// Builds a default `QuadBatchData` payload.
///
/// Mirrors TS `createQuadBatchData()`: no atlas, empty `ids`/`transforms`, zero
/// instances, and a `Vector2` transform type.
pub fn create_quad_batch_data() -> QuadBatchData {
    QuadBatchData {
        atlas: None,
        ids: Vec::new(),
        instance_count: 0,
        material_data: None,
        transforms: Vec::new(),
        transform_type: QuadTransformType::Vector2,
    }
}

// ---------------------------------------------------------------------------
// create_quad_batch_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a quad batch.
///
/// Mirrors TS `createQuadBatchRuntime()`, which installs the local-bounds copy
/// method and initializes the bounds/velocity caches to `null`. The Rust caches
/// live on [`QuadBatchMeta`] (initialized to `None`); this returns the
/// bounds-compute function the batch installs.
pub fn create_quad_batch_runtime() -> QuadBatchRuntime {
    compute_quad_batch_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// get_quad_batch_atlas
// ---------------------------------------------------------------------------

/// Returns the texture atlas assigned to this quad batch, if any.
pub fn get_quad_batch_atlas(arena: &DisplayObjectArena, source: NodeId) -> Option<&TextureAtlas> {
    get_quad_batch_meta(arena, source)?.data.atlas.as_ref()
}

// ---------------------------------------------------------------------------
// get_quad_batch_capacity
// ---------------------------------------------------------------------------

/// Returns the current capacity — the maximum instance count before a reallocation.
pub fn get_quad_batch_capacity(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    let Some(meta) = get_quad_batch_meta(arena, source) else {
        return 0;
    };
    let data = &meta.data;
    let stride = get_quad_transform_stride(data.transform_type);
    let transform_capacity = (data.transforms.len() / stride) as u32;
    transform_capacity.min(data.ids.len() as u32)
}

// ---------------------------------------------------------------------------
// get_quad_batch_instance_count
// ---------------------------------------------------------------------------

/// Returns the active instance count.
pub fn get_quad_batch_instance_count(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    get_quad_batch_meta(arena, source)
        .map(|m| m.data.instance_count)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// get_quad_batch_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the quad batch at `source`.
///
/// Mirrors TS `getQuadBatchRuntime(source)`. The returned function is the
/// batch's bounds-compute method (the same one its factory installs via
/// [`create_quad_batch_runtime`]).
pub fn get_quad_batch_runtime(_arena: &DisplayObjectArena, _source: NodeId) -> QuadBatchRuntime {
    compute_quad_batch_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// get_quad_transform_stride
// ---------------------------------------------------------------------------

/// Returns the number of floats per instance for the given transform type.
pub fn get_quad_transform_stride(transform_type: QuadTransformType) -> usize {
    match transform_type {
        QuadTransformType::Vector2 => 2,
        QuadTransformType::Matrix3x2 => 6,
    }
}

// ---------------------------------------------------------------------------
// hit_test_quad_batch_point
// ---------------------------------------------------------------------------

/// Returns the index of the first instance whose bounds contain `point`, or -1.
pub fn hit_test_quad_batch_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    point: &Vector2Like,
) -> i32 {
    hit_test_quad_batch_point_xy(arena, source, point.x, point.y)
}

// ---------------------------------------------------------------------------
// hit_test_quad_batch_point_xy
// ---------------------------------------------------------------------------

/// Returns the index of the first instance whose bounds contain `(x, y)`, or -1.
pub fn hit_test_quad_batch_point_xy(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
) -> i32 {
    let Some(meta) = get_quad_batch_meta(arena, source) else {
        return -1;
    };
    let data = &meta.data;
    let atlas = match &data.atlas {
        Some(a) => a,
        None => return -1,
    };
    if data.instance_count == 0 {
        return -1;
    }
    let regions = &atlas.regions;
    let num_regions = regions.len() as u32;

    match data.transform_type {
        QuadTransformType::Vector2 => {
            for i in 0..data.instance_count as usize {
                let id = data.ids.get(i).copied().unwrap_or(u16::MAX) as u32;
                if id >= num_regions {
                    continue;
                }
                let region = &regions[id as usize];
                let dx = data.transforms.get(i * 2).copied().unwrap_or(0.0);
                let dy = data.transforms.get(i * 2 + 1).copied().unwrap_or(0.0);
                if x >= dx && x < dx + region.width && y >= dy && y < dy + region.height {
                    return i as i32;
                }
            }
        }
        QuadTransformType::Matrix3x2 => {
            for i in 0..data.instance_count as usize {
                let id = data.ids.get(i).copied().unwrap_or(u16::MAX) as u32;
                if id >= num_regions {
                    continue;
                }
                let region = &regions[id as usize];
                if region.width <= 0.0 || region.height <= 0.0 {
                    continue;
                }
                let o = i * 6;
                let a = data.transforms.get(o).copied().unwrap_or(1.0);
                let b = data.transforms.get(o + 1).copied().unwrap_or(0.0);
                let c = data.transforms.get(o + 2).copied().unwrap_or(0.0);
                let d = data.transforms.get(o + 3).copied().unwrap_or(1.0);
                let tx = data.transforms.get(o + 4).copied().unwrap_or(0.0);
                let ty = data.transforms.get(o + 5).copied().unwrap_or(0.0);
                let w = region.width;
                let h = region.height;
                let x0 = tx;
                let y0 = ty;
                let x1 = a * w + tx;
                let y1 = b * w + ty;
                let x2 = c * h + tx;
                let y2 = d * h + ty;
                let x3 = a * w + c * h + tx;
                let y3 = b * w + d * h + ty;
                let min_x = x0.min(x1).min(x2).min(x3);
                let min_y = y0.min(y1).min(y2).min(y3);
                let max_x = x0.max(x1).max(x2).max(x3);
                let max_y = y0.max(y1).max(y2).max(y3);
                if x >= min_x && x < max_x && y >= min_y && y < max_y {
                    return i as i32;
                }
            }
        }
    }
    -1
}

// ---------------------------------------------------------------------------
// reserve_quad_batch
// ---------------------------------------------------------------------------

/// Grows the quad batch's internal arrays to hold at least `capacity` instances.
///
/// No-op if the current capacity already meets or exceeds `capacity`.
pub fn reserve_quad_batch(arena: &mut DisplayObjectArena, target: NodeId, capacity: u32) {
    let current = get_quad_batch_capacity(arena, target);
    if current >= capacity {
        return;
    }
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    let stride = get_quad_transform_stride(meta.data.transform_type);
    let cap = capacity as usize;
    meta.data.ids.resize(cap, 0);
    meta.data.transforms.resize(cap * stride, 0.0);
}

// ---------------------------------------------------------------------------
// resize_quad_batch
// ---------------------------------------------------------------------------

/// Sets the active instance count, growing internal arrays as needed.
pub fn resize_quad_batch(arena: &mut DisplayObjectArena, target: NodeId, instance_count: u32) {
    reserve_quad_batch(arena, target, instance_count);
    if let Some(meta) = get_quad_batch_meta_mut(arena, target) {
        meta.data.instance_count = instance_count;
    }
}

// ---------------------------------------------------------------------------
// set_quad_batch_atlas
// ---------------------------------------------------------------------------

/// Sets the texture atlas on this quad batch.
pub fn set_quad_batch_atlas(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    atlas: Option<TextureAtlas>,
) {
    if let Some(meta) = get_quad_batch_meta_mut(arena, target) {
        meta.data.atlas = atlas;
    }
}

// ---------------------------------------------------------------------------
// set_quad_batch_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Overrides the local bounds with a manually computed rectangle.
///
/// The override replaces the dynamic bounds computation until cleared.
pub fn set_quad_batch_local_bounds_rectangle(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    rect: Rectangle,
) {
    if let Some(meta) = get_quad_batch_meta_mut(arena, target) {
        meta.local_bounds_rectangle = Some(rect);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_quad_batch_meta(arena: &DisplayObjectArena, source: NodeId) -> Option<&QuadBatchMeta> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<QuadBatchMeta>())
}

fn get_quad_batch_meta_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut QuadBatchMeta> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<QuadBatchMeta>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{TextureAtlasRegion, quad_batch_kind};

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    fn atlas_with_region(w: f32, h: f32) -> TextureAtlas {
        TextureAtlas {
            image: None,
            regions: vec![TextureAtlasRegion {
                id: 0,
                width: w,
                height: h,
                ..Default::default()
            }],
        }
    }

    // compute_quad_batch_local_bounds_rectangle

    #[test]
    fn compute_quad_batch_local_bounds_rectangle_vector2_single_instance() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        set_quad_batch_atlas(&mut arena, id, Some(atlas_with_region(32.0, 16.0)));
        resize_quad_batch(&mut arena, id, 1);
        // Set transform: translate to (10, 20)
        if let Some(meta) = arena[id]
            .data
            .as_mut()
            .and_then(|d| d.downcast_mut::<QuadBatchMeta>())
        {
            meta.data.transforms[0] = 10.0;
            meta.data.transforms[1] = 20.0;
        }
        let mut out = Rectangle::default();
        compute_quad_batch_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.width, 32.0);
        assert_eq!(out.height, 16.0);
    }

    #[test]
    fn compute_quad_batch_local_bounds_rectangle_empty_is_zero() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        let mut out = Rectangle {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        compute_quad_batch_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 0.0);
    }

    // create_quad_batch

    #[test]
    fn create_quad_batch_uses_quad_batch_kind() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        assert_eq!(arena[id].kind, quad_batch_kind());
    }

    // create_quad_batch_data

    #[test]
    fn create_quad_batch_data_returns_default_values() {
        let data = create_quad_batch_data();
        assert!(data.atlas.is_none());
        assert!(data.ids.is_empty());
        assert_eq!(data.instance_count, 0);
        assert!(data.transforms.is_empty());
        assert_eq!(data.transform_type, QuadTransformType::Vector2);
    }

    // create_quad_batch_runtime

    #[test]
    fn create_quad_batch_runtime_uses_compute_local_bounds() {
        let runtime = create_quad_batch_runtime();
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        set_quad_batch_atlas(&mut arena, id, Some(atlas_with_region(32.0, 16.0)));
        resize_quad_batch(&mut arena, id, 1);
        let mut out = Rectangle::default();
        runtime(&mut out, &arena, id);
        assert_eq!(out.width, 32.0);
        assert_eq!(out.height, 16.0);
    }

    // get_quad_batch_capacity / reserve_quad_batch

    #[test]
    fn get_quad_batch_capacity_reflects_reserve_quad_batch() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        assert_eq!(get_quad_batch_capacity(&arena, id), 0);
        reserve_quad_batch(&mut arena, id, 16);
        assert!(get_quad_batch_capacity(&arena, id) >= 16);
    }

    // get_quad_batch_runtime

    #[test]
    fn get_quad_batch_runtime_returns_compute_for_quad_batch() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        let runtime = get_quad_batch_runtime(&arena, id);
        set_quad_batch_atlas(&mut arena, id, Some(atlas_with_region(8.0, 4.0)));
        resize_quad_batch(&mut arena, id, 1);
        let mut out = Rectangle::default();
        runtime(&mut out, &arena, id);
        assert_eq!(out.width, 8.0);
        assert_eq!(out.height, 4.0);
    }

    // get_quad_transform_stride

    #[test]
    fn get_quad_transform_stride_vector2_is_2() {
        assert_eq!(get_quad_transform_stride(QuadTransformType::Vector2), 2);
    }

    #[test]
    fn get_quad_transform_stride_matrix3x2_is_6() {
        assert_eq!(get_quad_transform_stride(QuadTransformType::Matrix3x2), 6);
    }

    // hit_test_quad_batch_point / hit_test_quad_batch_point_xy

    #[test]
    fn hit_test_quad_batch_point_xy_vector2_finds_instance() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        set_quad_batch_atlas(&mut arena, id, Some(atlas_with_region(32.0, 16.0)));
        resize_quad_batch(&mut arena, id, 1);
        // instance at (10, 20)
        if let Some(meta) = arena[id]
            .data
            .as_mut()
            .and_then(|d| d.downcast_mut::<QuadBatchMeta>())
        {
            meta.data.transforms[0] = 10.0;
            meta.data.transforms[1] = 20.0;
        }
        assert_eq!(hit_test_quad_batch_point_xy(&arena, id, 10.0, 20.0), 0);
        // x == dx + region.width is the exclusive right edge, so it misses.
        assert_eq!(hit_test_quad_batch_point_xy(&arena, id, 42.0, 20.0), -1);
    }

    #[test]
    fn hit_test_quad_batch_point_xy_no_atlas_returns_neg_one() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        resize_quad_batch(&mut arena, id, 1);
        assert_eq!(hit_test_quad_batch_point_xy(&arena, id, 0.0, 0.0), -1);
    }

    #[test]
    fn hit_test_quad_batch_point_delegates_to_xy() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        set_quad_batch_atlas(&mut arena, id, Some(atlas_with_region(32.0, 16.0)));
        resize_quad_batch(&mut arena, id, 1);
        if let Some(meta) = arena[id]
            .data
            .as_mut()
            .and_then(|d| d.downcast_mut::<QuadBatchMeta>())
        {
            meta.data.transforms[0] = 10.0;
            meta.data.transforms[1] = 20.0;
        }
        let inside = Vector2Like { x: 11.0, y: 21.0 };
        assert_eq!(hit_test_quad_batch_point(&arena, id, &inside), 0);
        let outside = Vector2Like { x: 100.0, y: 100.0 };
        assert_eq!(hit_test_quad_batch_point(&arena, id, &outside), -1);
    }

    // resize_quad_batch / get_quad_batch_instance_count

    #[test]
    fn resize_quad_batch_sets_instance_count() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        assert_eq!(get_quad_batch_instance_count(&arena, id), 0);
        resize_quad_batch(&mut arena, id, 8);
        assert_eq!(get_quad_batch_instance_count(&arena, id), 8);
    }

    // set_quad_batch_local_bounds_rectangle

    #[test]
    fn set_quad_batch_local_bounds_rectangle_stores_override() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        let r = Rectangle {
            x: 1.0,
            y: 2.0,
            width: 100.0,
            height: 50.0,
        };
        set_quad_batch_local_bounds_rectangle(&mut arena, id, r);
        let meta = arena[id]
            .data
            .as_ref()
            .and_then(|d| d.downcast_ref::<QuadBatchMeta>())
            .unwrap();
        let stored = meta.local_bounds_rectangle.as_ref().unwrap();
        assert_eq!(stored.width, 100.0);
    }
}
