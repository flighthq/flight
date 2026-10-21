use flight_camera::contract::*;
use flight_geometry::{
    create_matrix4, create_perspective_matrix4, set_orthographic_matrix4, set_perspective_matrix4,
};

use crate::test_support::*;

mod create_orthographic_projection {
    use super::*;

    #[test]
    fn builds_an_orthographic_descriptor_from_half_extents() {
        let projection = create_orthographic_projection(&OrthographicProjectionOptions {
            half_height: 3.0,
            half_width: 4.0,
        });
        let borrowed = projection.read().unwrap();
        assert!(matches!(
            Projection::Orthographic(projection.clone()),
            Projection::Orthographic(_)
        ));
        assert_eq!(borrowed.half_width, 4.0);
        assert_eq!(borrowed.half_height, 3.0);
    }
}

mod create_perspective_projection {
    use super::*;

    #[test]
    fn builds_a_perspective_descriptor_from_fov_and_aspect() {
        let projection = create_perspective_projection(&PerspectiveProjectionOptions {
            aspect: Some(1.5),
            fov_y: std::f32::consts::FRAC_PI_3,
        });
        let borrowed = projection.read().unwrap();
        assert_close(borrowed.fov_y, std::f32::consts::FRAC_PI_3);
        assert_eq!(borrowed.aspect, 1.5);
    }

    #[test]
    fn defaults_aspect_to_one_when_omitted() {
        let projection = create_perspective_projection(&PerspectiveProjectionOptions {
            aspect: None,
            fov_y: 1.0,
        });
        assert_eq!(projection.read().unwrap().aspect, 1.0);
    }
}

mod create_raw_projection {
    use super::*;

    #[test]
    fn builds_a_raw_projection_from_a_matrix_copying_the_data() {
        let mut source =
            create_perspective_matrix4((std::f32::consts::PI / 6.0).tan(), 1.5, 0.1, 100.0);
        let projection = create_raw_projection(&RawProjectionOptions {
            matrix: source.clone(),
        });
        let stored = projection.read().unwrap();
        let matrix = stored.matrix.read().unwrap();
        let mut index = 0;
        while index < 16 {
            assert_close(matrix.m[index], source.m[index]);
            index += 1;
        }
        drop(matrix);
        drop(stored);
        source.m[0] = 999.0;
        assert_ne!(
            projection.read().unwrap().matrix.read().unwrap().m[0],
            999.0
        );
    }
}

mod get_orthographic_projection_texel_size {
    use super::*;

    #[test]
    fn uses_the_larger_world_space_texel_footprint() {
        let projection = create_orthographic_projection(&OrthographicProjectionOptions {
            half_height: 20.0,
            half_width: 10.0,
        });
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
    fn is_the_construction_initializer_of_create_orthographic_projection() {
        let mut projection = flight_entity::allocate_entity::<OrthographicProjection>();
        initialize_orthographic_projection(
            &mut projection,
            &OrthographicProjectionOptions {
                half_height: 2.0,
                half_width: 5.0,
            },
        );
        assert_eq!(projection.half_width, 5.0);
    }
}

mod initialize_perspective_projection {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_perspective_projection() {
        let mut projection = flight_entity::allocate_entity::<PerspectiveProjection>();
        initialize_perspective_projection(
            &mut projection,
            &PerspectiveProjectionOptions {
                aspect: None,
                fov_y: 0.5,
            },
        );
        assert_eq!(projection.aspect, 1.0);
        assert_eq!(projection.fov_y, 0.5);
    }
}

mod initialize_raw_projection {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_raw_projection() {
        let mut projection = flight_entity::allocate_entity::<RawProjection>();
        let matrix = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        initialize_raw_projection(&mut projection, &RawProjectionOptions { matrix });
        assert_eq!(projection.matrix.read().unwrap().m[0], 1.0);
    }
}

mod is_orthographic_projection {
    use super::*;

    #[test]
    fn is_true_for_orthographic_and_false_for_perspective() {
        let orthographic = Projection::Orthographic(create_orthographic_projection(
            &OrthographicProjectionOptions {
                half_height: 1.0,
                half_width: 1.0,
            },
        ));
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
        let orthographic = Projection::Orthographic(create_orthographic_projection(
            &OrthographicProjectionOptions {
                half_height: 1.0,
                half_width: 1.0,
            },
        ));
        assert!(is_perspective_projection(&perspective));
        assert!(!is_perspective_projection(&orthographic));
    }
}

mod is_raw_projection {
    use super::*;

    #[test]
    fn is_true_only_for_raw() {
        let matrix = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        let raw = Projection::Raw(create_raw_projection(&RawProjectionOptions { matrix }));
        let perspective = perspective_projection(1.0, Some(1.0));
        let orthographic = Projection::Orthographic(create_orthographic_projection(
            &OrthographicProjectionOptions {
                half_height: 1.0,
                half_width: 1.0,
            },
        ));
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
        let mut out = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_projection_matrix4(&mut out, &projection, 1.6, 0.1, 100.0);
        let expected = create_perspective_matrix4((fov_y * 0.5).tan(), 1.6, 0.1, 100.0);
        assert_mat4_close(&out, &expected);
    }

    #[test]
    fn uses_the_passed_aspect_over_the_stored_aspect() {
        let projection = perspective_projection(1.0, Some(1.0));
        let mut out = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_projection_matrix4(&mut out, &projection, 2.0, 0.5, 50.0);
        let expected = create_perspective_matrix4((1.0_f32 * 0.5).tan(), 2.0, 0.5, 50.0);
        assert_mat4_close(&out, &expected);
    }

    #[test]
    fn copies_a_raw_projection_matrix_verbatim() {
        let mut source = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_perspective_matrix4(
            &mut source,
            (std::f32::consts::PI / 4.0).tan(),
            1.5,
            0.1,
            100.0,
        );
        let projection = Projection::Raw(create_raw_projection(&RawProjectionOptions {
            matrix: source.clone(),
        }));
        let mut out = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_projection_matrix4(&mut out, &projection, 999.0, 0.0, 1.0);
        assert_mat4_close(&out, &source);
    }

    #[test]
    fn matches_the_geometry_orthographic_builder_using_symmetric_half_extents() {
        let projection = Projection::Orthographic(create_orthographic_projection(
            &OrthographicProjectionOptions {
                half_height: 3.0,
                half_width: 5.0,
            },
        ));
        let mut out = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_projection_matrix4(&mut out, &projection, 99.0, 1.0, 20.0);
        let mut expected = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_orthographic_matrix4(&mut expected, -5.0, 5.0, -3.0, 3.0, 1.0, 20.0);
        assert_mat4_close(&out, &expected);
    }
}
