use flight_camera::contract::*;
use flight_geometry::{create_matrix4, set_matrix4};

use crate::test_support::*;

fn perspective_camera() -> Camera3D {
    return camera_3d(0.1, 100.0, 1.0);
}

fn view_from(values: [f32; 16]) -> flight_geometry::Matrix4 {
    let mut out = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_matrix4(
        &mut out, values[0], values[1], values[2], values[3], values[4], values[5], values[6],
        values[7], values[8], values[9], values[10], values[11], values[12], values[13],
        values[14], values[15],
    );
    return out;
}

mod explain_camera_3d_view {
    use super::*;

    #[test]
    fn accepts_a_rigid_look_at_view() {
        let mut camera = perspective_camera();
        look_at(&mut camera, (0.0, 0.0, 10.0), (0.0, 0.0, 0.0));
        let explanation = explain_camera_3d_view(&camera);
        assert!(explanation.is_orthonormal);
        assert!(!explanation.is_reflection);
        assert_close(explanation.determinant, 1.0);
    }

    #[test]
    fn accepts_a_reflection_view_and_reports_it_as_one() {
        let guard = guard_state();
        let mut camera = perspective_camera();
        let view = view_from([
            -1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 7.0, 9.0, 1.0,
        ]);
        set_camera_3d_view_matrix4_from_matrix4(&guard, &mut camera, &view);
        let explanation = explain_camera_3d_view(&camera);
        assert!(explanation.is_orthonormal);
        assert!(explanation.is_reflection);
        assert_close(explanation.determinant, -1.0);
    }

    #[test]
    fn reports_a_scaled_view_as_non_orthonormal_with_the_deviation() {
        let guard = guard_state();
        let mut camera = perspective_camera();
        let view = view_from([
            2.0, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ]);
        set_camera_3d_view_matrix4_from_matrix4(&guard, &mut camera, &view);
        let explanation = explain_camera_3d_view(&camera);
        assert!(!explanation.is_orthonormal);
        assert_close(explanation.scale_deviation, 1.0);
    }

    #[test]
    fn reports_a_sheared_view_as_non_orthonormal() {
        let guard = guard_state();
        let mut camera = perspective_camera();
        let view = view_from([
            1.0, 0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ]);
        set_camera_3d_view_matrix4_from_matrix4(&guard, &mut camera, &view);
        let explanation = explain_camera_3d_view(&camera);
        assert!(!explanation.is_orthonormal);
        assert!(explanation.shear_deviation > 0.1);
    }
}
