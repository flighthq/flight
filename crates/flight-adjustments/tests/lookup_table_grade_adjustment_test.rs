use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_lookup_table_grade_adjustment {
    use super::*;

    #[test]
    fn is_a_neutral_passthrough_with_no_supplied_lut() {
        let adj = create_lookup_table_grade_adjustment(Some(&LookupTableGradeAdjustmentOptions { lut: None, strength: Some(1.0) }));
        assert_eq!(adj.kind, "LookupTableGradeAdjustment");
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        (get_adjustment_color_transform(&adj).unwrap())(&mut out, 0.2, 0.4, 0.6);
        assert!((out[0] - 0.2).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[1] - 0.4).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[2] - 0.6).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
    }

    #[test]
    fn applies_a_supplied_lut_at_full_strength() {
        let invert = create_color_matrix_adjustment(create_invert_color_matrix());
        let invert_lut = bake_color_lut(&[get_adjustment_color_transform(&invert).unwrap()], Some(16));
        let adj = create_lookup_table_grade_adjustment(Some(&LookupTableGradeAdjustmentOptions { lut: Some(invert_lut), strength: Some(1.0) }));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        (get_adjustment_color_transform(&adj).unwrap())(&mut out, 0.0, 0.0, 0.0);
        assert!((out[0] - 1.0).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
    }

    #[test]
    fn mixes_toward_the_graded_color_by_strength() {
        let invert = create_color_matrix_adjustment(create_invert_color_matrix());
        let invert_lut = bake_color_lut(&[get_adjustment_color_transform(&invert).unwrap()], Some(16));
        let adj = create_lookup_table_grade_adjustment(Some(&LookupTableGradeAdjustmentOptions { lut: Some(invert_lut), strength: Some(0.5) }));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        // input 0 -> graded 1 -> mix(0, 1, 0.5) = 0.5.
        (get_adjustment_color_transform(&adj).unwrap())(&mut out, 0.0, 0.0, 0.0);
        assert!((out[0] - 0.5).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
    }
}

mod initialize_lookup_table_grade_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_lookup_table_grade_adjustment() {
        let mut out: LookupTableGradeAdjustment = allocate_entity();
        initialize_lookup_table_grade_adjustment(&mut out, Some(&LookupTableGradeAdjustmentOptions { lut: None, strength: Some(1.0) }));
        assert!(out.lut.is_none());
        assert_eq!(out.strength, 1.0);
    }
}
