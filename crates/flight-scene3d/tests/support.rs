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
pub fn document_node(name: Option<&str>) -> Scene3DDocumentNode {
    return Scene3DDocumentNode {
        children: Vec::new(),
        kind: NODE3D_KIND.to_string(),
        mesh: None,
        name: name.map(str::to_string),
        transform: flight_geometry::create_transform3d(),
    };
}
pub fn test_track() -> Ref<flight_animation::AnimationTrack> {
    return Arc::new(RwLock::new(flight_animation::create_animation_track(
        flight_animation::CreateAnimationTrackOpts {
            components: Some(3),
            times: vec![0.0, 1.0],
            values: vec![0.0, 0.0, 0.0, 1.0, 2.0, 3.0],
            interpolation: None,
            quaternion: None,
            easing: None,
            segment_easings: None,
        },
    )));
}
pub fn camera_looking_from(x: f32, y: f32, z: f32) -> flight_camera::Camera3D {
    use flight_camera::contract::*;
    let mut camera = create_camera_3d(&Camera3DOptions {
        far: 100.0,
        near: 0.1,
        near_clip_plane: None,
        projection: Projection::Perspective(create_perspective_projection(
            &PerspectiveProjectionOptions {
                aspect: Some(1.0),
                fov_y: 1.0,
            },
        )),
    });
    set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &flight_geometry::create_vector3(x, y, z),
        &flight_geometry::create_vector3(0.0, 0.0, 0.0),
        &flight_geometry::create_vector3(0.0, 1.0, 0.0),
    );
    return camera;
}
pub fn guard_state() -> Scene3DGuardStateRef {
    return Arc::new(RwLock::new(Scene3DGuardState {
        enabled: false,
        billboard_camera_basis_guard: None,
    }));
}
pub fn singular_camera() -> flight_camera::Camera3D {
    let camera = camera_looking_from(0.0, 0.0, 10.0);
    camera.view.write().unwrap().m.fill(0.0);
    return camera;
}
