use flight_camera::contract::*;
use flight_geometry::{
    create_matrix4, create_perspective_matrix4, set_orthographic_matrix4, set_perspective_matrix4,
};

use crate::test_support::*;

mod create_orthographic_projection {
    use super::*;

    #[test]
    fn builds_an_orthographic_descriptor_with_zero_half_extents() {
        let projection = create_orthographic_projection();
        let borrowed = projection.read().unwrap();
        assert!(matches!(
            Projection::Orthographic(projection.clone()),
            Projection::Orthographic(_)
        ));
        assert_eq!(borrowed.half_width, 0.0);
        assert_eq!(borrowed.half_height, 0.0);
    }
}

mod create_perspective_projection {
    use super::*;

    #[test]
    fn builds_a_perspective_descriptor_with_square_aspect_and_zero_fov() {
        let projection = create_perspective_projection();
        let borrowed = projection.read().unwrap();
        assert_eq!(borrowed.fov_y, 0.0);
        assert_eq!(borrowed.aspect, 1.0);
    }
}

mod create_raw_projection {
    use super::*;

    #[test]
    fn builds_a_raw_projection_with_an_identity_matrix() {
        let projection = create_raw_projection();
        let stored = projection.read().unwrap();
        let matrix = stored.matrix.read().unwrap();
        assert_mat4_close(&matrix, &create_matrix4());
    }
}

mod get_orthographic_projection_texel_size {
    use super::*;

    #[test]
    fn uses_the_larger_world_space_texel_footprint() {
        let projection = create_orthographic_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.half_height = 20.0;
            projection.half_width = 10.0;
        }
        let borrowed = projection.read().unwrap();
        assert_close(
            get_orthographic_projection_texel_size(&borrowed, 100.0, 100.0),
            0.4,
        );
        assert_close(
            get_orthographic_projection_texel_size(&borrowed, 50.0, 200.0),
            0.4,
        );
    }
}

mod initialize_orthographic_projection {
    use super::*;

    #[test]
    fn restores_defaults_while_preserving_entity_identity() {
        let mut projection = flight_entity::allocate_entity::<OrthographicProjection>();
        projection.half_height = 2.0;
        projection.half_width = 5.0;
        let id = flight_entity::get_entity_id(&projection);
        initialize_orthographic_projection(&mut projection);
        assert_eq!(projection.half_height, 0.0);
        assert_eq!(projection.half_width, 0.0);
        assert_eq!(flight_entity::get_entity_id(&projection), id);
    }
}

mod initialize_perspective_projection {
    use super::*;

    #[test]
    fn restores_defaults_while_preserving_entity_identity() {
        let mut projection = flight_entity::allocate_entity::<PerspectiveProjection>();
        projection.aspect = 2.0;
        projection.fov_y = 0.5;
        let id = flight_entity::get_entity_id(&projection);
        initialize_perspective_projection(&mut projection);
        assert_eq!(projection.aspect, 1.0);
        assert_eq!(projection.fov_y, 0.0);
        assert_eq!(flight_entity::get_entity_id(&projection), id);
    }
}

mod initialize_raw_projection {
    use super::*;

    #[test]
    fn restores_identity_matrix_while_preserving_entity_identity() {
        let mut projection = flight_entity::allocate_entity::<RawProjection>();
        projection.matrix.write().unwrap().m[0] = 7.0;
        let id = flight_entity::get_entity_id(&projection);
        initialize_raw_projection(&mut projection);
        assert_mat4_close(&projection.matrix.read().unwrap(), &create_matrix4());
        assert_eq!(flight_entity::get_entity_id(&projection), id);
    }
}

mod is_orthographic_projection {
    use super::*;

    #[test]
    fn is_true_for_orthographic_and_false_for_perspective() {
        let orthographic = Projection::Orthographic(create_orthographic_projection());
        let perspective = perspective_projection(1.0, Some(1.0));
        assert!(is_orthographic_projection(&orthographic));
        assert!(!is_orthographic_projection(&perspective));
    }
}

mod is_perspective_projection {
    use super::*;

    #[test]
    fn is_true_for_perspective_and_false_for_orthographic() {
        let perspective = perspective_projection(1.0, Some(1.0));
        let orthographic = Projection::Orthographic(create_orthographic_projection());
        assert!(is_perspective_projection(&perspective));
        assert!(!is_perspective_projection(&orthographic));
    }
}

mod is_raw_projection {
    use super::*;

    #[test]
    fn is_true_only_for_raw() {
        let raw = Projection::Raw(create_raw_projection());
        let perspective = perspective_projection(1.0, Some(1.0));
        let orthographic = Projection::Orthographic(create_orthographic_projection());
        assert!(is_raw_projection(&raw));
        assert!(!is_raw_projection(&perspective));
        assert!(!is_raw_projection(&orthographic));
    }
}

mod set_projection_matrix4 {
    use super::*;

    #[test]
    fn matches_the_geometry_perspective_builder_using_tan_half_fov() {
        let fov_y = std::f32::consts::FRAC_PI_2;
        let projection = perspective_projection(fov_y, Some(1.6));
        let mut out = create_matrix4();
        set_projection_matrix4(&mut out, &projection, 1.6, 0.1, 100.0);
        let expected = create_perspective_matrix4((fov_y * 0.5).tan(), 1.6, 0.1, 100.0);
        assert_mat4_close(&out, &expected);
    }

    #[test]
    fn uses_the_passed_aspect_over_the_stored_aspect() {
        let projection = perspective_projection(1.0, Some(1.0));
        let mut out = create_matrix4();
        set_projection_matrix4(&mut out, &projection, 2.0, 0.5, 50.0);
        let expected = create_perspective_matrix4((1.0_f32 * 0.5).tan(), 2.0, 0.5, 50.0);
        assert_mat4_close(&out, &expected);
    }

    #[test]
    fn copies_a_raw_projection_matrix_verbatim() {
        let mut source = create_matrix4();
        set_perspective_matrix4(
            &mut source,
            (std::f32::consts::PI / 4.0).tan(),
            1.5,
            0.1,
            100.0,
        );
        let raw = create_raw_projection();
        raw.write().unwrap().matrix.write().unwrap().m = source.m;
        let projection = Projection::Raw(raw);
        let mut out = create_matrix4();
        set_projection_matrix4(&mut out, &projection, 999.0, 0.0, 1.0);
        assert_mat4_close(&out, &source);
    }

    #[test]
    fn matches_the_geometry_orthographic_builder_using_symmetric_half_extents() {
        let orthographic = create_orthographic_projection();
        {
            let mut orthographic = orthographic.write().unwrap();
            orthographic.half_height = 3.0;
            orthographic.half_width = 5.0;
        }
        let projection = Projection::Orthographic(orthographic);
        let mut out = create_matrix4();
        set_projection_matrix4(&mut out, &projection, 99.0, 1.0, 20.0);
        let mut expected = create_matrix4();
        set_orthographic_matrix4(&mut expected, -5.0, 5.0, -3.0, 3.0, 1.0, 20.0);
        assert_mat4_close(&out, &expected);
    }
}
