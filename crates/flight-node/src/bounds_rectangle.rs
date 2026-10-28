//! Local, parent-space and world bounds resolution for spatial 2D nodes
//! (TS `boundsRectangle.ts`).

// flight-lint: allow-file(contract-vocabulary) D16 open node trait objects are contract dispatch

use flight_geometry::{
    Matrix, Rectangle, acquire_matrix, copy_matrix, copy_rectangle, create_rectangle,
    inverse_matrix, matrix_transform_rectangle, merge_rectangle, multiply_matrix, release_matrix,
    set_empty_rectangle,
};

use crate::hierarchy::{get_node_child_count, get_node_parent, get_node_root};
use crate::node_transform2d::{
    ensure_node_world_matrix_in_root, get_node_local_matrix, get_node_world_matrix,
};
use crate::revision::invalidate_node_local_transform;
use crate::types::*;

// D1: the source's 1e-12 threshold is a double-precision cos near 90 degrees. Rotation is stored as
// an f32 angle here, whose representable error near a quarter turn is about 4e-8 rad, so an exact
// quarter turn yields |cos| ~4e-8 rather than 0. 1e-6 keeps the same "effectively singular" intent
// (a fractional-degree rotation still solves) while remaining reachable in f32.
// TS 1e-12; f32 counterpart (D1), principal-approved, listed for user review
const SINGULAR_AXIS_EPSILON: f32 = 1e-6;

/// Writes the area of `source` relative to `target_coordinate_space` (TS
/// `computeNodeBoundsRectangle`).
pub fn compute_node_bounds_rectangle(
    out: &mut Rectangle,
    source: &NodeRef,
    target_coordinate_space: Option<&NodeRef>,
) {
    let target = target_coordinate_space.unwrap_or(source);
    let mut bounds: Option<Rectangle> = None;
    if get_node_child_count(source) == 0 {
        if same_node(target, source) {
            bounds = Some(get_node_local_bounds_rectangle(source));
        } else if let Some(parent) = get_node_parent(source)
            && same_node(target, &parent)
        {
            bounds = Some(get_node_parent_bounds_rectangle(source));
        }
    }
    match bounds {
        Some(bounds) => copy_rectangle(out, &bounds),
        None => {
            let world_bounds = get_node_world_bounds_rectangle(source);
            let target_world = get_node_world_matrix(target);
            let mut transform: Matrix = acquire_matrix();
            inverse_matrix(&mut transform, &target_world);
            matrix_transform_rectangle(out, &transform, &world_bounds);
            release_matrix(transform);
        }
    }
}

/// Writes the tight bounds of `root` and its enabled descendants with the root transform cancelled
/// (TS `computeNodeRootLocalBoundsRectangle`).

pub fn compute_node_root_local_bounds_rectangle(out: &mut Rectangle, root: &NodeRef) {
    set_empty_rectangle(out);
    merge_root_local_bounds(out, root, None);
}

/// Ensures the node's own bounds are current (TS `ensureNodeLocalBoundsRectangle`).

fn ensure_node_child_world_bounds_rectangles(target: &NodeRef, root: &NodeRef) -> bool {
    let children = {
        let guard = target.read().unwrap();
        guard.node_runtime().children.clone()
    };
    let Some(children) = children else {
        return false;
    };
    let mut changed = false;
    for child in children {
        if !child.read().unwrap().node_fields().enabled {
            continue;
        }
        let previous = child
            .read()
            .unwrap()
            .as_bounds_node()
            .and_then(|bounds| bounds.bounds_runtime().world_bounds_rectangle.clone());
        ensure_node_world_bounds_rectangle_in_root(&child, root);
        let current = child
            .read()
            .unwrap()
            .as_bounds_node()
            .and_then(|bounds| bounds.bounds_runtime().world_bounds_rectangle.clone())
            .expect("child world bounds are ensured");
        let unchanged = previous
            .map(|previous| {
                previous.x == current.x
                    && previous.y == current.y
                    && previous.width == current.width
                    && previous.height == current.height
            })
            .unwrap_or(false);
        if !unchanged {
            changed = true;
        }
    }
    return changed;
}

