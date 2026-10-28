//! 3D local/world transform resolution (TS `nodeTransform3d.ts`).

// flight-lint: allow-file(contract-vocabulary) D16 open node trait objects are contract dispatch

use flight_geometry::{
    Matrix4, Transform3D, Vector3, acquire_matrix4, compose_matrix4, copy_matrix4, copy_vector3,
    create_matrix4, decompose_matrix4, inverse_matrix4, matrix4_transform_point, multiply_matrix4,
    release_matrix4,
};

use crate::hierarchy::get_node_root;
use crate::revision::{compute_node_world_transform_revision, invalidate_node_local_transform};
use crate::types::*;

/// Converts a global point to the node's local coordinates (TS `convertNodeVector3GlobalToLocal`).
pub fn convert_node_vector3_global_to_local(out: &mut Vector3, source: &NodeRef, point: &Vector3) {
    let mut inverse = acquire_matrix4();
    inverse_matrix4(&mut inverse, &get_node_world_matrix4(source));
    matrix4_transform_point(out, &inverse, point);
    release_matrix4(inverse);
}

/// Converts a local point to global coordinates (TS `convertNodeVector3LocalToGlobal`).
pub fn convert_node_vector3_local_to_global(out: &mut Vector3, source: &NodeRef, point: &Vector3) {
    matrix4_transform_point(out, &get_node_world_matrix4(source), point);
}

/// Ensures the node's cached local matrix 4 is current (TS `ensureNodeLocalMatrix4`).
pub fn ensure_node_local_matrix4(target: &NodeRef) {
    let mut guard = target.write().unwrap();
    let node = guard
        .as_transform3d_node_mut()
        .expect("ensureNodeLocalMatrix4: target is not a Transform3D node");
    ensure_node_local_matrix4_internal(node);
}

fn ensure_node_local_matrix4_internal(node: &mut dyn Transform3DNode) {
    let local_transform_id = node.node_runtime().local_transform_id as i32;
    if node.transform3d_runtime().local_matrix4.is_none()
        || node.node_runtime().local_transform_using_local_transform_id != local_transform_id
    {
        recompute_local_matrix4(node);
    }
}

/// Ensures the node's cached world matrix 4 is current (TS `ensureNodeWorldMatrix4`).
pub fn ensure_node_world_matrix4(target: &NodeRef) {
    let root = get_node_root(target);
    ensure_node_world_matrix4_in_root(target, &root);
}

/// Resolves the ancestor chain against an already-resolved graph `root`, so every recompute along
/// the chain mints from that root's counter without re-walking to the root per node.
pub(crate) fn ensure_node_world_matrix4_in_root(target: &NodeRef, root: &NodeRef) {
    let parent = node_parent(target);
    let mut parent_guard = None;
    let parent_world_transform_id = if let Some(parent) = &parent {
        ensure_node_world_matrix4_in_root(parent, root);
        let guard = parent.read().unwrap();
        let id = guard.node_runtime().world_transform_id as i32;
        parent_guard = Some(guard);
        id
    } else {
        0
    };
    let mut guard = target.write().unwrap();
    let node = guard
        .as_transform3d_node_mut()
        .expect("ensureNodeWorldMatrix4: target is not a Transform3D node");
    ensure_node_local_matrix4_internal(node);
    let local_transform_id = node.node_runtime().local_transform_id as i32;
    let stale = node.node_runtime().world_transform_using_local_transform_id != local_transform_id
        || node
            .node_runtime()
            .world_transform_using_parent_transform_id
            != parent_world_transform_id;
    if stale {
        if node.transform3d_runtime().world_matrix4.is_none() {
            node.transform3d_runtime_mut().world_matrix4 = Some(create_matrix4());
        }
        let local_matrix = node
            .transform3d_runtime()
            .local_matrix4
            .clone()
            .expect("local matrix 4 is ensured");
        let parent_matrix = parent_guard.as_ref().map(|guard| {
            guard
                .as_transform3d_node()
                .expect("ensureNodeWorldMatrix4: parent is not a Transform3D node")
                .transform3d_runtime()
                .world_matrix4
                .clone()
                .expect("parent world matrix 4 is ensured")
        });
        {
            let world_matrix = node
                .transform3d_runtime_mut()
                .world_matrix4
                .as_mut()
                .expect("world matrix 4 is allocated");
            match &parent_matrix {
                Some(parent_matrix) => multiply_matrix4(world_matrix, parent_matrix, &local_matrix),
                None => copy_matrix4(world_matrix, &local_matrix),
            }
        }
        // The root may be the parent, so its read guard is released before the root lends its counter.
        drop(parent_guard);
        let base: &mut dyn Node = node;
        if parent.is_some() {
            let mut root_guard = root.write().unwrap();
            compute_node_world_transform_revision(
                base,
                Some(parent_world_transform_id as u32),
                Some(root_guard.node_runtime_mut()),
            );
        } else {
            compute_node_world_transform_revision(base, None, None);
        }
    }
}

/// Reads the node's local matrix 4, resolving it first (TS `getNodeLocalMatrix4`).
pub fn get_node_local_matrix4(target: &NodeRef) -> Matrix4 {
    ensure_node_local_matrix4(target);
    return target
        .read()
        .unwrap()
        .as_transform3d_node()
        .expect("getNodeLocalMatrix4: target is not a Transform3D node")
        .transform3d_runtime()
        .local_matrix4
        .clone()
        .expect("local matrix 4 is ensured");
}

