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
use flighthq_signals::emit_signal;
use flighthq_types::{
    QuadBatchData, QuadBatchInstanceRemoved, QuadBatchSignals, QuadTransformType, Rectangle,
    TextureAtlas, Vector2Like, quad_batch_kind,
};

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};

/// Number of floats per instance for the `Vector2` transform layout.
const QUAD_VECTOR2_STRIDE: usize = 2;
/// Number of floats per instance for the `Matrix3x2` transform layout.
const QUAD_MATRIX3X2_STRIDE: usize = 6;

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
    /// Lazily-armed signal set (the Rust home for the TS `quadBatchSignalsSlot`),
    /// `None` until [`enable_quad_batch_signals`] arms it.
    pub signals: Option<Box<QuadBatchSignals>>,
}

/// Runtime behavior for a quad batch.
///
/// Mirrors TS `QuadBatchRuntime`. The runtime's distinguishing behavior is its
/// bounds-compute method; in the Rust arena model the mutable per-node caches
/// (`local_bounds_rectangle`, `instance_velocities`) live on [`QuadBatchMeta`],
/// and the runtime is the bounds-compute function the batch installs.
pub type QuadBatchRuntime = fn(&mut Rectangle, &DisplayObjectArena, NodeId);

// ---------------------------------------------------------------------------
// append_quad_batch_instance
// ---------------------------------------------------------------------------

/// Appends a new instance using the `Vector2` (translation-only) transform,
/// auto-growing capacity. Returns the new instance index, or `-1` when `target`
/// is not a quad batch. Fires `on_instance_appended` when signals are enabled.
pub fn append_quad_batch_instance(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    id: u16,
    x: f32,
    y: f32,
) -> i64 {
    let index = get_quad_batch_instance_count(arena, target);
    resize_quad_batch(arena, target, index + 1);
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return -1;
    };
    let i = index as usize;
    meta.data.ids[i] = id;
    let o = i * QUAD_VECTOR2_STRIDE;
    meta.data.transforms[o] = x;
    meta.data.transforms[o + 1] = y;
    if let Some(signals) = meta.signals.as_deref() {
        emit_signal(&signals.on_instance_appended, &index);
    }
    index as i64
}

// ---------------------------------------------------------------------------
// clear_quad_batch
// ---------------------------------------------------------------------------

/// Sets the active instance count to 0, keeping allocated capacity. Fires
/// `on_cleared` when signals are enabled.
pub fn clear_quad_batch(arena: &mut DisplayObjectArena, target: NodeId) {
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    meta.data.instance_count = 0;
    if let Some(signals) = meta.signals.as_deref() {
        emit_signal(&signals.on_cleared, &());
    }
}

// ---------------------------------------------------------------------------
// clone_quad_batch
// ---------------------------------------------------------------------------

/// Deep-copies the batch at `source` into a new quad batch node in `arena` and
/// returns its id.
///
/// Mirrors TS `cloneQuadBatch`: `atlas`, `instance_count`, `transform_type`, and
/// `material_data` are copied, with cloned `ids`/`transforms` buffers. Signals are
/// not cloned.
pub fn clone_quad_batch(arena: &mut DisplayObjectArena, source: NodeId) -> NodeId {
    let cloned = get_quad_batch_meta(arena, source).map(|meta| QuadBatchData {
        atlas: meta.data.atlas.clone(),
        ids: meta.data.ids.clone(),
        instance_count: meta.data.instance_count,
        material_data: None,
        transforms: meta.data.transforms.clone(),
        transform_type: meta.data.transform_type,
    });
    let clone = create_quad_batch(arena);
    if let (Some(data), Some(meta)) = (cloned, get_quad_batch_meta_mut(arena, clone)) {
        meta.data = data;
    }
    clone
}

// ---------------------------------------------------------------------------
// compact_quad_batch
// ---------------------------------------------------------------------------