pub fn ensure_node_local_bounds_rectangle(target: &NodeRef) {
    if !is_node_local_bounds_rectangle_valid(target) {
        recompute_local_bounds_rectangle(target);
    }
}

/// Ensures the local bounds mapped by the local transform are current (TS
/// `ensureNodeParentBoundsRectangle`).

pub fn ensure_node_parent_bounds_rectangle(target: &NodeRef) {
    let stale = {
        let guard = target.read().unwrap();
        let Some(bounds) = guard.as_bounds_node() else {
            return;
        };
        let runtime = bounds.node_runtime();
        runtime.bounds_using_local_bounds_id != runtime.local_bounds_id as i32
            || runtime.bounds_using_local_transform_id != runtime.local_transform_id as i32
    };
    if stale || !is_node_local_bounds_rectangle_valid(target) {
        recompute_node_bounds_rectangle(target);
    }
}

/// Ensures the world bounds (including children) are current (TS
/// `ensureNodeWorldBoundsRectangle`).

pub fn ensure_node_world_bounds_rectangle(target: &NodeRef) {
    let root = get_node_root(target);
    ensure_node_world_bounds_rectangle_in_root(target, &root);
}

// The subtree walk shares one resolved graph root, so each node's world-matrix resolve mints from it
// without re-walking to the root.
fn ensure_node_world_bounds_rectangle_in_root(target: &NodeRef, root: &NodeRef) {
    // TS: `!isNodeLocalBoundsRectangleValid(target, runtime) ||
    //      runtime.worldBoundsUsingLocalBoundsId !== runtime.localBoundsId`. The second term is the
    // world-bounds stamp that `invalidateNodeWorldBounds` clears; without it a translate-only fast
    // path would keep a stale aggregate after a child moves or is removed.
    let local_invalid = !is_node_local_bounds_rectangle_valid(target) || {
        let guard = target.read().unwrap();
        match guard.as_bounds_node() {
            Some(bounds) => {
                bounds.node_runtime().world_bounds_using_local_bounds_id
                    != bounds.node_runtime().local_bounds_id as i32
            }
            None => return,
        }
    };
    let has_children = get_node_child_count(target) != 0;
    let mut force_recompute = false;
    if !has_children && !local_invalid && try_fast_recompute_world_bounds_rectangle(target, root) {
        return;
    }
    if !has_children && !local_invalid {
        force_recompute = true;
    }
    ensure_node_world_matrix_in_root(target, root);
    let child_bounds_changed =
        has_children && ensure_node_child_world_bounds_rectangles(target, root);
    let stale = {
        let guard = target.read().unwrap();
        let Some(bounds) = guard.as_bounds_node() else {
            return;
        };
        bounds.node_runtime().world_bounds_using_world_transform_id
            != bounds.node_runtime().world_transform_id as i32
    };
    if force_recompute || local_invalid || child_bounds_changed || stale {
        recompute_world_bounds_rectangle(target, root);
    }
}

/// The node's height in its parent's coordinate space (TS `getNodeHeight`).

pub fn get_node_height(source: &NodeRef) -> f32 {
    let parent = get_node_parent(source);
    let mut bounds: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
    compute_node_bounds_rectangle(&mut bounds, source, parent.as_ref());
    return bounds.height;
}

/// The node's own bounds, excluding children (TS `getNodeLocalBoundsRectangle`).

pub fn get_node_local_bounds_rectangle(target: &NodeRef) -> Rectangle {
    ensure_node_local_bounds_rectangle(target);
    return target
        .read()
        .unwrap()
        .as_bounds_node()
        .expect("getNodeLocalBoundsRectangle: target has no bounds")
        .bounds_runtime()
        .local_bounds_rectangle
        .clone()
        .expect("local bounds are ensured");
}

/// The local bounds mapped by the local transform (TS `getNodeParentBoundsRectangle`).

pub fn get_node_parent_bounds_rectangle(target: &NodeRef) -> Rectangle {
    ensure_node_parent_bounds_rectangle(target);
    return target
        .read()
        .unwrap()
        .as_bounds_node()
        .expect("getNodeParentBoundsRectangle: target has no bounds")
        .bounds_runtime()
        .bounds_rectangle
        .clone()
        .expect("parent bounds are ensured");
}

