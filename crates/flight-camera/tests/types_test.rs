use std::sync::Arc;

use flight_camera::contract::*;

use crate::test_support::*;

fn assert_entity<T: flight_entity::Entity>() {}

mod camera_types {
    use super::*;

    #[test]
    fn camera_types_are_entities() {
        assert_entity::<Camera2D>();
        assert_entity::<Camera3D>();
        assert_entity::<OrthographicProjection>();
        assert_entity::<PerspectiveProjection>();
        assert_entity::<RawProjection>();
    }

    #[test]
    fn guard_state_defaults_to_disabled_with_no_hooks() {
        let guard = guard_state();
        let current = guard.read().unwrap();
        assert!(!current.enabled);
        assert!(current.view_guard.is_none());
        assert!(current.visible_bounds_guard.is_none());
    }

    #[test]
    fn camera_2d_options_keep_every_override_optional() {
        let options = Camera2DOptions {
            rotation: None,
            x: None,
            y: None,
            zoom: None,
        };
        assert!(options.rotation.is_none());
        assert!(options.x.is_none());
        assert!(options.y.is_none());
        assert!(options.zoom.is_none());
    }

    #[test]
    fn camera_2d_follow_options_keep_every_field_optional_and_retain_bounds_identity() {
        let empty = Camera2DFollowOptions {
            deadzone_half_height: None,
            deadzone_half_width: None,
            smooth_time: None,
            world_bounds: None,
        };
        assert!(empty.deadzone_half_height.is_none());
        assert!(empty.deadzone_half_width.is_none());
        assert!(empty.smooth_time.is_none());
        assert!(empty.world_bounds.is_none());
    }

    #[test]
    fn camera_2d_follow_options_retain_the_world_bounds_handle() {
        let bounds = std::sync::Arc::new(std::sync::RwLock::new(
            flight_geometry::create_rectangle(0.0, 0.0, 100.0, 100.0),
        ));
        let options = Camera2DFollowOptions {
            deadzone_half_height: Some(10.0),
            deadzone_half_width: Some(20.0),
            smooth_time: Some(0.5),
            world_bounds: Some(bounds.clone()),
        };
        let stored = options.world_bounds.as_ref().expect("bounds retained");
        assert!(std::sync::Arc::ptr_eq(stored, &bounds));
    }

    #[test]
    fn view_explanation_is_plain_data() {
        let explanation = Camera3DViewExplanation {
            determinant: 1.0,
            is_orthonormal: true,
            is_reflection: false,
            scale_deviation: 0.0,
            shear_deviation: 0.0,
        };
        assert_eq!(explanation.determinant, 1.0);
        assert!(explanation.is_orthonormal);
    }

    #[test]
    fn projection_union_preserves_member_identity() {
        let perspective = create_perspective_projection();
        let projection = Projection::Perspective(perspective.clone());
        match &projection {
            Projection::Perspective(stored) => assert!(Arc::ptr_eq(stored, &perspective)),
            _ => panic!("expected a perspective projection"),
        }
        let mut camera = create_camera_3d();
        camera.far = 100.0;
        camera.near = 0.1;
        camera.projection = projection.clone();
        match &camera.projection {
            Projection::Perspective(stored) => assert!(Arc::ptr_eq(stored, &perspective)),
            _ => panic!("expected a perspective projection"),
        }
    }
}
