use std::sync::{Arc, Mutex, PoisonError};

use std::collections::{HashMap, HashSet};

use crate::{
    SpatialDeclineReason, SpatialIndexBackend3D, SpatialIndexingExplanation, SpatialIndexingMode,
    SpatialIndexingNotice, SpatialIndexingOperation, SpatialIndexingReason, SpatialObjectId,
    SpatialPair, report_spatial_indexing, uniform_grid::MAX_INDEXED_CELLS_PER_OBJECT,
};

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

/// One occupied cell in the 3D uniform grid.
#[derive(Debug, Clone)]
pub struct GridCell3D {
    pub cx: i32,
    pub cy: i32,
    pub cz: i32,
    pub ids: HashSet<SpatialObjectId>,
    pub id_order: Vec<SpatialObjectId>,
}

/// Axis-aligned bounding box in three dimensions, with flat fields.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SpatialAabb3D {
    pub min_x: f32,
    pub min_y: f32,
    pub min_z: f32,
    pub max_x: f32,
    pub max_y: f32,
    pub max_z: f32,
}

/// Mutable state captured by a uniform-grid backend callback record.
#[derive(Default)]
pub struct UniformGrid3D {
    pub cell_size: f32,
    pub cells: HashMap<(i32, i32, i32), GridCell3D>,
    pub cell_order: Vec<(i32, i32, i32)>,
    pub bounds: HashMap<SpatialObjectId, SpatialAabb3D>,
    pub object_order: Vec<SpatialObjectId>,
    pub overflow: HashSet<SpatialObjectId>,
    pub overflow_order: Vec<SpatialObjectId>,
    pub declined: HashMap<SpatialObjectId, SpatialDeclineReason>,
    pub min_cell_x: i32,
    pub min_cell_y: i32,
    pub min_cell_z: i32,
    pub max_cell_x: i32,
    pub max_cell_y: i32,
    pub max_cell_z: i32,
    pub seen: HashSet<SpatialObjectId>,
    pub seen_order: Vec<SpatialObjectId>,
    pub pair_ids: Vec<SpatialObjectId>,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const DEFAULT_SPATIAL_CELL_SIZE_3D: f32 = 128.0;

// ---------------------------------------------------------------------------
// Free functions -- constructors
// ---------------------------------------------------------------------------

pub fn create_uniform_grid_spatial_backend_3d(cell_size: f32) -> SpatialIndexBackend3D {
    return uniform_grid_backend_3d_callbacks(UniformGrid3D {
        cell_size,
        ..UniformGrid3D::default()
    });
}

pub fn initialize_uniform_grid_spatial_backend_3d(out: &mut SpatialIndexBackend3D, cell_size: f32) {
    *out = uniform_grid_backend_3d_callbacks(UniformGrid3D {
        cell_size,
        ..UniformGrid3D::default()
    });
}

pub(crate) fn cell_index_3d(coord: f32, cell_size: f32) -> i32 {
    return (coord / cell_size).floor() as i32;
}

pub(crate) fn clear_grid_3d(grid: &mut UniformGrid3D) {
    grid.cells.clear();
    grid.cell_order.clear();
    grid.bounds.clear();
    grid.object_order.clear();
    grid.overflow.clear();
    grid.overflow_order.clear();
    grid.declined.clear();
    grid.seen.clear();
    grid.seen_order.clear();
    grid.pair_ids.clear();
}

pub(crate) fn explain_grid_3d_indexing(
    grid: &UniformGrid3D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    if let Some(&reason) = grid.declined.get(&id) {
        return SpatialIndexingExplanation {
            bucket_count: 0.0,
            id,
            mode: SpatialIndexingMode::Declined,
            reason: Some(reason),
        };
    }
    if grid.overflow.contains(&id) {
        return SpatialIndexingExplanation {
            bucket_count: 0.0,
            id,
            mode: SpatialIndexingMode::Overflow,
            reason: None,
        };
    }
    if let Some(&bounds) = grid.bounds.get(&id) {
        return SpatialIndexingExplanation {
            bucket_count: spanned_cell_count_3d(grid.cell_size, &bounds),
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

// flight-lint: allow(f64) compare double cubic spans to the fixed per-object budget before any cell walk
pub(crate) fn insert_into_grid_3d(
    grid: &mut UniformGrid3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
    operation: SpatialIndexingOperation,
) -> bool {
    if !bounds.min_x.is_finite()
        || !bounds.min_y.is_finite()
        || !bounds.min_z.is_finite()
        || !bounds.max_x.is_finite()
        || !bounds.max_y.is_finite()
        || !bounds.max_z.is_finite()
    {
        grid.declined
            .insert(id, SpatialDeclineReason::NonFiniteBounds);
        report_grid_3d_indexing(
            grid,
            id,
            SpatialIndexingMode::Declined,
            operation,
            Some(SpatialIndexingReason::NonFiniteBounds),
            0.0,
        );
        return false;
    }
    if bounds.max_x < bounds.min_x || bounds.max_y < bounds.min_y || bounds.max_z < bounds.min_z {
        grid.declined
            .insert(id, SpatialDeclineReason::InvertedBounds);
        report_grid_3d_indexing(
            grid,
            id,
            SpatialIndexingMode::Declined,
            operation,
            Some(SpatialIndexingReason::InvertedBounds),
            0.0,
        );
        return false;
    }

    let cs = grid.cell_size;
    let copy = *bounds;
    if !(cs > 0.0 && cs.is_finite()) {
        if grid.bounds.insert(id, copy).is_none() {
            grid.object_order.push(id);
        }
        if grid.overflow.insert(id) {
            grid.overflow_order.push(id);
        }
        report_grid_3d_indexing(
            grid,
            id,
            SpatialIndexingMode::Overflow,
            operation,
            Some(SpatialIndexingReason::InvalidCellSize),
            0.0,
        );
        return true;
    }
    let spanned = spanned_cell_count_3d(cs, &copy);
    if !(spanned <= MAX_INDEXED_CELLS_PER_OBJECT as f64) {
        if grid.bounds.insert(id, copy).is_none() {
            grid.object_order.push(id);
        }
        if grid.overflow.insert(id) {
            grid.overflow_order.push(id);
        }
        report_grid_3d_indexing(
            grid,
            id,
            SpatialIndexingMode::Overflow,
            operation,
            None,
            spanned,
        );
        return true;
    }

    let cx0 = cell_index_3d(copy.min_x, cs);
    let cx1 = cell_index_3d(copy.max_x, cs);
    let cy0 = cell_index_3d(copy.min_y, cs);
    let cy1 = cell_index_3d(copy.max_y, cs);
    let cz0 = cell_index_3d(copy.min_z, cs);
    let cz1 = cell_index_3d(copy.max_z, cs);
    let had_cells = !grid.cells.is_empty();
    if grid.bounds.insert(id, copy).is_none() {
        grid.object_order.push(id);
    }
    for cz in cz0..=cz1 {
        for cy in cy0..=cy1 {
            for cx in cx0..=cx1 {
                let key = (cx, cy, cz);
                if !grid.cells.contains_key(&key) {
                    grid.cell_order.push(key);
                }
                let cell = grid.cells.entry(key).or_insert_with(|| GridCell3D {
                    cx,
                    cy,
                    cz,
                    ids: HashSet::new(),
                    id_order: Vec::new(),
                });
                if cell.ids.insert(id) {
                    cell.id_order.push(id);
                }
            }
        }
    }
    if !had_cells {
        grid.min_cell_x = cx0;
        grid.max_cell_x = cx1;
        grid.min_cell_y = cy0;
        grid.max_cell_y = cy1;
        grid.min_cell_z = cz0;
        grid.max_cell_z = cz1;
    } else {
        if cx0 < grid.min_cell_x {
            grid.min_cell_x = cx0;
        }
        if cx1 > grid.max_cell_x {
            grid.max_cell_x = cx1;
        }
        if cy0 < grid.min_cell_y {
            grid.min_cell_y = cy0;
        }
        if cy1 > grid.max_cell_y {
            grid.max_cell_y = cy1;
        }
        if cz0 < grid.min_cell_z {
            grid.min_cell_z = cz0;
        }
        if cz1 > grid.max_cell_z {
            grid.max_cell_z = cz1;
        }
    }
    return true;
}

fn is_spatial_aabb_3d_contains_point(aabb: &SpatialAabb3D, x: f32, y: f32, z: f32) -> bool {
    return x >= aabb.min_x
        && x < aabb.max_x
        && y >= aabb.min_y
        && y < aabb.max_y
        && z >= aabb.min_z
        && z < aabb.max_z;
}

pub(crate) fn is_spatial_aabb_3d_overlapping(a: &SpatialAabb3D, b: &SpatialAabb3D) -> bool {
    return a.min_x < b.max_x
        && a.max_x > b.min_x
        && a.min_y < b.max_y
        && a.max_y > b.min_y
        && a.min_z < b.max_z
        && a.max_z > b.min_z;
}

fn query_grid_3d_overflow_pairs(
    grid: &mut UniformGrid3D,
    out: &mut Vec<SpatialPair>,
    mut written: usize,
) -> usize {
    let overflow_ids = &grid.overflow_order;
    for &id in overflow_ids {
        let bounds = match grid.bounds.get(&id) {
            Some(&b) => b,
            None => continue,
        };
        for &other_id in &grid.object_order {
            let other_bounds = grid.bounds[&other_id];
            if other_id == id {
                continue;
            }
            if grid.overflow.contains(&other_id) && other_id < id {
                continue;
            }
            if !is_spatial_aabb_3d_overlapping(&bounds, &other_bounds) {
                continue;
            }
            if id < other_id {
                written = write_grid_3d_pair(out, written, id, other_id);
            } else {
                written = write_grid_3d_pair(out, written, other_id, id);
            }
        }
    }
    return written;
}

pub(crate) fn query_grid_3d_pairs(grid: &mut UniformGrid3D, out: &mut Vec<SpatialPair>) {
    let mut written: usize = 0;
    let cs = grid.cell_size;
    for key in &grid.cell_order {
        let cell = &grid.cells[key];
        if cell.ids.len() < 2 {
            continue;
        }
        grid.pair_ids.clear();
        for &id in &cell.id_order {
            grid.pair_ids.push(id);
        }
        let len = grid.pair_ids.len();
        for i in 0..len {
            for j in (i + 1)..len {
                let mut a = grid.pair_ids[i];
                let mut b = grid.pair_ids[j];
                if a > b {
                    let t = a;
                    a = b;
                    b = t;
                }
                let ab = match grid.bounds.get(&a) {
                    Some(&v) => v,
                    None => continue,
                };
                let bb = match grid.bounds.get(&b) {
                    Some(&v) => v,
                    None => continue,
                };
                let canonical_x = cell_index_3d(ab.min_x, cs).max(cell_index_3d(bb.min_x, cs));
                let canonical_y = cell_index_3d(ab.min_y, cs).max(cell_index_3d(bb.min_y, cs));
                let canonical_z = cell_index_3d(ab.min_z, cs).max(cell_index_3d(bb.min_z, cs));
                if cell.cx == canonical_x && cell.cy == canonical_y && cell.cz == canonical_z {
                    written = write_grid_3d_pair(out, written, a, b);
                }
            }
        }
    }
    if !grid.overflow.is_empty() {
        written = query_grid_3d_overflow_pairs(grid, out, written);
    }
    out.truncate(written);
}

pub(crate) fn query_grid_3d_point(
    grid: &mut UniformGrid3D,
    x: f32,
    y: f32,
    z: f32,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    let cs = grid.cell_size;
    let key = (
        cell_index_3d(x, cs),
        cell_index_3d(y, cs),
        cell_index_3d(z, cs),
    );
    if let Some(cell) = grid.cells.get(&key) {
        for &id in &cell.id_order {
            if let Some(&bounds) = grid.bounds.get(&id) {
                if is_spatial_aabb_3d_contains_point(&bounds, x, y, z) {
                    out.push(id);
                }
            }
        }
    }
    for &id in &grid.overflow_order {
        if let Some(&bounds) = grid.bounds.get(&id) {
            if is_spatial_aabb_3d_contains_point(&bounds, x, y, z) {
                out.push(id);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn query_grid_3d_ray(
    grid: &mut UniformGrid3D,
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    let cs = grid.cell_size;
    grid.seen.clear();
    grid.seen_order.clear();
    if dx == 0.0 && dy == 0.0 && dz == 0.0 {
        query_grid_3d_point(grid, ox, oy, oz, out);
        return;
    }
    for &id in &grid.overflow_order {
        if let Some(&bounds) = grid.bounds.get(&id) {
            if ray_box_3d_entry_t(ox, oy, oz, dx, dy, dz, &bounds) >= 0.0 {
                out.push(id);
            }
        }
    }
    if grid.cells.is_empty() {
        return;
    }
    let range_bounds = SpatialAabb3D {
        min_x: grid.min_cell_x as f32 * cs,
        min_y: grid.min_cell_y as f32 * cs,
        min_z: grid.min_cell_z as f32 * cs,
        max_x: (grid.max_cell_x + 1) as f32 * cs,
        max_y: (grid.max_cell_y + 1) as f32 * cs,
        max_z: (grid.max_cell_z + 1) as f32 * cs,
    };
    let t_enter = ray_box_3d_entry_t(ox, oy, oz, dx, dy, dz, &range_bounds);
    if t_enter < 0.0 {
        return;
    }
    let mut cx = cell_index_3d(ox + t_enter * dx, cs);
    let mut cy = cell_index_3d(oy + t_enter * dy, cs);
    let mut cz = cell_index_3d(oz + t_enter * dz, cs);
    if cx < grid.min_cell_x {
        cx = grid.min_cell_x;
    } else if cx > grid.max_cell_x {
        cx = grid.max_cell_x;
    }
    if cy < grid.min_cell_y {
        cy = grid.min_cell_y;
    } else if cy > grid.max_cell_y {
        cy = grid.max_cell_y;
    }
    if cz < grid.min_cell_z {
        cz = grid.min_cell_z;
    } else if cz > grid.max_cell_z {
        cz = grid.max_cell_z;
    }
    let step_x: i32 = if dx > 0.0 {
        1
    } else if dx < 0.0 {
        -1
    } else {
        0
    };
    let step_y: i32 = if dy > 0.0 {
        1
    } else if dy < 0.0 {
        -1
    } else {
        0
    };
    let step_z: i32 = if dz > 0.0 {
        1
    } else if dz < 0.0 {
        -1
    } else {
        0
    };
    let mut t_max_x = f32::INFINITY;
    let mut t_delta_x = f32::INFINITY;
    if step_x != 0 {
        t_max_x = ((if step_x > 0 {
            (cx + 1) as f32 * cs
        } else {
            cx as f32 * cs
        }) - ox)
            / dx;
        t_delta_x = cs / dx.abs();
    }
    let mut t_max_y = f32::INFINITY;
    let mut t_delta_y = f32::INFINITY;
    if step_y != 0 {
        t_max_y = ((if step_y > 0 {
            (cy + 1) as f32 * cs
        } else {
            cy as f32 * cs
        }) - oy)
            / dy;
        t_delta_y = cs / dy.abs();
    }
    let mut t_max_z = f32::INFINITY;
    let mut t_delta_z = f32::INFINITY;
    if step_z != 0 {
        t_max_z = ((if step_z > 0 {
            (cz + 1) as f32 * cs
        } else {
            cz as f32 * cs
        }) - oz)
            / dz;
        t_delta_z = cs / dz.abs();
    }
    let max_steps = (grid.max_cell_x - grid.min_cell_x)
        + (grid.max_cell_y - grid.min_cell_y)
        + (grid.max_cell_z - grid.min_cell_z)
        + 4;
    for _ in 0..=max_steps {
        if cx < grid.min_cell_x
            || cx > grid.max_cell_x
            || cy < grid.min_cell_y
            || cy > grid.max_cell_y
            || cz < grid.min_cell_z
            || cz > grid.max_cell_z
        {
            break;
        }
        if let Some(cell) = grid.cells.get(&(cx, cy, cz)) {
            for &id in &cell.id_order {
                if grid.seen.insert(id) {
                    grid.seen_order.push(id);
                }
            }
        }
        if t_max_x < t_max_y && t_max_x < t_max_z {
            cx += step_x;
            t_max_x += t_delta_x;
        } else if t_max_y < t_max_z {
            cy += step_y;
            t_max_y += t_delta_y;
        } else {
            cz += step_z;
            t_max_z += t_delta_z;
        }
    }
    for &id in &grid.seen_order {
        if let Some(&bounds) = grid.bounds.get(&id) {
            if ray_box_3d_entry_t(ox, oy, oz, dx, dy, dz, &bounds) >= 0.0 {
                out.push(id);
            }
        }
    }
}

// flight-lint: allow(f64) compare the double cubic query span to occupied-cell count before bounded traversal
pub(crate) fn query_grid_3d_region(
    grid: &mut UniformGrid3D,
    region: &SpatialAabb3D,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    let cs = grid.cell_size;
    grid.seen.clear();
    grid.seen_order.clear();

    if !(spanned_cell_count_3d(cs, region) <= grid.cells.len() as f64) {
        for &id in &grid.object_order {
            let bounds = grid.bounds[&id];
            if is_spatial_aabb_3d_overlapping(&bounds, region) {
                out.push(id);
            }
        }
        return;
    }

    let cx0 = cell_index_3d(region.min_x, cs);
    let cx1 = cell_index_3d(region.max_x, cs);
    let cy0 = cell_index_3d(region.min_y, cs);
    let cy1 = cell_index_3d(region.max_y, cs);
    let cz0 = cell_index_3d(region.min_z, cs);
    let cz1 = cell_index_3d(region.max_z, cs);
    for cz in cz0..=cz1 {
        for cy in cy0..=cy1 {
            for cx in cx0..=cx1 {
                if let Some(cell) = grid.cells.get(&(cx, cy, cz)) {
                    for &id in &cell.id_order {
                        if grid.seen.contains(&id) {
                            continue;
                        }
                        if grid.seen.insert(id) {
                            grid.seen_order.push(id);
                        }
                        if let Some(&bounds) = grid.bounds.get(&id) {
                            if is_spatial_aabb_3d_overlapping(&bounds, region) {
                                out.push(id);
                            }
                        }
                    }
                }
            }
        }
    }
    for &id in &grid.overflow_order {
        if let Some(&bounds) = grid.bounds.get(&id) {
            if is_spatial_aabb_3d_overlapping(&bounds, region) {
                out.push(id);
            }
        }
    }
}

fn ray_box_3d_entry_t(
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    b: &SpatialAabb3D,
) -> f32 {
    let mut tmin = f32::NEG_INFINITY;
    let mut tmax = f32::INFINITY;
    if dx != 0.0 {
        let inv = 1.0 / dx;
        let mut t1 = (b.min_x - ox) * inv;
        let mut t2 = (b.max_x - ox) * inv;
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
    } else if ox < b.min_x || ox > b.max_x {
        return -1.0;
    }
    if dy != 0.0 {
        let inv = 1.0 / dy;
        let mut t1 = (b.min_y - oy) * inv;
        let mut t2 = (b.max_y - oy) * inv;
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
    } else if oy < b.min_y || oy > b.max_y {
        return -1.0;
    }
    if dz != 0.0 {
        let inv = 1.0 / dz;
        let mut t1 = (b.min_z - oz) * inv;
        let mut t2 = (b.max_z - oz) * inv;
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
    } else if oz < b.min_z || oz > b.max_z {
        return -1.0;
    }
    if tmax < tmin || tmax < 0.0 {
        return -1.0;
    }
    return if tmin > 0.0 { tmin } else { 0.0 };
}

pub(crate) fn remove_from_grid_3d(grid: &mut UniformGrid3D, id: SpatialObjectId) {
    grid.declined.remove(&id);
    let bounds = match grid.bounds.get(&id) {
        Some(&b) => b,
        None => return,
    };
    if grid.overflow.remove(&id) {
        grid.overflow_order.retain(|&other| other != id);
        grid.bounds.remove(&id);
        grid.object_order.retain(|&other| other != id);
        return;
    }
    let cs = grid.cell_size;
    let cx0 = cell_index_3d(bounds.min_x, cs);
    let cx1 = cell_index_3d(bounds.max_x, cs);
    let cy0 = cell_index_3d(bounds.min_y, cs);
    let cy1 = cell_index_3d(bounds.max_y, cs);
    let cz0 = cell_index_3d(bounds.min_z, cs);
    let cz1 = cell_index_3d(bounds.max_z, cs);
    for cz in cz0..=cz1 {
        for cy in cy0..=cy1 {
            for cx in cx0..=cx1 {
                let key = (cx, cy, cz);
                let should_remove = if let Some(cell) = grid.cells.get_mut(&key) {
                    cell.ids.remove(&id);
                    cell.id_order.retain(|&other| other != id);
                    cell.ids.is_empty()
                } else {
                    false
                };
                if should_remove {
                    grid.cells.remove(&key);
                    grid.cell_order.retain(|other| *other != key);
                }
            }
        }
    }
    grid.bounds.remove(&id);
    grid.object_order.retain(|&other| other != id);
}

pub(crate) fn remove_spatial_object_grid_3d(grid: &mut UniformGrid3D, id: SpatialObjectId) {
    let was_missing = !grid.bounds.contains_key(&id) && !grid.declined.contains_key(&id);
    remove_from_grid_3d(grid, id);
    if was_missing {
        report_grid_3d_indexing(
            grid,
            id,
            SpatialIndexingMode::Absent,
            SpatialIndexingOperation::Remove,
            Some(SpatialIndexingReason::MissingId),
            0.0,
        );
    }
}

#[allow(clippy::too_many_arguments)]
// flight-lint: allow(f64) carry double refused cubic-cell counts unchanged into diagnostics
fn report_grid_3d_indexing(
    grid: &UniformGrid3D,

    id: SpatialObjectId,
    mode: SpatialIndexingMode,
    operation: SpatialIndexingOperation,
    reason: Option<SpatialIndexingReason>,
    would_occupy_bucket_count: f64,
) {
    report_spatial_indexing(&SpatialIndexingNotice {
        cell_size: grid.cell_size,
        id,
        mode,
        operation,
        reason,
        would_occupy_bucket_count,
    });
}

// flight-lint: allow(f64) cubic cell-span products and endpoint increments require double precision beyond 2^24
pub(crate) fn spanned_cell_count_3d(cell_size: f32, aabb: &SpatialAabb3D) -> f64 {
    let cx0 = (aabb.min_x as f64 / cell_size as f64).floor();
    let cx1 = (aabb.max_x as f64 / cell_size as f64).floor();
    let cy0 = (aabb.min_y as f64 / cell_size as f64).floor();
    let cy1 = (aabb.max_y as f64 / cell_size as f64).floor();
    let cz0 = (aabb.min_z as f64 / cell_size as f64).floor();
    let cz1 = (aabb.max_z as f64 / cell_size as f64).floor();
    return (cx1 - cx0 + 1.0) * (cy1 - cy0 + 1.0) * (cz1 - cz0 + 1.0);
}

fn uniform_grid_backend_3d_callbacks(data: UniformGrid3D) -> SpatialIndexBackend3D {
    let shared = Arc::new(Mutex::new(data));
    return SpatialIndexBackend3D {
        clear_spatial_index: {
            let state = shared.clone();
            Arc::new(move || {
                return clear_grid_3d(&mut state.lock().unwrap_or_else(PoisonError::into_inner));
            })
        },
        explain_spatial_indexing: {
            let state = shared.clone();
            Arc::new(move |id| {
                return explain_grid_3d_indexing(
                    &state.lock().unwrap_or_else(PoisonError::into_inner),
                    id,
                );
            })
        },
        insert_spatial_object: {
            let state = shared.clone();
            Arc::new(move |id, bounds| {
                return insert_into_grid_3d(
                    &mut state.lock().unwrap_or_else(PoisonError::into_inner),
                    id,
                    bounds,
                    SpatialIndexingOperation::Insert,
                );
            })
        },
        query_spatial_pairs: {
            let state = shared.clone();
            Arc::new(move |out| {
                return query_grid_3d_pairs(
                    &mut state.lock().unwrap_or_else(PoisonError::into_inner),
                    out,
                );
            })
        },
        query_spatial_point: {
            let state = shared.clone();
            Arc::new(move |out, x, y, z| {
                return query_grid_3d_point(
                    &mut state.lock().unwrap_or_else(PoisonError::into_inner),
                    x,
                    y,
                    z,
                    out,
                );
            })
        },
        query_spatial_ray: {
            let state = shared.clone();
            Arc::new(move |out, x, y, z, dx, dy, dz| {
                return query_grid_3d_ray(
                    &mut state.lock().unwrap_or_else(PoisonError::into_inner),
                    x,
                    y,
                    z,
                    dx,
                    dy,
                    dz,
                    out,
                );
            })
        },
        query_spatial_region: {
            let state = shared.clone();
            Arc::new(move |out, region| {
                return query_grid_3d_region(
                    &mut state.lock().unwrap_or_else(PoisonError::into_inner),
                    region,
                    out,
                );
            })
        },
        remove_spatial_object: {
            let state = shared.clone();
            Arc::new(move |id| {
                return remove_spatial_object_grid_3d(
                    &mut state.lock().unwrap_or_else(PoisonError::into_inner),
                    id,
                );
            })
        },
        update_spatial_object: {
            let state = shared.clone();
            Arc::new(move |id, bounds| {
                return update_grid_3d_object(
                    &mut state.lock().unwrap_or_else(PoisonError::into_inner),
                    id,
                    bounds,
                );
            })
        },
    };
}

// flight-lint: allow(f64) compare double cubic spans to the per-object budget on the update fast path
pub(crate) fn update_grid_3d_object(
    grid: &mut UniformGrid3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
) -> bool {
    let was_missing = !grid.bounds.contains_key(&id) && !grid.declined.contains_key(&id);

    let fast_path = if let Some(&previous) = grid.bounds.get(&id) {
        if !grid.overflow.contains(&id)
            && bounds.min_x.is_finite()
            && bounds.min_y.is_finite()
            && bounds.min_z.is_finite()
            && bounds.max_x.is_finite()
            && bounds.max_y.is_finite()
            && bounds.max_z.is_finite()
            && bounds.min_x <= bounds.max_x
            && bounds.min_y <= bounds.max_y
            && bounds.min_z <= bounds.max_z
        {
            let cs = grid.cell_size;
            let spanned = spanned_cell_count_3d(cs, bounds);
            spanned <= MAX_INDEXED_CELLS_PER_OBJECT as f64
                && cell_index_3d(previous.min_x, cs) == cell_index_3d(bounds.min_x, cs)
                && cell_index_3d(previous.min_y, cs) == cell_index_3d(bounds.min_y, cs)
                && cell_index_3d(previous.min_z, cs) == cell_index_3d(bounds.min_z, cs)
                && cell_index_3d(previous.max_x, cs) == cell_index_3d(bounds.max_x, cs)
                && cell_index_3d(previous.max_y, cs) == cell_index_3d(bounds.max_y, cs)
                && cell_index_3d(previous.max_z, cs) == cell_index_3d(bounds.max_z, cs)
        } else {
            false
        }
    } else {
        false
    };

    if fast_path {
        let entry = grid.bounds.get_mut(&id).unwrap();
        entry.min_x = bounds.min_x;
        entry.min_y = bounds.min_y;
        entry.min_z = bounds.min_z;
        entry.max_x = bounds.max_x;
        entry.max_y = bounds.max_y;
        entry.max_z = bounds.max_z;
        return true;
    }

    remove_from_grid_3d(grid, id);
    let inserted = insert_into_grid_3d(grid, id, bounds, SpatialIndexingOperation::Update);
    if was_missing {
        let explanation = explain_grid_3d_indexing(grid, id);
        report_grid_3d_indexing(
            grid,
            id,
            explanation.mode,
            SpatialIndexingOperation::Update,
            Some(SpatialIndexingReason::MissingId),
            0.0,
        );
    }
    return inserted;
}

fn write_grid_3d_pair(
    out: &mut Vec<SpatialPair>,
    index: usize,
    a: SpatialObjectId,
    b: SpatialObjectId,
) -> usize {
    if index < out.len() {
        out[index].a = a;
        out[index].b = b;
    } else {
        out.push(SpatialPair { a, b });
    }
    return index + 1;
}

// ---------------------------------------------------------------------------
// impl blocks (Rust-side sugar, NOT transpiled)
// ---------------------------------------------------------------------------