/// The node's width in its parent's coordinate space (TS `getNodeWidth`).

pub fn get_node_width(source: &NodeRef) -> f32 {
    let parent = get_node_parent(source);
    let mut bounds: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
    compute_node_bounds_rectangle(&mut bounds, source, parent.as_ref());
    return bounds.width;
}

/// The node's world bounds, including enabled children (TS `getNodeWorldBoundsRectangle`).

pub fn get_node_world_bounds_rectangle(target: &NodeRef) -> Rectangle {
    ensure_node_world_bounds_rectangle(target);
    return read_node_world_bounds_rectangle(target);
}

/// Sets the node's height through its scale, declining when no finite scale can express it (TS
/// `setNodeHeight`).

fn get_node_world_matrix_in_root(target: &NodeRef, root: &NodeRef) -> Matrix {
    ensure_node_world_matrix_in_root(target, root);
    return target
        .read()
        .unwrap()
        .as_transform2d_node()
        .expect("world matrix: target is not a Transform2D node")
        .transform2d_runtime()
        .world_matrix
        .clone()
        .expect("world matrix is ensured");
}

fn is_node_local_bounds_rectangle_valid(target: &NodeRef) -> bool {
    let guard = target.read().unwrap();
    let Some(bounds) = guard.as_bounds_node() else {
        return true;
    };
    let runtime = bounds.node_runtime();
    if runtime.local_bounds_using_local_bounds_id != runtime.local_bounds_id as i32 {
        return false;
    }
    let Some(validity) = bounds
        .bounds_runtime()
        .is_local_bounds_rectangle_valid
        .clone()
    else {
        return true;
    };
    return validity(&*guard);
}

fn merge_root_local_bounds(out: &mut Rectangle, node: &NodeRef, transform: Option<&Matrix>) {
    let local_bounds = get_node_local_bounds_rectangle(node);
    let mut node_bounds: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
    match transform {
        None => copy_rectangle(&mut node_bounds, &local_bounds),
        Some(transform) => matrix_transform_rectangle(&mut node_bounds, transform, &local_bounds),
    }
    let mut merged = out.clone();
    merge_rectangle(&mut merged, out, &node_bounds);
    *out = merged;
    let children = {
        let guard = node.read().unwrap();
        guard.node_runtime().children.clone()
    };
    let Some(children) = children else {
        return;
    };
    for child in children {
        if !child.read().unwrap().node_fields().enabled {
            continue;
        }
        let child_local = get_node_local_matrix(&child);
        let mut child_transform: Matrix = acquire_matrix();
        match transform {
            None => copy_matrix(&mut child_transform, &child_local),
            Some(transform) => multiply_matrix(&mut child_transform, transform, &child_local),
        }
        merge_root_local_bounds(out, &child, Some(&child_transform));
        release_matrix(child_transform);
    }
}

fn read_node_world_bounds_rectangle(target: &NodeRef) -> Rectangle {
    return target
        .read()
        .unwrap()
        .as_bounds_node()
        .expect("getNodeWorldBoundsRectangle: target has no bounds")
        .bounds_runtime()
        .world_bounds_rectangle
        .clone()
        .expect("world bounds are ensured");
}

fn recompute_local_bounds_rectangle(target: &NodeRef) {
    let (compute, existing) = {
        let guard = target.read().unwrap();
        let bounds = guard
            .as_bounds_node()
            .expect("recomputeLocalBoundsRectangle: target has no bounds");
        (
            bounds
                .bounds_runtime()
                .compute_local_bounds_rectangle
                .clone(),
            bounds.bounds_runtime().local_bounds_rectangle.clone(),
        )
    };
    let mut rectangle = existing.unwrap_or_else(|| create_rectangle(0.0, 0.0, 0.0, 0.0));
    {
        let guard = target.read().unwrap();
        compute(&mut rectangle, &*guard);
    }
    let mut guard = target.write().unwrap();
    let bounds = guard
        .as_bounds_node_mut()
        .expect("recomputeLocalBoundsRectangle: target has no bounds");
    let local_bounds_id = bounds.node_runtime().local_bounds_id as i32;
    bounds.bounds_runtime_mut().local_bounds_rectangle = Some(rectangle);
    bounds.node_runtime_mut().local_bounds_using_local_bounds_id = local_bounds_id;
}

