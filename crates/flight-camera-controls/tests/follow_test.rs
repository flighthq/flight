use std::sync::RwLock;

use flight_camera::contract::{
    Camera2D, Camera2DFollowOptions, create_camera_2d, get_camera_2d_visible_bounds,
};
use flight_camera_controls::contract::*;
use flight_entity::Ref;
use flight_geometry::{Rectangle, create_rectangle};

use crate::test_support::*;

fn camera() -> Camera2D {
    return create_camera_2d(None);
}

fn options(
    deadzone_half_width: Option<f32>,
    deadzone_half_height: Option<f32>,
    smooth_time: Option<f32>,
    world_bounds: Option<Rectangle>,
) -> Camera2DFollowOptions {
    return Camera2DFollowOptions {
        deadzone_half_height,
        deadzone_half_width,
        smooth_time,
        world_bounds: world_bounds.map(|bounds| Ref::new(RwLock::new(bounds))),
    };
}

mod update_camera_2d_follow {
    use super::*;

    #[test]
    fn does_not_move_when_the_target_is_inside_the_deadzone() {
        let mut camera = camera();
        let guard = guard_state();
        update_camera_2d_follow(
            &guard,
            &mut camera,
            800.0,
            600.0,
            50.0,
            30.0,
            0.016,
            Some(&options(Some(100.0), Some(100.0), None, None)),
        );
        assert_eq!(camera.x, 0.0);
        assert_eq!(camera.y, 0.0);
    }

    #[test]
    fn moves_partway_toward_the_target_with_smoothing_over_one_step() {
        let mut camera = camera();
        let guard = guard_state();
        update_camera_2d_follow(
            &guard,
            &mut camera,
            800.0,
            600.0,
            100.0,
            0.0,
            0.016,
            Some(&options(None, None, Some(0.1), None)),
        );
        assert!(camera.x > 0.0);
        assert!(camera.x < 100.0);
        assert_eq!(camera.y, 0.0);
    }

    #[test]
    fn snaps_the_target_onto_the_deadzone_edge_when_smooth_time_is_zero() {
        let mut camera = camera();
        let guard = guard_state();
        update_camera_2d_follow(
            &guard,
            &mut camera,
            800.0,
            600.0,
            300.0,
            0.0,
            0.016,
            Some(&options(Some(100.0), None, Some(0.0), None)),
        );
        assert_eq!(camera.x, 200.0);
        assert_eq!(camera.y, 0.0);
    }

    #[test]
    fn clamps_the_camera_so_the_visible_bounds_stay_inside_world_bounds() {
        let mut camera = camera();
        let guard = guard_state();
        let world_bounds = create_rectangle(0.0, 0.0, 2000.0, 2000.0);
        update_camera_2d_follow(
            &guard,
            &mut camera,
            800.0,
            600.0,
            1900.0,
            1000.0,
            0.016,
            Some(&options(None, None, Some(0.0), Some(world_bounds))),
        );
        assert_eq!(camera.x, 1600.0);
        assert_eq!(camera.y, 1000.0);
        let mut visible = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(&guard, &camera, 800.0, 600.0, &mut visible);
        assert!(visible.x >= -1e-4);
        assert!(visible.y >= -1e-4);
        assert!(visible.x + visible.width <= 2000.0 + 1e-4);
        assert!(visible.y + visible.height <= 2000.0 + 1e-4);
    }

    #[test]
    fn centers_the_camera_on_an_axis_where_the_world_is_smaller_than_the_view() {
        let mut camera = camera();
        let guard = guard_state();
        let world_bounds = create_rectangle(0.0, 0.0, 400.0, 2000.0);
        update_camera_2d_follow(
            &guard,
            &mut camera,
            800.0,
            600.0,
            1900.0,
            1000.0,
            0.016,
            Some(&options(None, None, Some(0.0), Some(world_bounds))),
        );
        assert_eq!(camera.x, 200.0);
        assert_eq!(camera.y, 1000.0);
    }
}
