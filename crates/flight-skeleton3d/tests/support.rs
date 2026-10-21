use flight_entity::allocate_entity;
use flight_geometry::create_matrix4;
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, MeshGeometry, MeshGeometryOptions, create_mesh_geometry,
};
use flight_scene3d::Skeleton3D;
pub fn close(a: f32, b: f32) {
    assert!((a - b).abs() < 0.00001, "{a} != {b}");
}
pub fn geometry(
    position: [f32; 3],
    normal: [f32; 3],
    joint: [f32; 4],
    weight: [f32; 4],
    tangent: [f32; 4],
) -> MeshGeometry {
    let mut vertices = vec![0.0; 20].into_boxed_slice();
    vertices[..3].copy_from_slice(&position);
    vertices[3..6].copy_from_slice(&normal);
    vertices[6..10].copy_from_slice(&tangent);
    vertices[12..16].copy_from_slice(&joint);
    vertices[16..20].copy_from_slice(&weight);
    return create_mesh_geometry(MeshGeometryOptions {
        vertices,
        layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone(),
        indices: None,
        subsets: None,
        topology: None,
    });
}
pub fn palette_skeleton(palette: Vec<f32>) -> Skeleton3D {
    let mut out: Skeleton3D = allocate_entity();
    out.inverse_bind_matrices = std::sync::Arc::new(std::sync::RwLock::new(
        vec![0.0; palette.len()].into_boxed_slice(),
    ));
    out.joint_matrices = std::sync::Arc::new(std::sync::RwLock::new(palette.into_boxed_slice()));
    out.normal_matrices = std::sync::Arc::new(std::sync::RwLock::new(Box::new([])));
    out.joints = std::sync::Arc::new(std::sync::RwLock::new(Vec::new()));
    out.names = None;
    return out;
}
pub fn translation(x: f32, y: f32, z: f32) -> Vec<f32> {
    let mut m = create_matrix4();
    m.m[12] = x;
    m.m[13] = y;
    m.m[14] = z;
    return m.m.to_vec();
}
pub fn revisions() -> flight_node::contract::NodeRevisionState {
    return flight_node::contract::NodeRevisionState {
        world_transform_revision: 0,
    };
}
pub fn guards() -> flight_skeleton3d::Skeleton3DGuardStateRef {
    return std::sync::Arc::new(std::sync::RwLock::new(
        flight_skeleton3d::Skeleton3DGuardState {
            enabled: false,
            bind_pose_guard: None,
        },
    ));
}
pub fn joint(x: f32, y: f32, z: f32) -> flight_entity::Ref<flight_scene3d::Node3DFields> {
    let mut node: flight_scene3d::Node3DFields = flight_scene3d::create_node3d(None, None);
    node.position = flight_geometry::create_vector3(x, y, z);
    let node = flight_scene3d::publish_node3d(node);
    let erased: flight_node::NodeRef = node.clone();
    flight_node::invalidate_node_local_transform(&erased);
    return node;
}
pub fn skeleton(joints: Vec<flight_scene3d::Node3DRef>, names: Option<Vec<String>>) -> Skeleton3D {
    return flight_skeleton3d::create_skeleton3d(
        std::sync::Arc::new(std::sync::RwLock::new(joints)),
        None,
        names,
        &mut revisions(),
        &guards(),
    );
}
pub fn skinned_mesh() -> flight_entity::Ref<flight_scene3d::Mesh> {
    return flight_scene3d::create_mesh(
        std::sync::Arc::new(std::sync::RwLock::new(geometry(
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0; 4],
            [1.0, 0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0, -1.0],
        ))),
        std::sync::Arc::new(std::sync::RwLock::new(Vec::new())),
        None,
        None,
    );
}
pub fn bind(mesh: &flight_entity::Ref<flight_scene3d::Mesh>, node: flight_scene3d::Node3DRef) {
    mesh.write().unwrap().skin = Some(std::sync::Arc::new(std::sync::RwLock::new(
        flight_scene3d::Skin {
            skeleton: std::sync::Arc::new(std::sync::RwLock::new(skeleton(vec![node], None))),
            skeleton_root: None,
        },
    )));
}
