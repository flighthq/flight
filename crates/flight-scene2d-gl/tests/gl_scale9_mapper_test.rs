use flight_geometry::create_rectangle;
use flight_scene2d_gl::*;

mod build_gl_scale9_mapper {
    use super::*;

    #[test]
    fn returns_null_for_invalid_scale_or_bounds() {
        assert!(
            build_gl_scale9_mapper(
                &create_rectangle(0.0, 0.0, 0.0, 100.0),
                &create_rectangle(10.0, 10.0, 20.0, 20.0),
                1.0,
                1.0
            )
            .is_none()
        );
        assert!(
            build_gl_scale9_mapper(
                &create_rectangle(0.0, 0.0, 100.0, 100.0),
                &create_rectangle(10.0, 10.0, 20.0, 20.0),
                0.0,
                1.0
            )
            .is_none()
        );
    }

    #[test]
    fn maps_edge_and_center_coordinates_using_9_slice_scaling() {
        let mapper = build_gl_scale9_mapper(
            &create_rectangle(0.0, 0.0, 100.0, 100.0),
            &create_rectangle(10.0, 10.0, 20.0, 20.0),
            2.0,
            3.0,
        )
        .unwrap();

        assert_eq!((mapper.map_x)(5.0), 5.0);
        assert_eq!((mapper.map_x)(20.0), 70.0);
        assert_eq!((mapper.map_x)(40.0), 140.0);
        assert_eq!((mapper.map_y)(20.0), 120.0);
        assert_eq!((mapper.map_y)(40.0), 240.0);
    }
}
