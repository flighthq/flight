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
        let perspective = create_perspective_projection(&PerspectiveProjectionOptions {
            aspect: Some(1.0),
            fov_y: 1.0,
        });
        let projection = Projection::Perspective(perspective.clone());
        match &projection {
            Projection::Perspective(stored) => assert!(Arc::ptr_eq(stored, &perspective)),
            _ => panic!("expected a perspective projection"),
        }
        let options = Camera3DOptions {
            far: 100.0,
            near: 0.1,
            near_clip_plane: None,
            projection: projection.clone(),
        };
        let camera = create_camera_3d(&options);
        match &camera.projection {
            Projection::Perspective(stored) => assert!(Arc::ptr_eq(stored, &perspective)),
            _ => panic!("expected a perspective projection"),
        }
    }
}
