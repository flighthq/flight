//! 2D local/world transform resolution (TS `nodeTransform2d.ts`).

// flight-lint: allow-file(contract-vocabulary, conform-params) D16 open node trait objects are contract dispatch; D5 caller-owned revision state replaces the TS module-level counter

use flight_geometry::contract::{
    Matrix, Transform2D, Vector2, copy_matrix, create_matrix, decompose_matrix_to_transform2d,
    inverse_matrix_transform_point_xy, matrix_transform_point_xy, multiply_matrix,
};
use flight_math::DEG_TO_RAD;

use crate::revision::{
    NodeRevisionState, compute_node_world_transform_revision, invalidate_node_local_transform,
};
use crate::types::*;

/// Converts a global point to the node's local coordinates (TS `convertNodeVector2GlobalToLocal`).
pub fn convert_node_vector2_global_to_local(
    out: &mut Vector2,
    source: &NodeRef,
    vector: &Vector2,
    revisions: &mut NodeRevisionState,
) {
    let matrix = get_node_world_matrix(source, revisions);
    inverse_matrix_transform_point_xy(out, &matrix, vector.x, vector.y);
}

/// Converts a local point to global coordinates (TS `convertNodeVector2LocalToGlobal`).
pub fn convert_node_vector2_local_to_global(
    out: &mut Vector2,
    source: &NodeRef,
    vector: &Vector2,
    revisions: &mut NodeRevisionState,
) {
    let matrix = get_node_world_matrix(source, revisions);
    matrix_transform_point_xy(out, &matrix, vector.x, vector.y);
}

/// Ensures the node's cached local matrix is current (TS `ensureNodeLocalMatrix`).
pub fn ensure_node_local_matrix(target: &NodeRef) {
    let mut guard = target.write().unwrap();
    let node = guard
        .as_transform2d_node_mut()
        .expect("ensureNodeLocalMatrix: target is not a Transform2D node");
    ensure_node_local_matrix_internal(node);
}

fn ensure_node_local_matrix_internal(node: &mut dyn Transform2DNode) {
    let local_transform_id = node.node_runtime().local_transform_id as i32;
    if node.node_runtime().local_transform_using_local_transform_id != local_transform_id {
        recompute_local_matrix(node);
    }
}

/// Ensures the node's cached world matrix is current (TS `ensureNodeWorldMatrix`).
pub fn ensure_node_world_matrix(target: &NodeRef, revisions: &mut NodeRevisionState) {
    let parent = node_parent(target);
    let mut parent_guard = None;
    let parent_world_transform_id = if let Some(parent) = &parent {
        ensure_node_world_matrix(parent, revisions);
        let guard = parent.read().unwrap();
        let id = guard.node_runtime().world_transform_id as i32;
        parent_guard = Some(guard);
        id
    } else {
        0
    };
    let mut guard = target.write().unwrap();
    let node = guard
        .as_transform2d_node_mut()
        .expect("ensureNodeWorldMatrix: target is not a Transform2D node");
    ensure_node_local_matrix_internal(node);
    let local_transform_id = node.node_runtime().local_transform_id as i32;
    let stale = node.node_runtime().world_transform_using_local_transform_id != local_transform_id
        || node
            .node_runtime()
            .world_transform_using_parent_transform_id
            != parent_world_transform_id;
    if stale {
        if node.transform2d_runtime().world_matrix.is_none() {
            node.transform2d_runtime_mut().world_matrix =
                Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        }
        let local_matrix = node
            .transform2d_runtime()
            .local_matrix
            .clone()
            .expect("local matrix is ensured");
        let parent_matrix = parent_guard.as_ref().map(|guard| {
            guard
                .as_transform2d_node()
                .expect("ensureNodeWorldMatrix: parent is not a Transform2D node")
                .transform2d_runtime()
                .world_matrix
                .clone()
                .expect("parent world matrix is ensured")
        });
        {
            let world_matrix = node
                .transform2d_runtime_mut()
                .world_matrix
                .as_mut()
                .expect("world matrix is allocated");
            match &parent_matrix {
                Some(parent_matrix) => multiply_matrix(world_matrix, parent_matrix, &local_matrix),
                None => copy_matrix(world_matrix, &local_matrix),
            }
        }
        let parent_dyn: Option<&dyn Node> = parent_guard.as_ref().map(|guard| &**guard);
        let base: &mut dyn Node = node;
        compute_node_world_transform_revision(base, parent_dyn, revisions);
    }
}

/// Reads the node's local matrix, resolving it first (TS `getNodeLocalMatrix`).
pub fn get_node_local_matrix(target: &NodeRef) -> Matrix {
    ensure_node_local_matrix(target);
    return target
        .read()
        .unwrap()
        .as_transform2d_node()
        .expect("getNodeLocalMatrix: target is not a Transform2D node")
        .transform2d_runtime()
        .local_matrix
        .clone()
        .expect("local matrix is ensured");
}

