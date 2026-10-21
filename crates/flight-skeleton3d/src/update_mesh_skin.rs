use crate::{
    capture_mesh_skin_bind_pose, compute_skeleton3d_joint_matrices, skin_mesh_geometry,
    update_mesh_skin_bind_pose_deform_input,
};
use flight_entity::Ref;
use flight_meshgeometry::{
    MeshGeometry, MeshMorph, MeshSkinBindPose, get_mesh_geometry_skin_bind_pose,
    set_mesh_geometry_skin_bind_pose,
};
use flight_node::contract::NodeRevisionState;
use flight_node::{Node, NodeRef};
use flight_scene3d::{Mesh, NODE3D_TRAITS_KEY, Node3DNarrow, Skin};
use std::sync::{Arc, RwLock};

pub(crate) struct MeshInputs {
    pub geometry: Ref<MeshGeometry>,
    pub skin: Option<Ref<Skin>>,
    pub morph: Option<Ref<MeshMorph>>,
}
pub(crate) fn cached_bind_pose(geometry: &mut MeshGeometry) -> Ref<MeshSkinBindPose> {
    if let Some(pose) = get_mesh_geometry_skin_bind_pose(geometry) {
        return pose.clone();
    }
    let pose = Arc::new(RwLock::new(capture_mesh_skin_bind_pose(geometry)));
    set_mesh_geometry_skin_bind_pose(geometry, Some(pose.clone()));
    return pose;
}

pub(crate) fn mesh_inputs(node: &NodeRef) -> Option<MeshInputs> {
    let node = node.read().unwrap();
    let traits = node.node_runtime().traits.as_ref()?;
    if !Arc::ptr_eq(&traits.key, &NODE3D_TRAITS_KEY) {
        return None;
    }
    let narrow = traits.narrow.downcast_ref::<Node3DNarrow>()?;
    let mesh = (narrow.as_node3d)(&*node)?.as_mesh()?;
    return Some(MeshInputs {
        geometry: mesh.geometry.clone(),
        skin: mesh.skin.clone(),
        morph: mesh.morph.clone(),
    });
}

pub(crate) fn mesh_mut(node: &mut dyn Node) -> Option<&mut Mesh> {
    let traits = node.node_runtime().traits.as_ref()?;
    if !Arc::ptr_eq(&traits.key, &NODE3D_TRAITS_KEY) {
        return None;
    }
    let narrow = traits.narrow.downcast_ref::<Node3DNarrow>()?.as_node3d_mut;
    return narrow(node)?.as_mesh_mut();
}

pub(crate) fn mesh_ref(node: &dyn Node) -> Option<&Mesh> {
    let traits = node.node_runtime().traits.as_ref()?;
    if !Arc::ptr_eq(&traits.key, &NODE3D_TRAITS_KEY) {
        return None;
    }
    let narrow = traits.narrow.downcast_ref::<Node3DNarrow>()?;
    return (narrow.as_node3d)(node)?.as_mesh();
}

// flight-lint: allow(conform-params) D5 caller-owned canonical transform revisions; D16 native NodeRef preserves the original open Mesh allocation and releases node guards before palette resolution
pub fn update_mesh_skin(mesh: &NodeRef, revisions: &mut NodeRevisionState) {
    let Some(input) = mesh_inputs(mesh) else {
        return;
    };
    let Some(skin) = input.skin else {
        return;
    };
    let skeleton = skin.read().unwrap().skeleton.clone();
    compute_skeleton3d_joint_matrices(&mut skeleton.write().unwrap(), revisions);
    let mut geometry = input.geometry.write().unwrap();
    let existing = get_mesh_geometry_skin_bind_pose(&geometry).is_some();
    let bind_pose = cached_bind_pose(&mut geometry);
    let mut bind_pose = bind_pose.write().unwrap();
    if existing && input.morph.is_some() {
        update_mesh_skin_bind_pose_deform_input(&mut bind_pose, &geometry);
    }
    skin_mesh_geometry(&mut geometry, &skeleton.read().unwrap(), &mut bind_pose);
}