fn recompute_node_bounds_rectangle(target: &NodeRef) {
    let local_matrix = get_node_local_matrix(target);
    let local_bounds = get_node_local_bounds_rectangle(target);
    let mut rectangle = target
        .read()
        .unwrap()
        .as_bounds_node()
        .and_then(|bounds| bounds.bounds_runtime().bounds_rectangle.clone())
        .unwrap_or_else(|| create_rectangle(0.0, 0.0, 0.0, 0.0));
    matrix_transform_rectangle(&mut rectangle, &local_matrix, &local_bounds);
    let mut guard = target.write().unwrap();
    let bounds = guard
        .as_bounds_node_mut()
        .expect("recomputeNodeBoundsRectangle: target has no bounds");
    let local_bounds_id = bounds.node_runtime().local_bounds_id as i32;
    let local_transform_id = bounds.node_runtime().local_transform_id as i32;
    let runtime = bounds.bounds_runtime_mut();
    runtime.bounds_rectangle = Some(rectangle);
    let node_runtime = bounds.node_runtime_mut();
    node_runtime.bounds_using_local_bounds_id = local_bounds_id;
    node_runtime.bounds_using_local_transform_id = local_transform_id;
}

fn recompute_world_bounds_rectangle(target: &NodeRef, root: &NodeRef) {
    let world_matrix = get_node_world_matrix_in_root(target, root);
    let local_bounds = get_node_local_bounds_rectangle(target);
    let mut rectangle = target
        .read()
        .unwrap()
        .as_bounds_node()
        .and_then(|bounds| bounds.bounds_runtime().world_bounds_rectangle.clone())
        .unwrap_or_else(|| create_rectangle(0.0, 0.0, 0.0, 0.0));
    matrix_transform_rectangle(&mut rectangle, &world_matrix, &local_bounds);
    let children = {
        let guard = target.read().unwrap();
        guard.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for child in children {
            if !child.read().unwrap().node_fields().enabled {
                continue;
            }
            ensure_node_world_bounds_rectangle_in_root(&child, root);
            let child_bounds = read_node_world_bounds_rectangle(&child);
            if child_bounds.width != 0.0 && child_bounds.height != 0.0 {
                let mut merged = rectangle.clone();
                merge_rectangle(&mut merged, &rectangle, &child_bounds);
                rectangle = merged;
            }
        }
    }
    let mut guard = target.write().unwrap();
    let bounds = guard
        .as_bounds_node_mut()
        .expect("recomputeWorldBoundsRectangle: target has no bounds");
    let world_transform_id = bounds.node_runtime().world_transform_id as i32;
    let local_bounds_id = bounds.node_runtime().local_bounds_id as i32;
    bounds.bounds_runtime_mut().world_bounds_rectangle = Some(rectangle);
    let node_runtime = bounds.node_runtime_mut();
    node_runtime.world_bounds_using_world_transform_id = world_transform_id;
    node_runtime.world_bounds_using_local_bounds_id = local_bounds_id;
}

fn same_node(a: &NodeRef, b: &NodeRef) -> bool {
    return std::sync::Arc::ptr_eq(a, b);
}

pub fn set_node_height(target: &NodeRef, value: f32) {
    let scale_y = {
        let guard = target.read().unwrap();
        let Some(node) = guard.as_transform2d_node() else {
            return;
        };
        *node.transform2d().scale_y
    };
    if scale_y == 0.0 {
        return;
    }
    let bounds = get_node_local_bounds_rectangle(target);
    let matrix = get_node_local_matrix(target);
    let scale_y_factor = (matrix.d / scale_y).abs();
    let local_height = bounds.height.abs();
    if scale_y_factor <= SINGULAR_AXIS_EPSILON || local_height == 0.0 {
        return;
    }
    let fixed_x_term = matrix.b.abs() * bounds.width.abs();
    let adjustable_height = value - fixed_x_term;
    if adjustable_height < 0.0 {
        return;
    }
    {
        let mut guard = target.write().unwrap();
        let node = guard
            .as_transform2d_node_mut()
            .expect("setNodeHeight: target is not a Transform2D node");
        *node.transform2d_mut().scale_y =
            sign_of(scale_y) * (adjustable_height / (scale_y_factor * local_height));
    }
    invalidate_node_local_transform(target);
}

