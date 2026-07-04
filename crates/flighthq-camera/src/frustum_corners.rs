//! Frustum corner unprojection through the inverse view-projection matrix.

use flighthq_geometry::inverse_matrix4;
use flighthq_types::{Camera, Matrix4Like, Vector3Like};

use crate::camera::get_camera_view_projection_matrix4;

/// Writes the 8 world-space corners of the camera frustum into `out` and
/// returns `true`. Returns `false` (leaving `out` untouched) when the
/// view-projection is non-invertible. `aspect` is viewport width / height.
///
/// Corner ordering (NDC cube vertices, rows = near then far):
///   0: (-1, -1, -1) near bottom-left
///   1: ( 1, -1, -1) near bottom-right
///   2: (-1,  1, -1) near top-left
///   3: ( 1,  1, -1) near top-right
///   4: (-1, -1,  1) far bottom-left
///   5: ( 1, -1,  1) far bottom-right
///   6: (-1,  1,  1) far top-left
///   7: ( 1,  1,  1) far top-right
///
/// Reads all inputs before writing any `out` element, so it is alias-safe.
pub fn get_camera_frustum_corners(
    out: &mut [Vector3Like; 8],
    camera: &Camera,
    aspect: f32,
) -> bool {
    let mut vp = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut vp, camera, aspect);
    let mut inv_vp = Matrix4Like::default();
    if !inverse_matrix4(&mut inv_vp, &vp) {
        return false;
    }
    let m = &inv_vp.m;

    #[rustfmt::skip]
    const NDC_CORNERS: [[f32; 3]; 8] = [
        [-1.0, -1.0, -1.0],
        [ 1.0, -1.0, -1.0],
        [-1.0,  1.0, -1.0],
        [ 1.0,  1.0, -1.0],
        [-1.0, -1.0,  1.0],
        [ 1.0, -1.0,  1.0],
        [-1.0,  1.0,  1.0],
        [ 1.0,  1.0,  1.0],
    ];

    // Compute all 8 corners into temporaries before writing.
    let mut results = [[0.0_f32; 3]; 8];
    for i in 0..8 {
        let [nx, ny, nz] = NDC_CORNERS[i];
        let mut wx = m[0] * nx + m[4] * ny + m[8] * nz + m[12];
        let mut wy = m[1] * nx + m[5] * ny + m[9] * nz + m[13];
        let mut wz = m[2] * nx + m[6] * ny + m[10] * nz + m[14];
        let ww = m[3] * nx + m[7] * ny + m[11] * nz + m[15];
        if ww != 0.0 {
            let inv_w = 1.0 / ww;
            wx *= inv_w;
            wy *= inv_w;
            wz *= inv_w;
        }
        results[i] = [wx, wy, wz];
    }

    for i in 0..8 {
        out[i].x = results[i][0];
        out[i].y = results[i][1];
        out[i].z = results[i][2];
    }
    true
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::create_vector3;
    use flighthq_types::Vector3Like;

    use super::*;
    use crate::camera::{create_camera, set_camera_view_matrix4_from_look_at};
    use crate::projection::create_perspective_projection;

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 1e-3, "{a} not close to {b}");
    }

    fn make_camera() -> Camera {
        let projection = create_perspective_projection(std::f32::consts::FRAC_PI_2, 1.0);
        let mut camera = create_camera(1.0, 100.0, projection);
        set_camera_view_matrix4_from_look_at(
            &mut camera,
            &create_vector3(0.0, 0.0, 10.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        camera
    }

    fn make_corners() -> [Vector3Like; 8] {
        [Vector3Like::default(); 8]
    }

    mod get_camera_frustum_corners {
        use super::*;

        #[test]
        fn writes_8_world_space_corners_and_returns_true() {
            let camera = make_camera();
            let mut corners = make_corners();
            let result = get_camera_frustum_corners(&mut corners, &camera, 1.0);
            assert!(result);
            // Near corners (0-3) should be closer to camera (higher z) than
            // far corners (4-7) since camera is at z=10 looking toward z=0.
            for i in 0..4 {
                assert!(
                    corners[i].z > corners[i + 4].z,
                    "near corner {} z={} should be > far corner {} z={}",
                    i,
                    corners[i].z,
                    i + 4,
                    corners[i + 4].z
                );
            }
        }

        #[test]
        fn returns_false_when_the_view_projection_is_non_invertible() {
            let mut camera = make_camera();
            // Zero-out the view matrix to make the VP non-invertible.
            camera.view.m = [0.0; 16];
            let mut corners = make_corners();
            let result = get_camera_frustum_corners(&mut corners, &camera, 1.0);
            assert!(!result);
        }

        #[test]
        fn near_corners_and_far_corners_have_opposite_symmetry_in_xy() {
            let camera = make_camera();
            let mut corners = make_corners();
            get_camera_frustum_corners(&mut corners, &camera, 1.0);
            // Near corners: 0 (-1,-1,-1), 1 (1,-1,-1), 2 (-1,1,-1), 3 (1,1,-1)
            close(corners[0].x, -corners[1].x);
            close(corners[0].y, -corners[2].y);
            close(corners[3].x, -corners[2].x);
        }
    }
}
