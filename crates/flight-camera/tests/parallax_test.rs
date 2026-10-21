use flight_camera::contract::*;

use crate::test_support::*;

fn camera() -> Camera2D {
    let options = Camera2DOptions {
        rotation: None,
        x: Some(100.0),
        y: Some(50.0),
        zoom: None,
    };
    return camera_2d(Some(&options));
}

mod get_camera_2d_parallax_point {
    use super::*;

    #[test]
    fn returns_no_offset_at_factor_zero() {
        let mut out = zero2();
        get_camera_2d_parallax_point(&camera(), 800.0, 600.0, 0.0, &mut out);
        assert_vec2_close(&out, (0.0, 0.0));
    }

    #[test]
    fn returns_the_full_camera_offset_at_factor_one() {
        let mut out = zero2();
        get_camera_2d_parallax_point(&camera(), 800.0, 600.0, 1.0, &mut out);
        assert_vec2_close(&out, (-100.0, -50.0));
    }

    #[test]
    fn returns_half_the_offset_at_factor_half() {
        let mut out = zero2();
        get_camera_2d_parallax_point(&camera(), 800.0, 600.0, 0.5, &mut out);
        assert_vec2_close(&out, (-50.0, -25.0));
    }
}
