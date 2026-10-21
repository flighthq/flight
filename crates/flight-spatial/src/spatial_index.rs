use std::collections::{HashMap, HashSet};

use crate::{
    SpatialDeclineReason, SpatialIndexingExplanation, SpatialIndexingGuard, SpatialIndexingMode,
    SpatialIndexingNotice, SpatialIndexingOperation, SpatialIndexingReason, SpatialObjectId,
    report_spatial_indexing,
};

// ---------------------------------------------------------------------------
// Structs / enums
// ---------------------------------------------------------------------------

/// Axis-aligned bounding box in two dimensions, with flat fields (not nested vectors).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SpatialAabb2D {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

/// An unordered pair of spatial object ids (a < b by convention).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SpatialPair {
    pub a: SpatialObjectId,
    pub b: SpatialObjectId,
}

/// One occupied cell in the uniform grid.
#[derive(Debug, Clone)]
pub struct GridCell2D {
    pub cx: i32,
    pub cy: i32,
    pub ids: HashSet<SpatialObjectId>,
    pub id_order: Vec<SpatialObjectId>,
}

/// A 2D spatial index backed by a uniform grid. The entity/runtime/backend chain from TS is
/// flattened: this struct holds the grid state directly and every public function operates on it
/// without trait dispatch.
#[derive(Default)]
pub struct SpatialIndex2D {
    pub cell_size: f32,
    pub cells: HashMap<(i32, i32), GridCell2D>,
    pub cell_order: Vec<(i32, i32)>,
    pub bounds: HashMap<SpatialObjectId, SpatialAabb2D>,
    pub object_order: Vec<SpatialObjectId>,
    pub overflow: HashSet<SpatialObjectId>,
    pub overflow_order: Vec<SpatialObjectId>,
    pub declined: HashMap<SpatialObjectId, SpatialDeclineReason>,
    pub min_cell_x: i32,
    pub min_cell_y: i32,
    pub max_cell_x: i32,
    pub max_cell_y: i32,
    pub seen: HashSet<SpatialObjectId>,
    pub seen_order: Vec<SpatialObjectId>,
    pub pair_ids: Vec<SpatialObjectId>,
    pub guard: Option<SpatialIndexingGuard>,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// The per-object cell budget. An object whose AABB covers more cells than this is held in the
/// flat overflow list instead of being written into every cell it spans.
pub const MAX_INDEXED_CELLS_PER_OBJECT: u32 = 1024;

/// Default cell size when creating a 2D spatial index without an explicit value.
pub const DEFAULT_SPATIAL_CELL_SIZE: f32 = 128.0;

// ---------------------------------------------------------------------------
// Free functions -- constructors
// ---------------------------------------------------------------------------

pub fn create_spatial_index_2d(cell_size: f32) -> SpatialIndex2D {
    let mut out = SpatialIndex2D::default();
    initialize_spatial_index_2d(&mut out, cell_size);
    return out;
}

pub fn initialize_spatial_index_2d(out: &mut SpatialIndex2D, cell_size: f32) {
    out.cell_size = cell_size;
    out.cells.clear();
    out.cell_order.clear();
    out.bounds.clear();
    out.object_order.clear();
    out.overflow.clear();
    out.overflow_order.clear();
    out.declined.clear();
    out.seen.clear();
    out.seen_order.clear();
    out.pair_ids.clear();
    out.min_cell_x = 0;
    out.min_cell_y = 0;
    out.max_cell_x = 0;
    out.max_cell_y = 0;
    out.guard = None;
}

/// Maps a world coordinate to its cell index along one axis.
pub(crate) fn cell_index(coord: f32, cell_size: f32) -> i32 {
    return (coord / cell_size).floor() as i32;
}

/// Empties the index of all objects while keeping it reusable.
pub fn clear_spatial_index_2d(index: &mut SpatialIndex2D) {
    index.cells.clear();
    index.cell_order.clear();
    index.bounds.clear();
    index.object_order.clear();
    index.overflow.clear();
    index.overflow_order.clear();
    index.declined.clear();
    index.seen.clear();
    index.seen_order.clear();
    index.pair_ids.clear();
}

/// Reports how `id` is currently held. Pure read-only.
pub(crate) fn explain_grid_indexing(
    index: &SpatialIndex2D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    if let Some(&reason) = index.declined.get(&id) {
        return SpatialIndexingExplanation {
            bucket_count: 0.0,
            id,
            mode: SpatialIndexingMode::Declined,
            reason: Some(reason),
        };
    }
    if index.overflow.contains(&id) {
        return SpatialIndexingExplanation {
            bucket_count: 0.0,
            id,
            mode: SpatialIndexingMode::Overflow,
            reason: None,
        };
    }
    if let Some(&bounds) = index.bounds.get(&id) {
        return SpatialIndexingExplanation {
            bucket_count: spanned_cell_count_2d(index.cell_size, &bounds),
            id,
            mode: SpatialIndexingMode::Cells,
            reason: None,
        };
    }
    return SpatialIndexingExplanation {
        bucket_count: 0.0,
        id,
        mode: SpatialIndexingMode::Absent,
        reason: None,
    };
}

fn insert_into_grid(
    index: &mut SpatialIndex2D,
    id: SpatialObjectId,
    bounds: &SpatialAabb2D,
    operation: SpatialIndexingOperation,
) -> bool {
    if !bounds.min_x.is_finite()
        || !bounds.min_y.is_finite()
        || !bounds.max_x.is_finite()
        || !bounds.max_y.is_finite()
    {
        index.declined.insert(id, SpatialDeclineReason::NonFiniteBounds);
        report_grid_indexing(
            index,
            id,
            SpatialIndexingMode::Declined,
            operation,
            Some(SpatialIndexingReason::NonFiniteBounds),
            0.0,
        );
        return false;
    }
    if bounds.max_x < bounds.min_x || bounds.max_y < bounds.min_y {
        index.declined.insert(id, SpatialDeclineReason::InvertedBounds);
        report_grid_indexing(
            index,
            id,
            SpatialIndexingMode::Declined,
            operation,
            Some(SpatialIndexingReason::InvertedBounds),
            0.0,
        );
        return false;
    }

    let cs = index.cell_size;
    let copy = *bounds;
    if !(cs > 0.0 && cs.is_finite()) {
        if index.bounds.insert(id, copy).is_none() { index.object_order.push(id); }
        if index.overflow.insert(id) { index.overflow_order.push(id); }
        report_grid_indexing(
            index,
            id,
            SpatialIndexingMode::Overflow,
            operation,
            Some(SpatialIndexingReason::InvalidCellSize),
            0.0,
        );
        return true;
    }
    let spanned = spanned_cell_count_2d(cs, &copy);
    if !(spanned <= MAX_INDEXED_CELLS_PER_OBJECT as f64) {
        if index.bounds.insert(id, copy).is_none() { index.object_order.push(id); }
        if index.overflow.insert(id) { index.overflow_order.push(id); }
        report_grid_indexing(
            index,
            id,
            SpatialIndexingMode::Overflow,
            operation,
            None,
            spanned,
        );
        return true;
    }

    let cx0 = cell_index(copy.min_x, cs);
    let cx1 = cell_index(copy.max_x, cs);
    let cy0 = cell_index(copy.min_y, cs);
    let cy1 = cell_index(copy.max_y, cs);
    let had_cells = !index.cells.is_empty();
    if index.bounds.insert(id, copy).is_none() { index.object_order.push(id); }
    for cy in cy0..=cy1 {
        for cx in cx0..=cx1 {
            let key = (cx, cy);
            if !index.cells.contains_key(&key) { index.cell_order.push(key); }
            let cell = index.cells.entry(key).or_insert_with(|| GridCell2D {
                cx,
                cy,
                ids: HashSet::new(), id_order: Vec::new(),
            });
            if cell.ids.insert(id) { cell.id_order.push(id); }
        }
    }
    if !had_cells {
        index.min_cell_x = cx0;
        index.max_cell_x = cx1;
        index.min_cell_y = cy0;
        index.max_cell_y = cy1;
    } else {
        if cx0 < index.min_cell_x {
            index.min_cell_x = cx0;
        }
        if cx1 > index.max_cell_x {
            index.max_cell_x = cx1;
        }
        if cy0 < index.min_cell_y {
            index.min_cell_y = cy0;
        }
        if cy1 > index.max_cell_y {
            index.max_cell_y = cy1;
        }
    }
    return true;
}

/// Adds an object to the index. Returns false for non-finite or inverted bounds.
pub fn insert_spatial_object_2d(
    index: &mut SpatialIndex2D,
    id: SpatialObjectId,
    bounds: &SpatialAabb2D,
) -> bool {
    return insert_into_grid(index, id, bounds, SpatialIndexingOperation::Insert);
}

fn is_spatial_aabb_contains_point_2d(aabb: &SpatialAabb2D, x: f32, y: f32) -> bool {
    let min_x = aabb.min_x;
    let min_y = aabb.min_y;
    let max_x = aabb.max_x;
    let max_y = aabb.max_y;
    return x >= min_x && x < max_x && y >= min_y && y < max_y;
}

fn is_spatial_aabb_overlapping_2d(a: &SpatialAabb2D, b: &SpatialAabb2D) -> bool {
    let a_min_x = a.min_x;
    let a_min_y = a.min_y;
    let a_max_x = a.max_x;
    let a_max_y = a.max_y;
    let b_min_x = b.min_x;
    let b_min_y = b.min_y;
    let b_max_x = b.max_x;
    let b_max_y = b.max_y;
    return a_min_x < b_max_x
        && a_max_x > b_min_x
        && a_min_y < b_max_y
        && a_max_y > b_min_y;
}

fn query_grid_overflow_pairs(index: &mut SpatialIndex2D, out: &mut Vec<SpatialPair>) {
    let overflow_ids = &index.overflow_order;
    for &id in overflow_ids {
        let bounds = match index.bounds.get(&id) {
            Some(&b) => b,
            None => continue,
        };
        for &other_id in &index.object_order {
            let other_bounds = index.bounds[&other_id];
            if other_id == id {
                continue;
            }
            if index.overflow.contains(&other_id) && other_id < id {
                continue;
            }
            if !is_spatial_aabb_overlapping_2d(&bounds, &other_bounds) {
                continue;
            }
            if id < other_id {
                out.push(SpatialPair { a: id, b: other_id });
            } else {
                out.push(SpatialPair {
                    a: other_id,
                    b: id,
                });
            }
        }
    }
}

fn query_grid_point(
    index: &mut SpatialIndex2D,
    x: f32,
    y: f32,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    let cs = index.cell_size;
    let key = (cell_index(x, cs), cell_index(y, cs));
    if let Some(cell) = index.cells.get(&key) {
        for &id in &cell.id_order {
            if let Some(&bounds) = index.bounds.get(&id) {
                if is_spatial_aabb_contains_point_2d(&bounds, x, y) {
                    out.push(id);
                }
            }
        }
    }
    for &id in &index.overflow_order {
        if let Some(&bounds) = index.bounds.get(&id) {
            if is_spatial_aabb_contains_point_2d(&bounds, x, y) {
                out.push(id);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn query_grid_ray(
    index: &mut SpatialIndex2D,
    ox: f32,
    oy: f32,
    dx: f32,
    dy: f32,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    let cs = index.cell_size;
    index.seen.clear();
    index.seen_order.clear();
    if dx == 0.0 && dy == 0.0 {
        query_grid_point(index, ox, oy, out);
        return;
    }
    // Slab-test overflowed objects directly.
    for &id in &index.overflow_order {
        if let Some(&bounds) = index.bounds.get(&id) {
            if ray_box_entry_t_2d(
                ox, oy, dx, dy, bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y,
            ) >= 0.0
            {
                out.push(id);
            }
        }
    }
    if index.cells.is_empty() {
        return;
    }
    let box_min_x = index.min_cell_x as f32 * cs;
    let box_min_y = index.min_cell_y as f32 * cs;
    let box_max_x = (index.max_cell_x + 1) as f32 * cs;
    let box_max_y = (index.max_cell_y + 1) as f32 * cs;
    let t_enter = ray_box_entry_t_2d(ox, oy, dx, dy, box_min_x, box_min_y, box_max_x, box_max_y);
    if t_enter < 0.0 {
        return;
    }
    let start_x = ox + t_enter * dx;
    let start_y = oy + t_enter * dy;
    let mut cx = cell_index(start_x, cs);
    let mut cy = cell_index(start_y, cs);
    if cx < index.min_cell_x {
        cx = index.min_cell_x;
    } else if cx > index.max_cell_x {
        cx = index.max_cell_x;
    }
    if cy < index.min_cell_y {
        cy = index.min_cell_y;
    } else if cy > index.max_cell_y {
        cy = index.max_cell_y;
    }
    let step_x: i32 = if dx > 0.0 { 1 } else if dx < 0.0 { -1 } else { 0 };
    let step_y: i32 = if dy > 0.0 { 1 } else if dy < 0.0 { -1 } else { 0 };
    let mut t_max_x = f32::INFINITY;
    let mut t_delta_x = f32::INFINITY;
    if step_x != 0 {
        let boundary = if step_x > 0 {
            (cx + 1) as f32 * cs
        } else {
            cx as f32 * cs
        };
        t_max_x = (boundary - ox) / dx;
        t_delta_x = cs / dx.abs();
    }
    let mut t_max_y = f32::INFINITY;
    let mut t_delta_y = f32::INFINITY;
    if step_y != 0 {
        let boundary = if step_y > 0 {
            (cy + 1) as f32 * cs
        } else {
            cy as f32 * cs
        };
        t_max_y = (boundary - oy) / dy;
        t_delta_y = cs / dy.abs();
    }
    let max_steps =
        (index.max_cell_x - index.min_cell_x) + (index.max_cell_y - index.min_cell_y) + 3;
    for _ in 0..=max_steps {
        if cx < index.min_cell_x
            || cx > index.max_cell_x
            || cy < index.min_cell_y
            || cy > index.max_cell_y
        {
            break;
        }
        if let Some(cell) = index.cells.get(&(cx, cy)) {
            for &id in &cell.id_order {
                if index.seen.insert(id) { index.seen_order.push(id); }
            }
        }
        if t_max_x < t_max_y {
            cx += step_x;
            t_max_x += t_delta_x;
        } else {
            cy += step_y;
            t_max_y += t_delta_y;
        }
    }
    for &id in &index.seen_order {
        if let Some(&bounds) = index.bounds.get(&id) {
            if ray_box_entry_t_2d(
                ox, oy, dx, dy, bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y,
            ) >= 0.0
            {
                out.push(id);
            }
        }
    }
}

fn query_grid_region(
    index: &mut SpatialIndex2D,
    region: &SpatialAabb2D,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    let cs = index.cell_size;
    index.seen.clear();
    index.seen_order.clear();

    if !(spanned_cell_count_2d(cs, region) <= index.cells.len() as f64) {
        for &id in &index.object_order {
            let bounds = index.bounds[&id];
            if is_spatial_aabb_overlapping_2d(&bounds, region) {
                out.push(id);
            }
        }
        return;
    }

    let cx0 = cell_index(region.min_x, cs);
    let cx1 = cell_index(region.max_x, cs);
    let cy0 = cell_index(region.min_y, cs);
    let cy1 = cell_index(region.max_y, cs);
    for cy in cy0..=cy1 {
        for cx in cx0..=cx1 {
            if let Some(cell) = index.cells.get(&(cx, cy)) {
                for &id in &cell.id_order {
                    if index.seen.contains(&id) {
                        continue;
                    }
                    if index.seen.insert(id) { index.seen_order.push(id); }
                    if let Some(&bounds) = index.bounds.get(&id) {
                        if is_spatial_aabb_overlapping_2d(&bounds, region) {
                            out.push(id);
                        }
                    }
                }
            }
        }
    }
    for &id in &index.overflow_order {
        if let Some(&bounds) = index.bounds.get(&id) {
            if is_spatial_aabb_overlapping_2d(&bounds, region) {
                out.push(id);
            }
        }
    }
}

/// Fills `out` (cleared first) with every deduplicated candidate pair.
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_pairs_2d(out: &mut Vec<SpatialPair>, index: &mut SpatialIndex2D) {
    out.clear();
    let cs = index.cell_size;
    for key in &index.cell_order {
        let cell = &index.cells[key];
        if cell.ids.len() < 2 {
            continue;
        }
        index.pair_ids.clear();
        for &id in &cell.id_order {
            index.pair_ids.push(id);
        }
        let len = index.pair_ids.len();
        for i in 0..len {
            for j in (i + 1)..len {
                let mut a = index.pair_ids[i];
                let mut b = index.pair_ids[j];
                if a > b {
                    let t = a;
                    a = b;
                    b = t;
                }
                let ab = match index.bounds.get(&a) {
                    Some(&v) => v,
                    None => continue,
                };
                let bb = match index.bounds.get(&b) {
                    Some(&v) => v,
                    None => continue,
                };
                let canonical_x = cell_index(ab.min_x, cs).max(cell_index(bb.min_x, cs));
                let canonical_y = cell_index(ab.min_y, cs).max(cell_index(bb.min_y, cs));
                if cell.cx == canonical_x && cell.cy == canonical_y {
                    out.push(SpatialPair { a, b });
                }
            }
        }
    }
    if !index.overflow.is_empty() {
        query_grid_overflow_pairs(index, out);
    }
}

/// Fills `out` (cleared first) with ids whose bounds contain (`x`, `y`).
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_point_2d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex2D, x: f32, y: f32) {
    query_grid_point(index, x, y, out);
}

/// Fills `out` (cleared first) with ids whose bounds the ray intersects.
#[allow(clippy::too_many_arguments)]
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_ray_2d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex2D, x: f32, y: f32, dx: f32, dy: f32) {
    query_grid_ray(index, x, y, dx, dy, out);
}

/// Fills `out` (cleared first) with ids whose bounds overlap `region`.
// flight-lint: allow(conform-params) D9b approved caller-owned output comes first; pinned TS still places out after the query inputs
pub fn query_spatial_region_2d(out: &mut Vec<SpatialObjectId>, index: &mut SpatialIndex2D, region: &SpatialAabb2D) {
    query_grid_region(index, region, out);
}

#[allow(clippy::too_many_arguments)]
fn ray_box_entry_t_2d(
    ox: f32,
    oy: f32,
    dx: f32,
    dy: f32,
    min_x: f32,
    min_y: f32,
    max_x: f32,
    max_y: f32,
) -> f32 {
    let mut tmin = f32::NEG_INFINITY;
    let mut tmax = f32::INFINITY;
    if dx != 0.0 {
        let inv = 1.0 / dx;
        let mut t1 = (min_x - ox) * inv;
        let mut t2 = (max_x - ox) * inv;
        if t1 > t2 {
            let t = t1;
            t1 = t2;
            t2 = t;
        }
        if t1 > tmin {
            tmin = t1;
        }
        if t2 < tmax {
            tmax = t2;
        }
    } else if ox < min_x || ox > max_x {
        return -1.0;
    }
    if dy != 0.0 {
        let inv = 1.0 / dy;
        let mut t1 = (min_y - oy) * inv;
        let mut t2 = (max_y - oy) * inv;
        if t1 > t2 {
            let t = t1;
            t1 = t2;
            t2 = t;
        }
        if t1 > tmin {
            tmin = t1;
        }
        if t2 < tmax {
            tmax = t2;
        }
    } else if oy < min_y || oy > max_y {
        return -1.0;
    }
    if tmax < tmin || tmax < 0.0 {
        return -1.0;
    }
    return if tmin > 0.0 { tmin } else { 0.0 };
}

fn remove_from_grid(index: &mut SpatialIndex2D, id: SpatialObjectId) {
    index.declined.remove(&id);
    let bounds = match index.bounds.get(&id) {
        Some(&b) => b,
        None => return,
    };
    if index.overflow.remove(&id) {
        index.overflow_order.retain(|&other| other != id);
        index.bounds.remove(&id);
    index.object_order.retain(|&other| other != id);
        return;
    }
    let cs = index.cell_size;
    let cx0 = cell_index(bounds.min_x, cs);
    let cx1 = cell_index(bounds.max_x, cs);
    let cy0 = cell_index(bounds.min_y, cs);
    let cy1 = cell_index(bounds.max_y, cs);
    for cy in cy0..=cy1 {
        for cx in cx0..=cx1 {
            let key = (cx, cy);
            let should_remove = if let Some(cell) = index.cells.get_mut(&key) {
                cell.ids.remove(&id);
                cell.id_order.retain(|&other| other != id);
                cell.ids.is_empty()
            } else {
                false
            };
            if should_remove {
                index.cells.remove(&key);
                index.cell_order.retain(|other| *other != key);
            }
        }
    }
    index.bounds.remove(&id);
    index.object_order.retain(|&other| other != id);
}

/// Removes an object from the index. Reports through the guard if the id was not present.
pub fn remove_spatial_object_2d(index: &mut SpatialIndex2D, id: SpatialObjectId) {
    let was_missing = !index.bounds.contains_key(&id) && !index.declined.contains_key(&id);
    remove_from_grid(index, id);
    if was_missing {
        report_grid_indexing(
            index,
            id,
            SpatialIndexingMode::Absent,
            SpatialIndexingOperation::Remove,
            Some(SpatialIndexingReason::MissingId),
            0.0,
        );
    }
}

fn report_grid_indexing(
    index: &SpatialIndex2D,
    id: SpatialObjectId,
    mode: SpatialIndexingMode,
    operation: SpatialIndexingOperation,
    reason: Option<SpatialIndexingReason>,
    would_occupy_bucket_count: f64,
) {
    report_spatial_indexing(
        index.guard,
        &SpatialIndexingNotice {
            cell_size: index.cell_size,
            id,
            mode,
            operation,
            reason,
            would_occupy_bucket_count,
        },
    );
}

/// Sets the indexing guard on this 2D index.
pub fn set_spatial_indexing_guard_2d(
    index: &mut SpatialIndex2D,
    guard: Option<SpatialIndexingGuard>,
) {
    index.guard = guard;
}

/// How many cells an AABB spans, computed as f64 to handle astronomical values.
// flight-lint: allow(f64) cell span products and the +1 endpoint beyond 2^24 require double precision
pub(crate) fn spanned_cell_count_2d(cell_size: f32, aabb: &SpatialAabb2D) -> f64 {
    let cx0 = (aabb.min_x as f64 / cell_size as f64).floor();
    let cx1 = (aabb.max_x as f64 / cell_size as f64).floor();
    let cy0 = (aabb.min_y as f64 / cell_size as f64).floor();
    let cy1 = (aabb.max_y as f64 / cell_size as f64).floor();
    return (cx1 - cx0 + 1.0) * (cy1 - cy0 + 1.0);
}

fn update_grid_object(
    index: &mut SpatialIndex2D,
    id: SpatialObjectId,
    bounds: &SpatialAabb2D,
) -> bool {
    let was_missing = !index.bounds.contains_key(&id) && !index.declined.contains_key(&id);

    // Fast path: if previous bounds exist, not in overflow, new bounds valid and same cells.
    let fast_path = if let Some(&previous) = index.bounds.get(&id) {
        if !index.overflow.contains(&id)
            && bounds.min_x.is_finite()
            && bounds.min_y.is_finite()
            && bounds.max_x.is_finite()
            && bounds.max_y.is_finite()
            && bounds.min_x <= bounds.max_x
            && bounds.min_y <= bounds.max_y
        {
            let cs = index.cell_size;
            let spanned = spanned_cell_count_2d(cs, bounds);
            spanned <= MAX_INDEXED_CELLS_PER_OBJECT as f64
                && cell_index(previous.min_x, cs) == cell_index(bounds.min_x, cs)
                && cell_index(previous.min_y, cs) == cell_index(bounds.min_y, cs)
                && cell_index(previous.max_x, cs) == cell_index(bounds.max_x, cs)
                && cell_index(previous.max_y, cs) == cell_index(bounds.max_y, cs)
        } else {
            false
        }
    } else {
        false
    };

    if fast_path {
        let entry = index.bounds.get_mut(&id).unwrap();
        entry.min_x = bounds.min_x;
        entry.min_y = bounds.min_y;
        entry.max_x = bounds.max_x;
        entry.max_y = bounds.max_y;
        return true;
    }

    remove_from_grid(index, id);
    let inserted = insert_into_grid(index, id, bounds, SpatialIndexingOperation::Update);
    if was_missing {
        let explanation = explain_grid_indexing(index, id);
        report_grid_indexing(
            index,
            id,
            explanation.mode,
            SpatialIndexingOperation::Update,
            Some(SpatialIndexingReason::MissingId),
            0.0,
        );
    }
    return inserted;
}

/// Updates an already-inserted object to new bounds.
pub fn update_spatial_object_2d(
    index: &mut SpatialIndex2D,
    id: SpatialObjectId,
    bounds: &SpatialAabb2D,
) -> bool {
    return update_grid_object(index, id, bounds);
}

// ---------------------------------------------------------------------------
// impl Default (via derive)
// ---------------------------------------------------------------------------

// SpatialIndex2D uses #[derive(Default)] above.

// ---------------------------------------------------------------------------
// impl blocks (Rust-side sugar, NOT transpiled)
// ---------------------------------------------------------------------------

impl SpatialIndex2D {
    pub fn new(cell_size: f32) -> Self {
        return create_spatial_index_2d(cell_size);
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
