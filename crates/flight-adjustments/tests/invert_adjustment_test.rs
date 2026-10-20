use flight_adjustments::*;

mod create_invert_adjustment {
    use super::*;

    #[test]
    fn defaults_to_a_full_invert() {
        let adjustment = create_invert_adjustment(1.0);
        assert_eq!(adjustment.color_matrix.len(), 20);
        // Opaque mid-grey inverts to itself; pure red inverts to cyan. Alpha is preserved.
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0x808080ff), 0x7f7f7fff);
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0xff0000ff), 0x00ffffff);
    }

    #[test]
    fn intensity_0_is_the_identity() {
        let adjustment = create_invert_adjustment(0.0);
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0x123456ff), 0x123456ff);
    }

    #[test]
    fn intensity_half_collapses_toward_mid_grey() {
        let adjustment = create_invert_adjustment(0.5);
        // scale 0, offset 127.5 -> every channel rounds to 128.
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0x00ffccff), 0x808080ff);
    }
}

mod initialize_invert_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_invert_adjustment() {
        let mut out = InvertAdjustment::default();
        initialize_invert_adjustment(&mut out, 1.0);
        assert_eq!(apply_color_matrix_to_color(&out.color_matrix, 0xff0000ff), 0x00ffffff);
    }
}