/// Sets the node's width through its scale, declining when no finite scale can express it (TS
/// `setNodeWidth`).

pub fn set_node_width(target: &NodeRef, value: f32) {
    let scale_x = {
        let guard = target.read().unwrap();
        let Some(node) = guard.as_transform2d_node() else {
            return;
        };
        *node.transform2d().scale_x
    };
    if scale_x == 0.0 {
        return;
    }
    let bounds = get_node_local_bounds_rectangle(target);
    let matrix = get_node_local_matrix(target);
    let scale_x_factor = (matrix.a / scale_x).abs();
    let local_width = bounds.width.abs();
    if scale_x_factor <= SINGULAR_AXIS_EPSILON || local_width == 0.0 {
        return;
    }
    let fixed_y_term = matrix.c.abs() * bounds.height.abs();
    let adjustable_width = value - fixed_y_term;
    if adjustable_width < 0.0 {
        return;
    }
    {
        let mut guard = target.write().unwrap();
        let node = guard
            .as_transform2d_node_mut()
            .expect("setNodeWidth: target is not a Transform2D node");
        *node.transform2d_mut().scale_x =
            sign_of(scale_x) * (adjustable_width / (scale_x_factor * local_width));
    }
    invalidate_node_local_transform(target);
}

fn sign_of(value: f32) -> f32 {
    return if value < 0.0 { -1.0 } else { 1.0 };
}

// The translate-only shortcut is valid only while the cached world bounds were derived from the cached
// world matrix (the stamp matches). A stamp cleared by a reparent, or a world matrix re-resolved by
// another query since the bounds were derived, falls through to a full recompute.
fn try_fast_recompute_world_bounds_rectangle(target: &NodeRef, root: &NodeRef) -> bool {
    let previous = {
        let guard = target.read().unwrap();
        let runtime = guard.node_runtime();
        if runtime.world_bounds_using_world_transform_id != runtime.world_transform_id as i32 {
            return false;
        }
        let Some(bounds) = guard.as_bounds_node() else {
            return false;
        };
        let Some(node) = guard.as_transform2d_node() else {
            return false;
        };
        match (
            bounds.bounds_runtime().world_bounds_rectangle.clone(),
            node.transform2d_runtime().world_matrix.clone(),
        ) {
            (Some(rectangle), Some(matrix)) => Some((rectangle, matrix)),
            _ => None,
        }
    };
    let Some((mut rectangle, previous_matrix)) = previous else {
        return false;
    };
    ensure_node_world_matrix_in_root(target, root);
    let current_matrix = target
        .read()
        .unwrap()
        .as_transform2d_node()
        .expect("fast world bounds: target is not a Transform2D node")
        .transform2d_runtime()
        .world_matrix
        .clone()
        .expect("world matrix is ensured");
    if current_matrix.a == previous_matrix.a
        && current_matrix.b == previous_matrix.b
        && current_matrix.c == previous_matrix.c
        && current_matrix.d == previous_matrix.d
    {
        if current_matrix.tx != previous_matrix.tx || current_matrix.ty != previous_matrix.ty {
            rectangle.x += current_matrix.tx - previous_matrix.tx;
            rectangle.y += current_matrix.ty - previous_matrix.ty;
            target
                .write()
                .unwrap()
                .as_bounds_node_mut()
                .expect("fast world bounds: target has no bounds")
                .bounds_runtime_mut()
                .world_bounds_rectangle = Some(rectangle);
        }
        let mut guard = target.write().unwrap();
        let runtime = guard.node_runtime_mut();
        runtime.world_bounds_using_world_transform_id = runtime.world_transform_id as i32;
        return true;
    }
    return false;
}