/// Reads the node's decomposed local transform into `out` (TS `getNodeTransform2D`).
pub fn get_node_transform2d(out: &mut Transform2D, source: &NodeRef) {
    let guard = source.read().unwrap();
    let transform = guard
        .as_transform2d_node()
        .expect("getNodeTransform2D: source is not a Transform2D node")
        .transform2d();
    out.pivot_x = *transform.pivot_x;
    out.pivot_y = *transform.pivot_y;
    out.rotation = *transform.rotation;
    out.scale_x = *transform.scale_x;
    out.scale_y = *transform.scale_y;
    out.skew_x = *transform.skew_x;
    out.skew_y = *transform.skew_y;
    out.x = *transform.x;
    out.y = *transform.y;
}

/// Reads the node's world matrix, resolving it first (TS `getNodeWorldMatrix`).
pub fn get_node_world_matrix(target: &NodeRef, revisions: &mut NodeRevisionState) -> Matrix {
    ensure_node_world_matrix(target, revisions);
    return target
        .read()
        .unwrap()
        .as_transform2d_node()
        .expect("getNodeWorldMatrix: target is not a Transform2D node")
        .transform2d_runtime()
        .world_matrix
        .clone()
        .expect("world matrix is ensured");
}

fn node_parent(target: &NodeRef) -> Option<NodeRef> {
    return target
        .read()
        .unwrap()
        .node_runtime()
        .parent
        .clone()
        .and_then(|parent| parent.upgrade());
}

fn recompute_local_matrix(node: &mut dyn Transform2DNode) {
    let transform = node.transform2d().to_owned();
    let runtime = node.transform2d_runtime_mut();
    if transform.rotation != runtime.rotation_angle {
        let mut angle = transform.rotation % 360.0;
        if angle > 180.0 {
            angle -= 360.0;
        } else if angle < -180.0 {
            angle += 360.0;
        }
        let radians = angle * DEG_TO_RAD;
        runtime.rotation_angle = angle;
        runtime.rotation_sine = radians.sin();
        runtime.rotation_cosine = radians.cos();
    }
    if runtime.local_matrix.is_none() {
        runtime.local_matrix = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
    }
    let matrix = runtime
        .local_matrix
        .as_mut()
        .expect("local matrix is allocated");
    if transform.skew_x == 0.0 && transform.skew_y == 0.0 {
        matrix.a = runtime.rotation_cosine * transform.scale_x;
        matrix.b = runtime.rotation_sine * transform.scale_x;
        matrix.c = -runtime.rotation_sine * transform.scale_y;
        matrix.d = runtime.rotation_cosine * transform.scale_y;
    } else {
        let radians_y = (runtime.rotation_angle + transform.skew_y) * DEG_TO_RAD;
        let radians_x = (runtime.rotation_angle + transform.skew_x) * DEG_TO_RAD;
        matrix.a = radians_y.cos() * transform.scale_x;
        matrix.b = radians_y.sin() * transform.scale_x;
        matrix.c = -radians_x.sin() * transform.scale_y;
        matrix.d = radians_x.cos() * transform.scale_y;
    }
    matrix.tx = transform.x - (matrix.a * transform.pivot_x + matrix.c * transform.pivot_y);
    matrix.ty = transform.y - (matrix.b * transform.pivot_x + matrix.d * transform.pivot_y);
    let local_transform_id = node.node_runtime().local_transform_id as i32;
    node.node_runtime_mut()
        .local_transform_using_local_transform_id = local_transform_id;
}

/// Sets the node's local transform from a matrix, decomposing it (TS `setNodeLocalMatrix`).
pub fn set_node_local_matrix(target: &NodeRef, source: &Matrix) {
    let mut decomposed: Transform2D =
        flight_geometry::contract::create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
    decompose_matrix_to_transform2d(&mut decomposed, source);
    let mut guard = target.write().unwrap();
    let transform = guard
        .as_transform2d_node_mut()
        .expect("setNodeLocalMatrix: target is not a Transform2D node")
        .transform2d_mut();
    *transform.pivot_x = 0.0;
    *transform.pivot_y = 0.0;
    *transform.rotation = decomposed.rotation;
    *transform.scale_x = decomposed.scale_x;
    *transform.scale_y = decomposed.scale_y;
    *transform.skew_x = decomposed.skew_x;
    *transform.skew_y = decomposed.skew_y;
    *transform.x = decomposed.x;
    *transform.y = decomposed.y;
    drop(guard);
    invalidate_node_local_transform(target);
}

/// Sets the node's local transform from a decomposed carrier (TS `setNodeTransform2D`).
pub fn set_node_transform2d(target: &NodeRef, source: &Transform2D) {
    let mut guard = target.write().unwrap();
    let transform = guard
        .as_transform2d_node_mut()
        .expect("setNodeTransform2D: target is not a Transform2D node")
        .transform2d_mut();
    *transform.pivot_x = source.pivot_x;
    *transform.pivot_y = source.pivot_y;
    *transform.rotation = source.rotation;
    *transform.scale_x = source.scale_x;
    *transform.scale_y = source.scale_y;
    *transform.skew_x = source.skew_x;
    *transform.skew_y = source.skew_y;
    *transform.x = source.x;
    *transform.y = source.y;
    drop(guard);
    invalidate_node_local_transform(target);
}
