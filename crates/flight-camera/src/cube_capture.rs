//! Cube-map capture face cameras (TS `cubeCapture.ts`).

use flight_geometry::{Vector3, create_vector3, set_matrix4_look_at};

use crate::projection::create_perspective_projection;
use crate::types::*;

/// [dirX, dirY, dirZ, upX, upY, upZ] per face index — GL cube-map convention.
const CUBE_FACE_DIRECTIONS: [[f32; 6]; 6] = [
    [1.0, 0.0, 0.0, 0.0, -1.0, 0.0],
    [-1.0, 0.0, 0.0, 0.0, -1.0, 0.0],
    [0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
    [0.0, -1.0, 0.0, 0.0, 0.0, -1.0],
    [0.0, 0.0, 1.0, 0.0, -1.0, 0.0],
    [0.0, 0.0, -1.0, 0.0, -1.0, 0.0],
];

/// Sets `out` to the view and projection for one face of a cube-map capture from `position` (TS
/// `getCubeCaptureFaceCamera3D`). `face` is 0-5 for +X, -X, +Y, -Y, +Z, -Z; the projection is a 90°
/// square perspective. `near`/`far` are left as-is.
pub fn get_cube_capture_face_camera_3d(out: &mut Camera3D, position: &Vector3, face: i32) {
    let px = position.x;
    let py = position.y;
    let pz = position.z;
    let direction = CUBE_FACE_DIRECTIONS[face as usize];
    let target = create_vector3(px + direction[0], py + direction[1], pz + direction[2]);
    let eye = create_vector3(px, py, pz);
    let up = create_vector3(direction[3], direction[4], direction[5]);
    {
        let mut view = out.view.write().unwrap();
        set_matrix4_look_at(&mut view, &eye, &target, &up);
    }
    let projection = create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = 1.0;
        projection.fov_y = std::f32::consts::FRAC_PI_2;
    }
    out.projection = Projection::Perspective(projection);
}
