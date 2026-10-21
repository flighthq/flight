use std::sync::{Arc, RwLock};

use flight_camera::contract::{
    Camera3D, Camera3DOptions, OrthographicProjectionOptions, PerspectiveProjectionOptions,
    Projection, create_camera_3d, create_orthographic_projection, create_perspective_projection,
    set_camera_3d_view_matrix4_from_look_at,
};
use flight_entity::Ref;
use flight_geometry::{Ray3D, create_ray3d, create_vector3, set_ray3d};
use flight_meshgeometry::{
    MeshGeometry, MeshGeometryFromAttributesOptions, create_box_mesh_geometry,
    create_mesh_geometry_from_attributes,
};
use flight_node::contract::NodeRevisionState;
use flight_node::{NodeRef, add_node_child};
use flight_scene3d::{Mesh, Node3DFields, create_mesh, create_node3d};

// The source's `toBeCloseTo(expected, digits)`: |actual - expected| < 10^-digits / 2.
pub fn close(actual: f32, expected: f32, digits: i32) {
    let tolerance = 10f32.powi(-digits) / 2.0;
    assert!(
        (actual - expected).abs() < tolerance,
        "{actual} is not within {tolerance} of {expected}"
    );
}

pub fn geometry(geometry: MeshGeometry) -> Ref<MeshGeometry> {
    return Arc::new(RwLock::new(geometry));
}

pub fn mesh(geometry: Ref<MeshGeometry>) -> Ref<Mesh> {
    return create_mesh(geometry, Arc::new(RwLock::new(Vec::new())), None, None);
}

pub fn box_mesh() -> Ref<Mesh> {
    return mesh(geometry(create_box_mesh_geometry(
        Some(2.0),
        Some(2.0),
        Some(2.0),
    )));
}

pub fn node(mesh: &Ref<Mesh>) -> NodeRef {
    return mesh.clone();
}

pub fn group() -> NodeRef {
    return Arc::new(RwLock::new(create_node3d::<Node3DFields>(None, None)));
}

pub fn revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

pub fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d(&Camera3DOptions {
        far: 100.0,
        near: 0.1,
        near_clip_plane: None,
        projection: Projection::Perspective(create_perspective_projection(
            &PerspectiveProjectionOptions {
                aspect: Some(1.0),
                fov_y: std::f32::consts::FRAC_PI_2,
            },
        )),
    });
    // Look down -Z at the origin from z = 5.
    set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &create_vector3(0.0, 0.0, 5.0),
        &create_vector3(0.0, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    return camera;
}

// Orthographic camera with a deliberately non-square view volume (half_width != half_height) to
// guard against a horizontal/vertical mismap. Looks down -Z from z = 5.
pub fn make_ortho_camera(half_width: f32, half_height: f32) -> Camera3D {
    let mut camera = create_camera_3d(&Camera3DOptions {
        far: 100.0,
        near: 0.1,
        near_clip_plane: None,
        projection: Projection::Orthographic(create_orthographic_projection(
            &OrthographicProjectionOptions {
                half_height,
                half_width,
            },
        )),
    });
    set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &create_vector3(0.0, 0.0, 5.0),
        &create_vector3(0.0, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    return camera;
}

// A world-space ray from z = 5 pointing toward the origin along -Z (mirrors make_camera's center
// ray).
pub fn make_center_ray() -> Ray3D {
    let mut ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    set_ray3d(
        &mut ray,
        &create_vector3(0.0, 0.0, 5.0),
        &create_vector3(0.0, 0.0, -1.0),
    );
    return ray;
}

// A single triangle in the z = 0 plane. `front_facing` winds it so its geometric normal points
// toward +Z (toward a camera at +Z); otherwise it faces -Z (away).
pub fn triangle_mesh(front_facing: bool) -> Ref<Mesh> {
    let a = [-1.0, -1.0, 0.0];
    let b = if front_facing {
        [1.0, -1.0, 0.0]
    } else {
        [0.0, 1.0, 0.0]
    };
    let c = if front_facing {
        [0.0, 1.0, 0.0]
    } else {
        [1.0, -1.0, 0.0]
    };
    let positions = [a, b, c].concat();
    return mesh(geometry(create_mesh_geometry_from_attributes(
        MeshGeometryFromAttributesOptions {
            positions,
            normals: None,
            uvs: None,
            indices: None,
        },
    )));
}

pub fn scene_with_centered_box() -> (NodeRef, Ref<Mesh>) {
    let scene = group();
    let mesh = box_mesh();
    add_node_child(&scene, &node(&mesh));
    return (scene, mesh);
}
