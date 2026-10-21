use std::collections::HashMap;

use crate::{
    SpatialDeclineReason, SpatialIndexingExplanation, SpatialIndexingGuard, SpatialIndexingMode,
    SpatialIndexingNotice, SpatialIndexingOperation, SpatialIndexingReason, SpatialObjectId,
    SpatialPair, report_spatial_indexing,
    uniform_grid_3d::{SpatialAabb3D, is_spatial_aabb_3d_overlapping},
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BVH_NIL: usize = usize::MAX;

pub const DEFAULT_BVH_MARGIN_3D: f32 = 2.0;

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

/// A dynamic bounding-volume hierarchy for 3D spatial indexing. Arena-based: nodes live in
/// parallel Vec arrays indexed by usize, with BVH_NIL as the "no node" sentinel.
#[derive(Default)]
pub struct Bvh3D {
    pub margin: f32,
    pub root: usize,
    pub min_x: Vec<f32>,
    pub min_y: Vec<f32>,
    pub min_z: Vec<f32>,
    pub max_x: Vec<f32>,
    pub max_y: Vec<f32>,
    pub max_z: Vec<f32>,
    pub parent: Vec<usize>,
    pub child1: Vec<usize>,
    pub child2: Vec<usize>,
    pub height: Vec<i32>,
    pub object: Vec<SpatialObjectId>,
    pub free_list: Vec<usize>,
    pub count: usize,
    pub leaf_by_object: HashMap<SpatialObjectId, usize>,
    pub object_order: Vec<SpatialObjectId>,
    pub bounds: HashMap<SpatialObjectId, SpatialAabb3D>,
    pub declined: HashMap<SpatialObjectId, SpatialDeclineReason>,
    pub stack: Vec<usize>,
}

// ---------------------------------------------------------------------------
// Free functions -- constructors
// ---------------------------------------------------------------------------

pub fn create_bvh_3d(margin: f32) -> Bvh3D {
    let safe_margin = if margin.is_finite() && margin >= 0.0 { margin } else { 0.0 };
    return Bvh3D {
        margin: safe_margin,
        root: BVH_NIL,
        ..Bvh3D::default()
    };
}

fn allocate_bvh_3d_node(tree: &mut Bvh3D) -> usize {
    if let Some(recycled) = tree.free_list.pop() {
        tree.parent[recycled] = BVH_NIL;
        tree.child1[recycled] = BVH_NIL;
        tree.child2[recycled] = BVH_NIL;
        tree.height[recycled] = 0;
        tree.object[recycled] = i32::MAX;
        return recycled;
    }
    let index = tree.min_x.len();
    tree.min_x.push(0.0);
    tree.min_y.push(0.0);
    tree.min_z.push(0.0);
    tree.max_x.push(0.0);
    tree.max_y.push(0.0);
    tree.max_z.push(0.0);
    tree.parent.push(BVH_NIL);
    tree.child1.push(BVH_NIL);
    tree.child2.push(BVH_NIL);
    tree.height.push(0);
    tree.object.push(i32::MAX);
    return index;
}

fn balance_bvh_3d(tree: &mut Bvh3D, index: usize) -> usize {
    if tree.height[index] < 2 { return index; }
    let child1 = tree.child1[index];
    let child2 = tree.child2[index];
    let balance = tree.height[child2] - tree.height[child1];
    if balance > 1 { return rotate_bvh_3d(tree, index, child2); }
    if balance < -1 { return rotate_bvh_3d(tree, index, child1); }
    return index;
}

fn bounds_area(tree: &Bvh3D, index: usize) -> f32 {
    let dx = tree.max_x[index] - tree.min_x[index];
    let dy = tree.max_y[index] - tree.min_y[index];
    let dz = tree.max_z[index] - tree.min_z[index];
    return 2.0 * (dx * dy + dy * dz + dz * dx);
}

pub(crate) fn clear_bvh_3d(tree: &mut Bvh3D) {
    tree.root = BVH_NIL;
    tree.count = 0;
    tree.free_list.clear();
    tree.min_x.clear();
    tree.min_y.clear();
    tree.min_z.clear();
    tree.max_x.clear();
    tree.max_y.clear();
    tree.max_z.clear();
    tree.parent.clear();
    tree.child1.clear();
    tree.child2.clear();
    tree.height.clear();
    tree.object.clear();
    tree.leaf_by_object.clear();
    tree.object_order.clear();
    tree.bounds.clear();
    tree.declined.clear();
}

fn combined_area(tree: &Bvh3D, a: usize, b: usize) -> f32 {
    let dx = tree.max_x[a].max(tree.max_x[b]) - tree.min_x[a].min(tree.min_x[b]);
    let dy = tree.max_y[a].max(tree.max_y[b]) - tree.min_y[a].min(tree.min_y[b]);
    let dz = tree.max_z[a].max(tree.max_z[b]) - tree.min_z[a].min(tree.min_z[b]);
    return 2.0 * (dx * dy + dy * dz + dz * dx);
}

fn descent_cost(tree: &Bvh3D, child: usize, leaf: usize, inheritance_cost: f32) -> f32 {
    let combined = combined_area(tree, child, leaf);
    if tree.height[child] == 0 { return combined + inheritance_cost; }
    return combined - bounds_area(tree, child) + inheritance_cost;
}

pub(crate) fn explain_bvh_3d(tree: &Bvh3D, id: SpatialObjectId) -> SpatialIndexingExplanation {
    if let Some(&reason) = tree.declined.get(&id) {
        return SpatialIndexingExplanation {
            bucket_count: 0.0, id, mode: SpatialIndexingMode::Declined, reason: Some(reason),
        };
    }
    if !tree.leaf_by_object.contains_key(&id) {
        return SpatialIndexingExplanation {
            bucket_count: 0.0, id, mode: SpatialIndexingMode::Absent, reason: None,
        };
    }
    return SpatialIndexingExplanation {
        bucket_count: 0.0, id, mode: SpatialIndexingMode::Cells, reason: None,
    };
}

fn free_bvh_3d_node(tree: &mut Bvh3D, index: usize) {
    tree.parent[index] = BVH_NIL;
    tree.child1[index] = BVH_NIL;
    tree.child2[index] = BVH_NIL;
    tree.object[index] = i32::MAX;
    tree.height[index] = -1;
    tree.free_list.push(index);
}

pub(crate) fn insert_bvh_3d(
    tree: &mut Bvh3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
    operation: SpatialIndexingOperation,
    guard: Option<SpatialIndexingGuard>,
) -> bool {
    if !bounds.min_x.is_finite() || !bounds.min_y.is_finite() || !bounds.min_z.is_finite()
        || !bounds.max_x.is_finite() || !bounds.max_y.is_finite() || !bounds.max_z.is_finite()
    {
        remove_bvh_3d(tree, id);
        tree.declined.insert(id, SpatialDeclineReason::NonFiniteBounds);
        report_bvh_3d_indexing(tree, guard, id, SpatialIndexingMode::Declined, operation, Some(SpatialIndexingReason::NonFiniteBounds));
        return false;
    }
    if bounds.max_x < bounds.min_x || bounds.max_y < bounds.min_y || bounds.max_z < bounds.min_z {
        remove_bvh_3d(tree, id);
        tree.declined.insert(id, SpatialDeclineReason::InvertedBounds);
        report_bvh_3d_indexing(tree, guard, id, SpatialIndexingMode::Declined, operation, Some(SpatialIndexingReason::InvertedBounds));
        return false;
    }
    tree.declined.remove(&id);

    if let Some(&existing) = tree.leaf_by_object.get(&id) {
        if bounds.min_x >= tree.min_x[existing]
            && bounds.min_y >= tree.min_y[existing]
            && bounds.min_z >= tree.min_z[existing]
            && bounds.max_x <= tree.max_x[existing]
            && bounds.max_y <= tree.max_y[existing]
            && bounds.max_z <= tree.max_z[existing]
        {
            let stored = tree.bounds.get_mut(&id).unwrap();
            stored.min_x = bounds.min_x;
            stored.min_y = bounds.min_y;
            stored.min_z = bounds.min_z;
            stored.max_x = bounds.max_x;
            stored.max_y = bounds.max_y;
            stored.max_z = bounds.max_z;
            return true;
        }
        remove_bvh_3d(tree, id);
    }

    let leaf = allocate_bvh_3d_node(tree);
    let margin = tree.margin;
    tree.min_x[leaf] = bounds.min_x - margin;
    tree.min_y[leaf] = bounds.min_y - margin;
    tree.min_z[leaf] = bounds.min_z - margin;
    tree.max_x[leaf] = bounds.max_x + margin;
    tree.max_y[leaf] = bounds.max_y + margin;
    tree.max_z[leaf] = bounds.max_z + margin;
    tree.object[leaf] = id;
    tree.height[leaf] = 0;
    tree.child1[leaf] = BVH_NIL;
    tree.child2[leaf] = BVH_NIL;
    if tree.leaf_by_object.insert(id, leaf).is_none() { tree.object_order.push(id); }
    tree.bounds.insert(id, *bounds);
    tree.count += 1;

    insert_bvh_3d_leaf(tree, leaf);
    return true;
}

fn insert_bvh_3d_leaf(tree: &mut Bvh3D, leaf: usize) {
    if tree.root == BVH_NIL {
        tree.root = leaf;
        tree.parent[leaf] = BVH_NIL;
        return;
    }
    let mut index = tree.root;
    while tree.height[index] > 0 {
        let c1 = tree.child1[index];
        let c2 = tree.child2[index];
        let area = bounds_area(tree, index);
        let combined = combined_area(tree, index, leaf);
        let branch_cost = 2.0 * combined;
        let inheritance_cost = 2.0 * (combined - area);
        let cost1 = descent_cost(tree, c1, leaf, inheritance_cost);
        let cost2 = descent_cost(tree, c2, leaf, inheritance_cost);
        if branch_cost < cost1 && branch_cost < cost2 { break; }
        index = if cost1 < cost2 { c1 } else { c2 };
    }

    let sibling = index;
    let old_parent = tree.parent[sibling];
    let new_parent = allocate_bvh_3d_node(tree);
    tree.parent[new_parent] = old_parent;
    tree.object[new_parent] = i32::MAX;
    tree.child1[new_parent] = sibling;
    tree.child2[new_parent] = leaf;
    tree.height[new_parent] = tree.height[sibling] + 1;
    union_bounds(tree, new_parent, sibling, leaf);
    tree.parent[sibling] = new_parent;
    tree.parent[leaf] = new_parent;

    if old_parent == BVH_NIL {
        tree.root = new_parent;
    } else if tree.child1[old_parent] == sibling {
        tree.child1[old_parent] = new_parent;
    } else {
        tree.child2[old_parent] = new_parent;
    }

    refit_bvh_3d_ancestors(tree, tree.parent[leaf]);
}

fn node_overlaps_bounds(tree: &Bvh3D, index: usize, region: &SpatialAabb3D) -> bool {
    return tree.min_x[index] <= region.max_x && tree.max_x[index] >= region.min_x
        && tree.min_y[index] <= region.max_y && tree.max_y[index] >= region.min_y
        && tree.min_z[index] <= region.max_z && tree.max_z[index] >= region.min_z;
}

pub(crate) fn query_bvh_3d_pairs(tree: &mut Bvh3D, out: &mut Vec<SpatialPair>) {
    let mut written: usize = 0;
    if tree.root == BVH_NIL {
        out.clear();
        return;
    }
    for &id in &tree.object_order {
        let leaf = tree.leaf_by_object[&id];
        let exact = match tree.bounds.get(&id) {
            Some(&b) => b,
            None => continue,
        };
        tree.stack.clear();
        tree.stack.push(tree.root);
        while !tree.stack.is_empty() {
            let node = tree.stack.pop().unwrap();
            if node == BVH_NIL || node == leaf { continue; }
            if !node_overlaps_bounds(tree, node, &exact) { continue; }
            if tree.height[node] == 0 {
                let other = tree.object[node];
                if other <= id { continue; }
                if let Some(&other_exact) = tree.bounds.get(&other) {
                    if is_spatial_aabb_3d_overlapping(&exact, &other_exact) {
                        if written < out.len() {
                            out[written].a = id;
                            out[written].b = other;
                        } else {
                            out.push(SpatialPair { a: id, b: other });
                        }
                        written += 1;
                    }
                }
                continue;
            }
            tree.stack.push(tree.child1[node]);
            tree.stack.push(tree.child2[node]);
        }
    }
    out.truncate(written);
}

pub(crate) fn query_bvh_3d_point(
    tree: &mut Bvh3D,
    x: f32, y: f32, z: f32,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    if tree.root == BVH_NIL { return; }
    tree.stack.clear();
    tree.stack.push(tree.root);
    while !tree.stack.is_empty() {
        let node = tree.stack.pop().unwrap();
        if node == BVH_NIL { continue; }
        if x < tree.min_x[node] || x > tree.max_x[node]
            || y < tree.min_y[node] || y > tree.max_y[node]
            || z < tree.min_z[node] || z > tree.max_z[node]
        { continue; }
        if tree.height[node] == 0 {
            let obj_id = tree.object[node];
            if let Some(&exact) = tree.bounds.get(&obj_id) {
                if x >= exact.min_x && x < exact.max_x
                    && y >= exact.min_y && y < exact.max_y
                    && z >= exact.min_z && z < exact.max_z
                {
                    out.push(obj_id);
                }
            }
            continue;
        }
        tree.stack.push(tree.child1[node]);
        tree.stack.push(tree.child2[node]);
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn query_bvh_3d_ray(
    tree: &mut Bvh3D,
    x: f32, y: f32, z: f32,
    dx: f32, dy: f32, dz: f32,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    if tree.root == BVH_NIL { return; }
    tree.stack.clear();
    tree.stack.push(tree.root);
    while !tree.stack.is_empty() {
        let node = tree.stack.pop().unwrap();
        if node == BVH_NIL { continue; }
        if !ray_slabs_hit(x, y, z, dx, dy, dz,
            tree.min_x[node], tree.min_y[node], tree.min_z[node],
            tree.max_x[node], tree.max_y[node], tree.max_z[node])
        { continue; }
        if tree.height[node] == 0 {
            let obj_id = tree.object[node];
            if let Some(&exact) = tree.bounds.get(&obj_id) {
                if ray_slabs_hit(x, y, z, dx, dy, dz,
                    exact.min_x, exact.min_y, exact.min_z,
                    exact.max_x, exact.max_y, exact.max_z)
                {
                    out.push(obj_id);
                }
            }
            continue;
        }
        tree.stack.push(tree.child1[node]);
        tree.stack.push(tree.child2[node]);
    }
}

pub(crate) fn query_bvh_3d_region(
    tree: &mut Bvh3D,
    region: &SpatialAabb3D,
    out: &mut Vec<SpatialObjectId>,
) {
    out.clear();
    if tree.root == BVH_NIL { return; }
    tree.stack.clear();
    tree.stack.push(tree.root);
    while !tree.stack.is_empty() {
        let node = tree.stack.pop().unwrap();
        if node == BVH_NIL || !node_overlaps_bounds(tree, node, region) { continue; }
        if tree.height[node] == 0 {
            let obj_id = tree.object[node];
            if let Some(&exact) = tree.bounds.get(&obj_id) {
                if is_spatial_aabb_3d_overlapping(&exact, region) { out.push(obj_id); }
            }
            continue;
        }
        tree.stack.push(tree.child1[node]);
        tree.stack.push(tree.child2[node]);
    }
}

#[allow(clippy::too_many_arguments)]
fn ray_slabs_hit(
    x: f32, y: f32, z: f32,
    dx: f32, dy: f32, dz: f32,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
) -> bool {
    let mut near: f32 = 0.0;
    let mut far: f32 = f32::INFINITY;
    let origins = [x, y, z];
    let directions = [dx, dy, dz];
    let lows = [min_x, min_y, min_z];
    let highs = [max_x, max_y, max_z];
    for axis in 0..3 {
        let origin = origins[axis];
        let direction = directions[axis];
        let low = lows[axis];
        let high = highs[axis];
        if direction == 0.0 {
            if origin < low || origin > high { return false; }
            continue;
        }
        let inverse = 1.0 / direction;
        let mut t0 = (low - origin) * inverse;
        let mut t1 = (high - origin) * inverse;
        if t0 > t1 { let swap = t0; t0 = t1; t1 = swap; }
        if t0 > near { near = t0; }
        if t1 < far { far = t1; }
        if near > far { return false; }
    }
    return true;
}

fn refit_bvh_3d_ancestors(tree: &mut Bvh3D, start: usize) {
    let mut index = start;
    while index != BVH_NIL {
        index = balance_bvh_3d(tree, index);
        let c1 = tree.child1[index];
        let c2 = tree.child2[index];
        tree.height[index] = 1 + tree.height[c1].max(tree.height[c2]);
        union_bounds(tree, index, c1, c2);
        index = tree.parent[index];
    }
}

pub(crate) fn remove_bvh_3d(tree: &mut Bvh3D, id: SpatialObjectId) {
    tree.declined.remove(&id);
    let leaf = match tree.leaf_by_object.get(&id) {
        Some(&l) => l,
        None => return,
    };
    tree.leaf_by_object.remove(&id);
    tree.object_order.retain(|&other| other != id);
    tree.bounds.remove(&id);
    tree.count -= 1;
    remove_bvh_3d_leaf(tree, leaf);
    free_bvh_3d_node(tree, leaf);
}

fn remove_bvh_3d_leaf(tree: &mut Bvh3D, leaf: usize) {
    if leaf == tree.root {
        tree.root = BVH_NIL;
        return;
    }
    let parent = tree.parent[leaf];
    let grand_parent = tree.parent[parent];
    let sibling = if tree.child1[parent] == leaf { tree.child2[parent] } else { tree.child1[parent] };

    if grand_parent == BVH_NIL {
        tree.root = sibling;
        tree.parent[sibling] = BVH_NIL;
        free_bvh_3d_node(tree, parent);
        return;
    }
    if tree.child1[grand_parent] == parent {
        tree.child1[grand_parent] = sibling;
    } else {
        tree.child2[grand_parent] = sibling;
    }
    tree.parent[sibling] = grand_parent;
    free_bvh_3d_node(tree, parent);
    refit_bvh_3d_ancestors(tree, grand_parent);
}

pub(crate) fn remove_spatial_object_bvh_3d(
    tree: &mut Bvh3D,
    id: SpatialObjectId,
    guard: Option<SpatialIndexingGuard>,
) {
    let was_missing = !tree.leaf_by_object.contains_key(&id) && !tree.declined.contains_key(&id);
    remove_bvh_3d(tree, id);
    if was_missing {
        report_bvh_3d_indexing(tree, guard, id, SpatialIndexingMode::Absent, SpatialIndexingOperation::Remove, Some(SpatialIndexingReason::MissingId));
    }
}

fn report_bvh_3d_indexing(
    tree: &Bvh3D,
    guard: Option<SpatialIndexingGuard>,
    id: SpatialObjectId,
    mode: SpatialIndexingMode,
    operation: SpatialIndexingOperation,
    reason: Option<SpatialIndexingReason>,
) {
    report_spatial_indexing(guard, &SpatialIndexingNotice {
        cell_size: tree.margin,
        id, mode, operation, reason,
        would_occupy_bucket_count: 0.0,
    });
}

fn rotate_bvh_3d(tree: &mut Bvh3D, index: usize, heavy: usize) -> usize {
    let heavy_child1 = tree.child1[heavy];
    let heavy_child2 = tree.child2[heavy];
    tree.child1[heavy] = index;
    tree.parent[heavy] = tree.parent[index];
    tree.parent[index] = heavy;

    let grand_parent = tree.parent[heavy];
    if grand_parent == BVH_NIL {
        tree.root = heavy;
    } else if tree.child1[grand_parent] == index {
        tree.child1[grand_parent] = heavy;
    } else {
        tree.child2[grand_parent] = heavy;
    }

    let promote = if tree.height[heavy_child1] > tree.height[heavy_child2] { heavy_child1 } else { heavy_child2 };
    let demote = if promote == heavy_child1 { heavy_child2 } else { heavy_child1 };
    tree.child2[heavy] = promote;
    if tree.child1[index] == heavy {
        tree.child1[index] = demote;
    } else {
        tree.child2[index] = demote;
    }
    tree.parent[demote] = index;

    union_bounds(tree, index, tree.child1[index], tree.child2[index]);
    union_bounds(tree, heavy, tree.child1[heavy], tree.child2[heavy]);
    tree.height[index] = 1 + tree.height[tree.child1[index]].max(tree.height[tree.child2[index]]);
    tree.height[heavy] = 1 + tree.height[tree.child1[heavy]].max(tree.height[tree.child2[heavy]]);
    return heavy;
}

fn union_bounds(tree: &mut Bvh3D, target: usize, a: usize, b: usize) {
    tree.min_x[target] = tree.min_x[a].min(tree.min_x[b]);
    tree.min_y[target] = tree.min_y[a].min(tree.min_y[b]);
    tree.min_z[target] = tree.min_z[a].min(tree.min_z[b]);
    tree.max_x[target] = tree.max_x[a].max(tree.max_x[b]);
    tree.max_y[target] = tree.max_y[a].max(tree.max_y[b]);
    tree.max_z[target] = tree.max_z[a].max(tree.max_z[b]);
}

pub(crate) fn update_bvh_3d(
    tree: &mut Bvh3D,
    id: SpatialObjectId,
    bounds: &SpatialAabb3D,
    guard: Option<SpatialIndexingGuard>,
) -> bool {
    let was_missing = !tree.leaf_by_object.contains_key(&id) && !tree.declined.contains_key(&id);
    let inserted = insert_bvh_3d(tree, id, bounds, SpatialIndexingOperation::Update, guard);
    if was_missing {
        let explanation = explain_bvh_3d(tree, id);
        report_bvh_3d_indexing(tree, guard, id, explanation.mode, SpatialIndexingOperation::Update, Some(SpatialIndexingReason::MissingId));
    }
    return inserted;
}
