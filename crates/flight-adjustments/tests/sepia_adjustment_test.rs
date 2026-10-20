use flight_adjustments::*;

mod create_sepia_adjustment {
    use super::*;

    #[test]
    fn defaults_to_a_full_sepia_tone() {
        let adjustment = create_sepia_adjustment(1.0);
        // White stays warm-white; red maps to the sepia red row (0.393*255 ~ 100). Alpha preserved.
        let red = apply_color_matrix_to_color(&adjustment.color_matrix, 0xff0000ff);
        assert_eq!((red >> 24) & 0xff, (0.393_f32 * 255.0).round() as u32);
        assert_eq!(red & 0xff, 0xff);
    }

    #[test]
    fn intensity_0_leaves_color_unchanged() {
        let adjustment = create_sepia_adjustment(0.0);
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0x3366ccff), 0x3366ccff);
    }
}

mod initialize_sepia_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_sepia_adjustment() {
        let mut out = SepiaAdjustment::default();
        initialize_sepia_adjustment(&mut out, 1.0);
        let red = apply_color_matrix_to_color(&out.color_matrix, 0xff0000ff);
        assert_eq!((red >> 24) & 0xff, (0.393_f32 * 255.0).round() as u32);
    }
}
