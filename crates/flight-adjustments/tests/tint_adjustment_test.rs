use flight_adjustments::*;

mod create_tint_adjustment {
    use super::*;

    #[test]
    fn carries_a_20_length_diagonal_matrix() {
        let tint = create_tint_adjustment(0xff0000ff);
        assert_eq!(tint.color_matrix.len(), 20);
        // Diagonal multipliers at 0/6/12/18, offsets (4/9/14/19) zero, no off-diagonal terms.
        assert_eq!(tint.color_matrix[0], 1.0);
        assert_eq!(tint.color_matrix[6], 0.0);
        assert_eq!(tint.color_matrix[12], 0.0);
        assert_eq!(tint.color_matrix[18], 1.0);
        assert_eq!(tint.color_matrix[4], 0.0);
        assert_eq!(tint.color_matrix[1], 0.0);
        assert_eq!(tint.color_matrix[19], 0.0);
    }

    #[test]
    fn multiplies_a_white_pixel_down_to_the_tint_color() {
        assert_eq!(apply_color_matrix_to_color(&create_tint_adjustment(0x000000ff).color_matrix, 0xffffffff), 0x000000ff);
        assert_eq!(apply_color_matrix_to_color(&create_tint_adjustment(0xff0000ff).color_matrix, 0xffffffff), 0xff0000ff);
        assert_eq!(apply_color_matrix_to_color(&create_tint_adjustment(0x808080ff).color_matrix, 0xffffffff), 0x808080ff);
    }

    #[test]
    fn scales_an_arbitrary_pixel_per_channel() {
        // Half-tint on mid-grey halves each colour channel; full alpha leaves alpha unchanged.
        assert_eq!(apply_color_matrix_to_color(&create_tint_adjustment(0x808080ff).color_matrix, 0x808080ff), 0x404040ff);
    }
}

mod initialize_tint_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_tint_adjustment() {
        let mut out = TintAdjustment::default();
        initialize_tint_adjustment(&mut out, 0xff0000ff);
        assert_eq!(out.color_matrix[0], 1.0);
        assert_eq!(out.color_matrix[6], 0.0);
    }
}
