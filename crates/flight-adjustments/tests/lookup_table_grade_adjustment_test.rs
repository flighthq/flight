use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_lookup_table_grade_adjustment {
    use super::*;

    #[test]
    fn is_a_neutral_passthrough_with_no_supplied_lut() {
        let adj: Adjustment = Adjustment::LookupTableGrade(create_lookup_table_grade_adjustment(Some(&LookupTableGradeAdjustmentOptions { lut: None, strength: Some(1.0) })));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 0.2, 0.4, 0.6);
        assert!((out[0] - 0.2).abs() < 1e-5);
        assert!((out[1] - 0.4).abs() < 1e-5);
        assert!((out[2] - 0.6).abs() < 1e-5);
    }

    #[test]
    fn applies_a_supplied_lut_at_full_strength() {
        let invert: Adjustment = Adjustment::ColorMatrix(create_color_matrix_adjustment(create_invert_color_matrix()));
        let invert_lut = bake_color_lut(&[invert], 16);
        let adj: Adjustment = Adjustment::LookupTableGrade(create_lookup_table_grade_adjustment(Some(&LookupTableGradeAdjustmentOptions { lut: Some(invert_lut), strength: Some(1.0) })));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 0.0, 0.0, 0.0);
        assert!((out[0] - 1.0).abs() < 1e-4);
    }

    #[test]
    fn mixes_toward_the_graded_color_by_strength() {
        let invert: Adjustment = Adjustment::ColorMatrix(create_color_matrix_adjustment(create_invert_color_matrix()));
        let invert_lut = bake_color_lut(&[invert], 16);
        let adj: Adjustment = Adjustment::LookupTableGrade(create_lookup_table_grade_adjustment(Some(&LookupTableGradeAdjustmentOptions { lut: Some(invert_lut), strength: Some(0.5) })));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        // input 0 -> graded 1 -> mix(0, 1, 0.5) = 0.5.
        apply_color_transform(&adj, &mut out, 0.0, 0.0, 0.0);
        assert!((out[0] - 0.5).abs() < 1e-4);
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
