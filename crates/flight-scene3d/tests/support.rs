use flight_entity::Ref;
use flight_geometry::{Aabb, Matrix4, create_aabb, create_matrix4};
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_node::contract::{Node, NodeRef, NodeRevisionState};
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};

pub fn as_node_ref<T: Node>(node: &Ref<T>) -> NodeRef {
    return node.clone();
}
pub fn close(actual: f32, expected: f32) {
    assert!((actual - expected).abs() < 0.0001, "{actual} != {expected}");
}
pub fn empty_bounds() -> Aabb {
    return create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
}
pub fn empty_document() -> Scene3DDocument {
    return Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: Vec::new(),
        skins: Vec::new(),
    };
}
pub fn empty_materials() -> MeshMaterials {
    return Arc::new(RwLock::new(Vec::new()));
}
pub fn node3d() -> Ref<Node3DFields> {
    return Arc::new(RwLock::new(create_node3d(None, None)));
}
pub fn revision_state() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}
pub fn test_geometry() -> Ref<MeshGeometry> {
    return Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None)));
}
pub fn test_mesh() -> Ref<Mesh> {
    return create_mesh(test_geometry(), empty_materials(), None, None);
}
pub fn translation(x: f32, y: f32, z: f32) -> Matrix4 {
    let mut m = create_matrix4();
    m.m[12] = x;
    m.m[13] = y;
    m.m[14] = z;
    return m;
}
pub fn test_skin() -> Ref<Skin> {
    let mut skeleton: Skeleton3D = flight_entity::allocate_entity();
    skeleton.inverse_bind_matrices = Box::new([]);
    skeleton.joint_matrices = Box::new([]);
    skeleton.normal_matrices = Box::new([]);
    skeleton.joints = Vec::new();
    skeleton.names = None;
    return Arc::new(RwLock::new(Skin {
        skeleton: Arc::new(RwLock::new(skeleton)),
        skeleton_root: None,
    }));
}
pub fn test_morph(weights: Vec<f32>) -> Ref<flight_meshgeometry::MeshMorph> {
    return Arc::new(RwLock::new(flight_meshgeometry::MeshMorph {
        targets: Arc::new(Vec::new()),
        weights: weights.into_boxed_slice(),
    }));
}
