use std::sync::{Arc, Mutex};

use flight_camera::contract::*;
use flight_geometry::{create_rectangle, intersects_rectangle};

use crate::test_support::*;

fn options(zoom: Option<f32>, rotation: Option<f32>) -> Camera2DOptions {
    return Camera2DOptions {
        rotation,
        x: None,
        y: None,
        zoom,
    };
}

mod get_camera_2d_visible_bounds {
    use super::*;

    #[test]
    fn covers_the_full_viewport_in_world_units_at_zoom_one() {
        let guard = guard_state();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(&guard, &camera_2d(None), 800.0, 600.0, &mut out);
        assert_close(out.x, -400.0);
        assert_close(out.y, -300.0);
        assert_close(out.width, 800.0);
        assert_close(out.height, 600.0);
    }

    #[test]
    fn shrinks_to_half_size_centered_at_zoom_two() {
        let guard = guard_state();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(
            &guard,
            &camera_2d(Some(&options(Some(2.0), None))),
            800.0,
            600.0,
            &mut out,
        );
        assert_close(out.x, -200.0);
        assert_close(out.y, -150.0);
        assert_close(out.width, 400.0);
        assert_close(out.height, 300.0);
    }

    #[test]
    fn returns_the_enclosing_aabb_of_a_rotated_view_larger_than_the_viewport() {
        let guard = guard_state();
        let camera = camera_2d(Some(&options(None, Some(std::f32::consts::FRAC_PI_4))));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(&guard, &camera, 800.0, 600.0, &mut out);
        assert_close_within(out.width, 989.9495, 1e-2);
        assert_close_within(out.height, 989.9495, 1e-2);
        assert!(out.width > 800.0);
        assert!(out.height > 600.0);
        let corners = [(0.0, 0.0), (800.0, 0.0), (800.0, 600.0), (0.0, 600.0)];
        for (screen_x, screen_y) in corners {
            let mut corner = zero2();
            unproject_camera_2d_point(&camera, 800.0, 600.0, screen_x, screen_y, &mut corner);
            assert!(corner.x >= out.x - 1e-3);
            assert!(corner.x <= out.x + out.width + 1e-3);
            assert!(corner.y >= out.y - 1e-3);
            assert!(corner.y <= out.y + out.height + 1e-3);
        }
    }
}

mod set_camera_2d_visible_bounds_guard {
    use super::*;

    #[test]
    fn fails_toward_drawing_with_a_finite_unbounded_rectangle() {
        let guard = guard_state();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(
            &guard,
            &camera_2d(Some(&options(Some(0.0), None))),
            64.0,
            64.0,
            &mut out,
        );
        assert!((out.x + out.width).is_finite());
        assert!((out.y + out.height).is_finite());
        assert!(intersects_rectangle(
            &out,
            &create_rectangle(1e12, -4e11, 10.0, 10.0)
        ));
        assert!(intersects_rectangle(
            &out,
            &create_rectangle(-9e15, 8e14, 1.0, 1.0)
        ));
    }

    #[test]
    fn notifies_the_installed_guard_once_per_degenerate_call_and_never_when_invertible() {
        let guard = guard_state();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let recorder = seen.clone();
        let hook: Camera2DVisibleBoundsGuard = Arc::new(move |camera: &Camera2D| {
            recorder.lock().unwrap().push(camera.zoom);
        });
        set_camera_2d_visible_bounds_guard(&guard, Some(hook));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(
            &guard,
            &camera_2d(Some(&options(Some(0.0), None))),
            64.0,
            64.0,
            &mut out,
        );
        get_camera_2d_visible_bounds(&guard, &camera_2d(None), 64.0, 64.0, &mut out);
        assert_eq!(*seen.lock().unwrap(), vec![0.0]);
        set_camera_2d_visible_bounds_guard(&guard, None);
    }

    #[test]
    fn leaves_an_invertible_camera_computing_the_same_bounds() {
        let guard = guard_state();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(&guard, &camera_2d(None), 64.0, 32.0, &mut out);
        assert_close(out.width, 64.0);
        assert_close(out.height, 32.0);
    }
}
