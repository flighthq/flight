use flight_geometry::contract::*;

mod large_coordinate_precision {
    use super::*;

    #[test]
    fn preserves_a_small_delta_above_the_single_precision_integer_limit() {
        let origin = create_vector2(16_777_216.0, -16_777_216.0);
        let offset = create_vector2(16_777_216.25, -16_777_216.0);
        assert_eq!(get_vector2_distance(&origin, &offset), 0.25);
    }
}

mod matrix_composition_precision {
    use super::*;

    #[test]
    fn preserves_sub_unit_translation_through_composition_and_transform() {
        let magnitude = 1_099_511_627_776.0;
        let base = create_matrix(1.0, 0.0, 0.0, 1.0, magnitude, -magnitude);
        let local = create_matrix(1.0, 0.0, 0.0, 1.0, 0.125, -0.25);
        let mut composed = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut composed, &base, &local);
        assert_eq!(composed.tx - base.tx, 0.125);
        assert_eq!(composed.ty - base.ty, -0.25);

        let point = create_vector2(0.25, 0.5);
        let mut transformed = create_vector2(0.0, 0.0);
        matrix_transform_point(&mut transformed, &composed, &point);
        assert_eq!(transformed.x - base.tx, 0.375);
        assert_eq!(transformed.y - base.ty, 0.25);
    }
}
