use flight_adjustments::*;

mod create_color_grade_adjustment {
    use super::*;

    #[test]
    fn defaults_to_approximately_neutral() {
        // The lift/gamma/gain packed neutral 0x808080 is 128/255 ~ 0.502, so the default gamma
        // exponent is ~0.996 rather than 1 -- faithful to the ported shader.
        let adj: Adjustment = create_color_grade_adjustment(0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0x000000ff, 0x808080ff, 0xffffffff).into();
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 0.3, 0.5, 0.7);
        assert!((out[0] - 0.3).abs() < 0.01);
        assert!((out[1] - 0.5).abs() < 0.01);
        assert!((out[2] - 0.7).abs() < 0.01);
    }

    #[test]
    fn scales_contrast_about_mid_grey() {
        let adj: Adjustment = create_color_grade_adjustment(0.0, 0.0, 2.0, 1.0, 0.0, 0.0, 0x000000ff, 0x808080ff, 0xffffffff).into();
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 0.5, 0.5, 0.5);
        // Mid-grey is the pivot -- unchanged (within the near-neutral default gamma).
        assert!((out[0] - 0.5).abs() < 0.01);
        apply_color_transform(&adj, &mut out, 0.75, 0.75, 0.75);
        // (0.75 - 0.5)*2 + 0.5 = 1, and pow(1, gamma) = 1 exactly.
        assert!((out[0] - 1.0).abs() < 1e-4);
    }

    #[test]
    fn desaturates_toward_luma_at_saturation_0() {
        let adj: Adjustment = create_color_grade_adjustment(0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0x000000ff, 0x808080ff, 0xffffffff).into();
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 1.0, 0.0, 0.0);
        // Rec.709 luma of pure red is 0.2126 on every channel (within the near-neutral default gamma).
        assert!((out[0] - 0.2126).abs() < 0.01);
        assert!((out[1] - 0.2126).abs() < 0.01);
        assert!((out[2] - 0.2126).abs() < 0.01);
    }
}

mod initialize_color_grade_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_grade_adjustment() {
        let mut out = ColorGradeAdjustment::default();
        initialize_color_grade_adjustment(&mut out, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0x000000ff, 0x808080ff, 0xffffffff);
        assert_eq!(out.contrast, 1.0);
        assert_eq!(out.saturation, 1.0);
    }
}