/// Reads the node's decomposed local transform into `out` (TS `getNodeTransform3D`).
pub fn get_node_transform3d(out: &mut Transform3D, source: &NodeRef) {
    let guard = source.read().unwrap();
    let transform = guard
        .as_transform3d_node()
        .expect("getNodeTransform3D: source is not a Transform3D node")
        .transform3d();
    copy_vector3(&mut out.position, transform.position);
    flight_geometry::copy_quaternion(&mut out.rotation, transform.rotation);
    copy_vector3(&mut out.scale, transform.scale);
}

/// Reads the node's world matrix 4, resolving it first (TS `getNodeWorldMatrix4`).
pub fn get_node_world_matrix4(target: &NodeRef) -> Matrix4 {
    ensure_node_world_matrix4(target);
    return target
        .read()
        .unwrap()
        .as_transform3d_node()
        .expect("getNodeWorldMatrix4: target is not a Transform3D node")
        .transform3d_runtime()
        .world_matrix4
        .clone()
        .expect("world matrix 4 is ensured");
}

/// True when the local matrix 4 was set directly (TS `isNodeLocalMatrix4Detached`).
pub fn is_node_local_matrix4_detached(target: &NodeRef) -> bool {
    ensure_node_local_matrix4(target);
    return target
        .read()
        .unwrap()
        .as_transform3d_node()
        .expect("isNodeLocalMatrix4Detached: target is not a Transform3D node")
        .transform3d_runtime()
        .local_matrix4_detached;
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

fn recompute_local_matrix4(node: &mut dyn Transform3DNode) {
    if node.transform3d_runtime().local_matrix4.is_none() {
        node.transform3d_runtime_mut().local_matrix4 = Some(create_matrix4());
    }
    let transform = node.transform3d().to_owned();
    let mut matrix = node
        .transform3d_runtime()
        .local_matrix4
        .clone()
        .expect("local matrix 4 is allocated");
    compose_matrix4(
        &mut matrix,
        &transform.position,
        &transform.rotation,
        &transform.scale,
    );
    let runtime = node.transform3d_runtime_mut();
    runtime.local_matrix4 = Some(matrix);
    runtime.local_matrix4_detached = false;
    let local_transform_id = node.node_runtime().local_transform_id as i32;
    node.node_runtime_mut()
        .local_transform_using_local_transform_id = local_transform_id;
}

/// Sets the node's local matrix 4 directly, bypassing TRS (TS `setNodeLocalMatrix4`).
pub fn set_node_local_matrix4(target: &NodeRef, source: &Matrix4) {
    let mut guard = target.write().unwrap();
    let node = guard
        .as_transform3d_node_mut()
        .expect("setNodeLocalMatrix4: target is not a Transform3D node");
    if node.transform3d_runtime().local_matrix4.is_none() {
        node.transform3d_runtime_mut().local_matrix4 = Some(create_matrix4());
    }
    {
        let matrix = node
            .transform3d_runtime_mut()
            .local_matrix4
            .as_mut()
            .expect("local matrix 4 is allocated");
        copy_matrix4(matrix, source);
    }
    drop(guard);
    invalidate_node_local_transform(target);
    let mut guard = target.write().unwrap();
    let node = guard
        .as_transform3d_node_mut()
        .expect("setNodeLocalMatrix4: target is not a Transform3D node");
    let local_transform_id = node.node_runtime().local_transform_id as i32;
    node.node_runtime_mut()
        .local_transform_using_local_transform_id = local_transform_id;
    node.transform3d_runtime_mut().local_matrix4_detached = true;
}

/// Sets the node's local transform from a decomposed carrier (TS `setNodeTransform3D`).
pub fn set_node_transform3d(target: &NodeRef, source: &Transform3D) {
    {
        let mut guard = target.write().unwrap();
        let transform = guard
            .as_transform3d_node_mut()
            .expect("setNodeTransform3D: target is not a Transform3D node")
            .transform3d_mut();
        copy_vector3(transform.position, &source.position);
        flight_geometry::copy_quaternion(transform.rotation, &source.rotation);
        copy_vector3(transform.scale, &source.scale);
    }
    invalidate_node_local_transform(target);
}

/// Reattaches TRS authoring to a directly-set matrix 4 (TS `syncNodeTransform3DFromMatrix4`).
pub fn sync_node_transform3d_from_matrix4(target: &NodeRef) {
    ensure_node_local_matrix4(target);
    let mut guard = target.write().unwrap();
    let node = guard
        .as_transform3d_node_mut()
        .expect("syncNodeTransform3DFromMatrix4: target is not a Transform3D node");
    let matrix = node
        .transform3d_runtime()
        .local_matrix4
        .clone()
        .expect("local matrix 4 is ensured");
    let mut position: Vector3 = flight_geometry::create_vector3(0.0, 0.0, 0.0);
    let mut rotation: flight_geometry::Quaternion =
        flight_geometry::create_quaternion(0.0, 0.0, 0.0, 1.0);
    let mut scale: Vector3 = flight_geometry::create_vector3(1.0, 1.0, 1.0);
    decompose_matrix4(&mut position, &mut rotation, &mut scale, &matrix);
    let transform = node.transform3d_mut();
    *transform.position = position;
    *transform.rotation = rotation;
    *transform.scale = scale;
    drop(transform);
    node.transform3d_runtime_mut().local_matrix4_detached = false;
}