/// Compacts the instance buffer, removing entries whose id is the deleted
/// sentinel (`0xffff`) while preserving relative order. After compaction,
/// `instance_count` equals the number of non-sentinel entries.
pub fn compact_quad_batch(arena: &mut DisplayObjectArena, target: NodeId) {
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    let data = &mut meta.data;
    if data.instance_count == 0 {
        return;
    }
    let stride = get_quad_transform_stride(data.transform_type);
    let mut write = 0usize;
    for read in 0..data.instance_count as usize {
        if data.ids[read] == 0xffff {
            continue;
        }
        if write != read {
            data.ids[write] = data.ids[read];
            let dst = write * stride;
            let src = read * stride;
            for k in 0..stride {
                data.transforms[dst + k] = data.transforms[src + k];
            }
        }
        write += 1;
    }
    data.instance_count = write as u32;
}

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
// create_quad_batch_signals
// ---------------------------------------------------------------------------

/// Creates a fresh `QuadBatchSignals` value.
pub fn create_quad_batch_signals() -> QuadBatchSignals {
    QuadBatchSignals::default()
}

// ---------------------------------------------------------------------------
// enable_quad_batch_signals
// ---------------------------------------------------------------------------

/// Lazily creates `QuadBatchSignals` on `target` and returns a mutable reference.
///
/// Subsequent calls return the already-created set.
pub fn enable_quad_batch_signals(
    arena: &mut DisplayObjectArena,
    target: NodeId,
) -> &mut QuadBatchSignals {
    let meta = get_quad_batch_meta_mut(arena, target).expect("not a quad batch node");
    meta.signals
        .get_or_insert_with(|| Box::new(QuadBatchSignals::default()))
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
// get_quad_batch_instance_id
// ---------------------------------------------------------------------------

/// Returns the region id stored at `index`, or `-1` when `index` is out of range.
pub fn get_quad_batch_instance_id(arena: &DisplayObjectArena, source: NodeId, index: u32) -> i32 {
    let Some(meta) = get_quad_batch_meta(arena, source) else {
        return -1;
    };
    if index >= meta.data.instance_count {
        return -1;
    }
    meta.data.ids[index as usize] as i32
}

// ---------------------------------------------------------------------------
// get_quad_batch_instance_transform
// ---------------------------------------------------------------------------

/// Writes the translation of instance `index` into `out`.
///
/// For `Vector2` batches, writes `(tx, ty)` from the instance's 2-float slot; for
/// `Matrix3x2` batches, writes the matrix's `(tx, ty)` translation. Returns false
/// and writes nothing when `index` is out of range.
pub fn get_quad_batch_instance_transform(
    out: &mut Vector2Like,
    arena: &DisplayObjectArena,
    source: NodeId,
    index: u32,
) -> bool {
    let Some(meta) = get_quad_batch_meta(arena, source) else {
        return false;
    };
    let data = &meta.data;
    if index >= data.instance_count {
        return false;
    }
    let i = index as usize;
    match data.transform_type {
        QuadTransformType::Vector2 => {
            let o = i * QUAD_VECTOR2_STRIDE;
            out.x = data.transforms[o];
            out.y = data.transforms[o + 1];
        }
        QuadTransformType::Matrix3x2 => {
            let o = i * QUAD_MATRIX3X2_STRIDE;
            out.x = data.transforms[o + 4];
            out.y = data.transforms[o + 5];
        }
    }
    true
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
// get_quad_batch_signals
// ---------------------------------------------------------------------------

/// Returns the `QuadBatchSignals` attached to `source`, or `None` if not yet enabled.
pub fn get_quad_batch_signals(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> Option<&QuadBatchSignals> {
    get_quad_batch_meta(arena, source)?.signals.as_deref()
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
// hit_test_quad_batch_point_exact
// ---------------------------------------------------------------------------

/// Returns the topmost instance whose quad polygon contains `point`, or -1.
///
/// For `Matrix3x2` batches this is an exact point-in-quad test (vs. the AABB
/// over-report of [`hit_test_quad_batch_point`]); for `Vector2` batches it is
/// equivalent to the AABB test.
pub fn hit_test_quad_batch_point_exact(
    arena: &DisplayObjectArena,
    source: NodeId,
    point: &Vector2Like,
) -> i32 {
    hit_test_quad_batch_point_exact_xy(arena, source, point.x, point.y)
}

// ---------------------------------------------------------------------------
// hit_test_quad_batch_point_exact_xy
// ---------------------------------------------------------------------------

/// XY variant of [`hit_test_quad_batch_point_exact`].
pub fn hit_test_quad_batch_point_exact_xy(
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
                let o = i * QUAD_MATRIX3X2_STRIDE;
                let a = data.transforms.get(o).copied().unwrap_or(1.0);
                let b = data.transforms.get(o + 1).copied().unwrap_or(0.0);
                let c = data.transforms.get(o + 2).copied().unwrap_or(0.0);
                let d = data.transforms.get(o + 3).copied().unwrap_or(1.0);
                let tx = data.transforms.get(o + 4).copied().unwrap_or(0.0);
                let ty = data.transforms.get(o + 5).copied().unwrap_or(0.0);
                let w = region.width;
                let h = region.height;
                // Corners (0,0)→(w,0)→(w,h)→(0,h) mapped by the affine.
                let x0 = tx;
                let y0 = ty;
                let x1 = a * w + tx;
                let y1 = b * w + ty;
                let x2 = a * w + c * h + tx;
                let y2 = b * w + d * h + ty;
                let x3 = c * h + tx;
                let y3 = d * h + ty;
                if cross_sign(x0, y0, x1, y1, x, y)
                    && cross_sign(x1, y1, x2, y2, x, y)
                    && cross_sign(x2, y2, x3, y3, x, y)
                    && cross_sign(x3, y3, x0, y0, x, y)
                {
                    return i as i32;
                }
            }
        }
    }
    -1
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
// iterate_quad_batch_instances
// ---------------------------------------------------------------------------

/// Calls `visitor(index, id, transforms)` for each live instance in order. The
/// `transforms` slice is the instance's stride-length window into the transform
/// buffer. Allocation-free.
pub fn iterate_quad_batch_instances<F: FnMut(u32, u16, &[f32])>(
    arena: &DisplayObjectArena,
    source: NodeId,
    mut visitor: F,
) {
    let Some(meta) = get_quad_batch_meta(arena, source) else {
        return;
    };
    let data = &meta.data;
    let stride = get_quad_transform_stride(data.transform_type);
    for i in 0..data.instance_count as usize {
        let id = data.ids.get(i).copied().unwrap_or(0);
        let start = i * stride;
        visitor(i as u32, id, &data.transforms[start..start + stride]);
    }
}

// ---------------------------------------------------------------------------
// remove_quad_batch_instance
// ---------------------------------------------------------------------------

/// Swap-removes instance `index` with the last instance (O(1)), decrementing
/// `instance_count`. Does not preserve order. No-ops when `index` is out of range.
/// Fires `on_instance_removed` (carrying the removed index and the swap-source
/// index, `-1` when the removed instance was already last) when signals are enabled.
pub fn remove_quad_batch_instance(arena: &mut DisplayObjectArena, target: NodeId, index: u32) {
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    let data = &mut meta.data;
    if data.instance_count == 0 {
        return;
    }
    let last = data.instance_count - 1;
    if index > last {
        return;
    }
    let swap_source = if index < last { last as i32 } else { -1 };
    if index < last {
        let i = index as usize;
        let l = last as usize;
        data.ids[i] = data.ids[l];
        match data.transform_type {
            QuadTransformType::Vector2 => {
                let dst = i * QUAD_VECTOR2_STRIDE;
                let src = l * QUAD_VECTOR2_STRIDE;
                data.transforms[dst] = data.transforms[src];
                data.transforms[dst + 1] = data.transforms[src + 1];
            }
            QuadTransformType::Matrix3x2 => {
                let dst = i * QUAD_MATRIX3X2_STRIDE;
                let src = l * QUAD_MATRIX3X2_STRIDE;
                for k in 0..QUAD_MATRIX3X2_STRIDE {
                    data.transforms[dst + k] = data.transforms[src + k];
                }
            }
        }
    }
    data.instance_count = last;
    if let Some(signals) = meta.signals.as_deref() {
        emit_signal(
            &signals.on_instance_removed,
            &QuadBatchInstanceRemoved { index, swap_source },
        );
    }
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
// set_quad_batch_instance
// ---------------------------------------------------------------------------

/// Writes the `Vector2` (translation-only) transform and id for instance `index`.
/// No-ops when `index` is out of range. Target must use `Vector2` transforms.
pub fn set_quad_batch_instance(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    index: u32,
    id: u16,
    x: f32,
    y: f32,
) {
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    if index >= meta.data.instance_count {
        return;
    }
    let i = index as usize;
    meta.data.ids[i] = id;
    let o = i * QUAD_VECTOR2_STRIDE;
    meta.data.transforms[o] = x;
    meta.data.transforms[o + 1] = y;
}

// ---------------------------------------------------------------------------
// set_quad_batch_instance_matrix
// ---------------------------------------------------------------------------

/// Writes a full 2D affine (`Matrix3x2`) transform and id for instance `index`.
/// No-ops when `index` is out of range. Layout: `[a, b, c, d, tx, ty]`.
#[allow(clippy::too_many_arguments)]
pub fn set_quad_batch_instance_matrix(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    index: u32,
    id: u16,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
) {
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    if index >= meta.data.instance_count {
        return;
    }
    let i = index as usize;
    meta.data.ids[i] = id;
    let o = i * QUAD_MATRIX3X2_STRIDE;
    meta.data.transforms[o] = a;
    meta.data.transforms[o + 1] = b;
    meta.data.transforms[o + 2] = c;
    meta.data.transforms[o + 3] = d;
    meta.data.transforms[o + 4] = tx;
    meta.data.transforms[o + 5] = ty;
}

// ---------------------------------------------------------------------------
// set_quad_batch_instance_range
// ---------------------------------------------------------------------------

/// Writes `count` contiguous transform entries from `source` into the batch
/// starting at `start_index`. Reads `count * stride` floats from `source`.
/// No-ops when `start_index + count` exceeds `instance_count`.
pub fn set_quad_batch_instance_range(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    start_index: u32,
    count: u32,
    source: &[f32],
) {
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    let data = &mut meta.data;
    if count == 0 || start_index + count > data.instance_count {
        return;
    }
    let stride = get_quad_transform_stride(data.transform_type);
    let dst = start_index as usize * stride;
    let len = count as usize * stride;
    data.transforms[dst..dst + len].copy_from_slice(&source[..len]);
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
// set_quad_batch_transform_type
// ---------------------------------------------------------------------------

/// Switches the batch's `transform_type`, re-striding the `transforms` buffer in
/// place.
///
/// - `Vector2 → Matrix3x2`: each `(x, y)` becomes `[1, 0, 0, 1, x, y]`.
/// - `Matrix3x2 → Vector2`: each matrix collapses to its `(tx, ty)` translation.
///
/// No-op when `new_type` matches the current transform type.
pub fn set_quad_batch_transform_type(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    new_type: QuadTransformType,
) {
    let Some(meta) = get_quad_batch_meta_mut(arena, target) else {
        return;
    };
    let data = &mut meta.data;
    if data.transform_type == new_type {
        return;
    }
    let count = data.instance_count as usize;
    match new_type {
        QuadTransformType::Matrix3x2 => {
            let cap =
                (data.transforms.len() / QUAD_VECTOR2_STRIDE).max(count) * QUAD_MATRIX3X2_STRIDE;
            let mut new_transforms = vec![0.0f32; cap];
            for i in (0..count).rev() {
                let src = i * QUAD_VECTOR2_STRIDE;
                let dst = i * QUAD_MATRIX3X2_STRIDE;
                let x = data.transforms[src];
                let y = data.transforms[src + 1];
                new_transforms[dst] = 1.0; // a
                new_transforms[dst + 1] = 0.0; // b
                new_transforms[dst + 2] = 0.0; // c
                new_transforms[dst + 3] = 1.0; // d
                new_transforms[dst + 4] = x; // tx
                new_transforms[dst + 5] = y; // ty
            }
            data.transforms = new_transforms;
        }
        QuadTransformType::Vector2 => {
            // Collapsing in place: dst < src for all i.
            for i in 0..count {
                let src = i * QUAD_MATRIX3X2_STRIDE;
                let dst = i * QUAD_VECTOR2_STRIDE;
                data.transforms[dst] = data.transforms[src + 4]; // tx
                data.transforms[dst + 1] = data.transforms[src + 5]; // ty
            }
        }
    }
    data.transform_type = new_type;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// True when the cross product of edge (a→b) and (P − A) is >= 0.
fn cross_sign(ax: f32, ay: f32, bx: f32, by: f32, px: f32, py: f32) -> bool {
    (bx - ax) * (py - ay) - (by - ay) * (px - ax) >= 0.0
}

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

    // append_quad_batch_instance

    #[test]
    fn append_quad_batch_instance_appends_and_returns_index() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        assert_eq!(append_quad_batch_instance(&mut arena, id, 3, 10.0, 20.0), 0);
        assert_eq!(append_quad_batch_instance(&mut arena, id, 4, 5.0, 6.0), 1);
        assert_eq!(get_quad_batch_instance_count(&arena, id), 2);
        assert_eq!(get_quad_batch_instance_id(&arena, id, 0), 3);
        let mut out = Vector2Like::default();
        assert!(get_quad_batch_instance_transform(&mut out, &arena, id, 0));
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
    }

    #[test]
    fn append_quad_batch_instance_fires_on_instance_appended() {
        use flighthq_signals::connect_signal;
        use std::sync::{Arc, Mutex};
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        let captured = Arc::new(Mutex::new(u32::MAX));
        let sig = enable_quad_batch_signals(&mut arena, id)
            .on_instance_appended
            .clone();
        let c = Arc::clone(&captured);
        let _guard = connect_signal(
            &sig,
            Arc::new(move |i: &u32| {
                *c.lock().unwrap() = *i;
            }),
            Default::default(),
        );
        append_quad_batch_instance(&mut arena, id, 0, 0.0, 0.0);
        assert_eq!(*captured.lock().unwrap(), 0);
    }

    // clear_quad_batch

    #[test]
    fn clear_quad_batch_resets_count() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        append_quad_batch_instance(&mut arena, id, 0, 0.0, 0.0);
        clear_quad_batch(&mut arena, id);
        assert_eq!(get_quad_batch_instance_count(&arena, id), 0);
    }

    // clone_quad_batch

    #[test]
    fn clone_quad_batch_deep_copies() {
        let mut arena = new_arena();
        let source = create_quad_batch(&mut arena);
        set_quad_batch_atlas(&mut arena, source, Some(atlas_with_region(8.0, 8.0)));
        append_quad_batch_instance(&mut arena, source, 0, 1.0, 2.0);
        let clone = clone_quad_batch(&mut arena, source);
        assert_ne!(clone, source);
        assert_eq!(get_quad_batch_instance_count(&arena, clone), 1);
        assert!(get_quad_batch_atlas(&arena, clone).is_some());
        // Independent buffers.
        set_quad_batch_instance(&mut arena, clone, 0, 9, 99.0, 99.0);
        assert_eq!(get_quad_batch_instance_id(&arena, source, 0), 0);
        assert_eq!(get_quad_batch_instance_id(&arena, clone, 0), 9);
    }

    // compact_quad_batch

    #[test]
    fn compact_quad_batch_removes_sentinel_entries() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        append_quad_batch_instance(&mut arena, id, 0, 0.0, 0.0);
        append_quad_batch_instance(&mut arena, id, 1, 1.0, 1.0);
        append_quad_batch_instance(&mut arena, id, 2, 2.0, 2.0);
        set_quad_batch_instance(&mut arena, id, 1, 0xffff, 1.0, 1.0);
        compact_quad_batch(&mut arena, id);
        assert_eq!(get_quad_batch_instance_count(&arena, id), 2);
        assert_eq!(get_quad_batch_instance_id(&arena, id, 0), 0);
        assert_eq!(get_quad_batch_instance_id(&arena, id, 1), 2);
    }

    // create_quad_batch_signals / enable_quad_batch_signals / get_quad_batch_signals

    #[test]
    fn create_quad_batch_signals_returns_default_signal_set() {
        let signals = create_quad_batch_signals();
        assert!(!signals.on_cleared.has_listeners());
        assert!(!signals.on_instance_appended.has_listeners());
        assert!(!signals.on_instance_removed.has_listeners());
    }

    #[test]
    fn enable_quad_batch_signals_attaches_on_first_call() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        assert!(get_quad_batch_signals(&arena, id).is_none());
        enable_quad_batch_signals(&mut arena, id);
        assert!(get_quad_batch_signals(&arena, id).is_some());
    }

    // get_quad_batch_instance_id / get_quad_batch_instance_transform

    #[test]
    fn get_quad_batch_instance_id_out_of_range_returns_neg_one() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        assert_eq!(get_quad_batch_instance_id(&arena, id, 0), -1);
    }

    #[test]
    fn get_quad_batch_instance_transform_out_of_range_returns_false() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        let mut out = Vector2Like { x: 5.0, y: 5.0 };
        assert!(!get_quad_batch_instance_transform(&mut out, &arena, id, 0));
        assert_eq!(out.x, 5.0); // unchanged
    }

    #[test]
    fn get_quad_batch_instance_transform_matrix_returns_translation() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        set_quad_batch_transform_type(&mut arena, id, QuadTransformType::Matrix3x2);
        resize_quad_batch(&mut arena, id, 1);
        set_quad_batch_instance_matrix(&mut arena, id, 0, 0, 1.0, 0.0, 0.0, 1.0, 7.0, 8.0);
        let mut out = Vector2Like::default();
        assert!(get_quad_batch_instance_transform(&mut out, &arena, id, 0));
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 8.0);
    }

    // hit_test_quad_batch_point_exact / hit_test_quad_batch_point_exact_xy

    #[test]
    fn hit_test_quad_batch_point_exact_vector2_matches_aabb() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        set_quad_batch_atlas(&mut arena, id, Some(atlas_with_region(32.0, 16.0)));
        append_quad_batch_instance(&mut arena, id, 0, 10.0, 20.0);
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&arena, id, 11.0, 21.0),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&arena, id, 100.0, 100.0),
            -1
        );
        let p = Vector2Like { x: 11.0, y: 21.0 };
        assert_eq!(hit_test_quad_batch_point_exact(&arena, id, &p), 0);
    }

    // iterate_quad_batch_instances

    #[test]
    fn iterate_quad_batch_instances_visits_each() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        append_quad_batch_instance(&mut arena, id, 1, 0.0, 0.0);
        append_quad_batch_instance(&mut arena, id, 2, 0.0, 0.0);
        let mut seen: Vec<(u32, u16)> = Vec::new();
        iterate_quad_batch_instances(&arena, id, |index, region_id, transforms| {
            assert_eq!(transforms.len(), 2);
            seen.push((index, region_id));
        });
        assert_eq!(seen, vec![(0, 1), (1, 2)]);
    }

    // remove_quad_batch_instance

    #[test]
    fn remove_quad_batch_instance_swap_removes() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        append_quad_batch_instance(&mut arena, id, 10, 0.0, 0.0);
        append_quad_batch_instance(&mut arena, id, 20, 1.0, 1.0);
        append_quad_batch_instance(&mut arena, id, 30, 2.0, 2.0);
        remove_quad_batch_instance(&mut arena, id, 0);
        assert_eq!(get_quad_batch_instance_count(&arena, id), 2);
        assert_eq!(get_quad_batch_instance_id(&arena, id, 0), 30);
    }

    #[test]
    fn remove_quad_batch_instance_fires_on_instance_removed() {
        use flighthq_signals::connect_signal;
        use std::sync::{Arc, Mutex};
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        append_quad_batch_instance(&mut arena, id, 0, 0.0, 0.0);
        append_quad_batch_instance(&mut arena, id, 1, 0.0, 0.0);
        let captured = Arc::new(Mutex::new(QuadBatchInstanceRemoved::default()));
        let sig = enable_quad_batch_signals(&mut arena, id)
            .on_instance_removed
            .clone();
        let c = Arc::clone(&captured);
        let _guard = connect_signal(
            &sig,
            Arc::new(move |p: &QuadBatchInstanceRemoved| {
                *c.lock().unwrap() = *p;
            }),
            Default::default(),
        );
        remove_quad_batch_instance(&mut arena, id, 0);
        let p = *captured.lock().unwrap();
        assert_eq!(p.index, 0);
        assert_eq!(p.swap_source, 1);
    }

    // set_quad_batch_instance / set_quad_batch_instance_matrix

    #[test]
    fn set_quad_batch_instance_writes_vector2() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        resize_quad_batch(&mut arena, id, 1);
        set_quad_batch_instance(&mut arena, id, 0, 5, 3.0, 4.0);
        assert_eq!(get_quad_batch_instance_id(&arena, id, 0), 5);
        let mut out = Vector2Like::default();
        get_quad_batch_instance_transform(&mut out, &arena, id, 0);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }

    // set_quad_batch_instance_range

    #[test]
    fn set_quad_batch_instance_range_writes_bulk() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        resize_quad_batch(&mut arena, id, 2);
        let src = [1.0f32, 2.0, 3.0, 4.0];
        set_quad_batch_instance_range(&mut arena, id, 0, 2, &src);
        let mut out = Vector2Like::default();
        get_quad_batch_instance_transform(&mut out, &arena, id, 1);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }

    // set_quad_batch_transform_type

    #[test]
    fn set_quad_batch_transform_type_vector2_to_matrix3x2() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        resize_quad_batch(&mut arena, id, 1);
        set_quad_batch_instance(&mut arena, id, 0, 0, 5.0, 6.0);
        set_quad_batch_transform_type(&mut arena, id, QuadTransformType::Matrix3x2);
        let meta = arena[id]
            .data
            .as_ref()
            .and_then(|d| d.downcast_ref::<QuadBatchMeta>())
            .unwrap();
        // [a, b, c, d, tx, ty] = [1, 0, 0, 1, 5, 6]
        assert_eq!(meta.data.transforms[0], 1.0);
        assert_eq!(meta.data.transforms[3], 1.0);
        assert_eq!(meta.data.transforms[4], 5.0);
        assert_eq!(meta.data.transforms[5], 6.0);
    }

    #[test]
    fn set_quad_batch_transform_type_matrix3x2_to_vector2() {
        let mut arena = new_arena();
        let id = create_quad_batch(&mut arena);
        set_quad_batch_transform_type(&mut arena, id, QuadTransformType::Matrix3x2);
        resize_quad_batch(&mut arena, id, 1);
        set_quad_batch_instance_matrix(&mut arena, id, 0, 0, 1.0, 0.0, 0.0, 1.0, 7.0, 8.0);
        set_quad_batch_transform_type(&mut arena, id, QuadTransformType::Vector2);
        let mut out = Vector2Like::default();
        get_quad_batch_instance_transform(&mut out, &arena, id, 0);
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 8.0);
    }
}
