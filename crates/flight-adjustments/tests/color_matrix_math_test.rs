use flight_adjustments::contract::*;

const WHITE: u32 = 0xffffffff;
const BLACK: u32 = 0x000000ff;
const RED: u32 = 0xff0000ff;
const GREEN: u32 = 0x00ff00ff;

// D1 f32 bound (TS: 0)
fn assert_close(actual: f32, expected: f32) {
    let bound = 4.0 * f32::EPSILON * 1.0f32.max(expected.abs());
    let diff = (actual - expected).abs();
    assert!(
        diff <= bound,
        "expected {expected}, got {actual} (diff: {diff}, bound: {bound})"
    );
}

mod apply_color_matrix_to_color {
    use super::*;

    #[test]
    fn identity_matrix_leaves_color_unchanged() {
        let identity = create_identity_color_matrix();
        assert_eq!(apply_color_matrix_to_color(&identity, RED), RED);
        assert_eq!(apply_color_matrix_to_color(&identity, GREEN), GREEN);
        assert_eq!(apply_color_matrix_to_color(&identity, WHITE), WHITE);
    }

    #[test]
    fn invert_matrix_inverts_rgb_channels() {
        let inv = create_invert_color_matrix();
        assert_eq!(apply_color_matrix_to_color(&inv, 0xff0000ff), 0x00ffffff);
    }

    #[test]
    fn grayscale_matrix_produces_equal_rgb() {
        let gray = create_grayscale_color_matrix();
        let result = apply_color_matrix_to_color(&gray, RED);
        let r = (result >> 24) & 0xff;
        let g = (result >> 16) & 0xff;
        let b = (result >> 8) & 0xff;
        assert_eq!(r, g);
        assert_eq!(g, b);
    }
}

mod color_matrix_length {
    use super::*;

    #[test]
    fn is_20() {
        assert_eq!(COLOR_MATRIX_LENGTH, 20);
    }
}

mod concat_color_matrix {
    use super::*;

    #[test]
    fn applying_identity_leaves_matrix_unchanged() {
        let mut m = create_grayscale_color_matrix();
        let original = m;
        concat_color_matrix(&mut m, &create_identity_color_matrix());
        assert_eq!(m, original);
    }

    #[test]
    fn is_alias_safe_when_target_is_source() {
        let mut m = create_identity_color_matrix();
        let original = m;
        let m_copy = m;
        concat_color_matrix(&mut m, &m_copy);
        assert_eq!(m, original);
    }
}

mod create_brightness_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_brightness_color_matrix(0.25);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn brightens_black_to_grey() {
        let m = create_brightness_color_matrix(128.0 / 255.0);
        let result = apply_color_matrix_to_color(&m, BLACK);
        let r = (result >> 24) & 0xff;
        assert_eq!(r, 128);
    }
}

mod create_channel_mixer_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m =
            create_channel_mixer_color_matrix(&[1.0, 0.0, 0.0], &[0.0, 1.0, 0.0], &[0.0, 0.0, 1.0]);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn identity_mix_leaves_color_unchanged() {
        let m =
            create_channel_mixer_color_matrix(&[1.0, 0.0, 0.0], &[0.0, 1.0, 0.0], &[0.0, 0.0, 1.0]);
        assert_eq!(m, create_identity_color_matrix());
    }

    #[test]
    fn swap_r_and_g_channels() {
        let m =
            create_channel_mixer_color_matrix(&[0.0, 1.0, 0.0], &[1.0, 0.0, 0.0], &[0.0, 0.0, 1.0]);
        let result = apply_color_matrix_to_color(&m, 0xff0000ff);
        let r = (result >> 24) & 0xff;
        let g = (result >> 16) & 0xff;
        assert_eq!(r, 0);
        assert_eq!(g, 255);
    }
}

mod create_color_balance_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m =
            create_color_balance_color_matrix(&[0.0, 0.0, 0.0], &[0.0, 0.0, 0.0], &[0.0, 0.0, 0.0]);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn all_zero_offsets_is_identity() {
        let m =
            create_color_balance_color_matrix(&[0.0, 0.0, 0.0], &[0.0, 0.0, 0.0], &[0.0, 0.0, 0.0]);
        assert_eq!(m, create_identity_color_matrix());
    }

    #[test]
    fn positive_red_midtone_raises_red_channel_offset() {
        let m = create_color_balance_color_matrix(
            &[0.0, 0.0, 0.0],
            &[100.0, 0.0, 0.0],
            &[0.0, 0.0, 0.0],
        );
        assert!((m[4] - 0.5).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((m[9]).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((m[14]).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
    }
}

mod create_color_matrix_from_tint {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_color_matrix_from_tint(0xff0000ff, 0.5);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn amount_zero_is_identity() {
        let m = create_color_matrix_from_tint(0xff0000ff, 0.0);
        assert_eq!(m, create_identity_color_matrix());
    }
}

mod create_contrast_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_contrast_color_matrix(1.5);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn amount_one_is_identity() {
        let m = create_contrast_color_matrix(1.0);
        assert_eq!(m, create_identity_color_matrix());
    }
}

mod create_desaturate_color_matrix {
    use super::*;

    #[test]
    fn amount_one_produces_a_grayscale_matrix() {
        let desaturate = create_desaturate_color_matrix(1.0);
        assert_eq!(desaturate, create_grayscale_color_matrix());
    }

    #[test]
    fn amount_zero_is_identity() {
        let m = create_desaturate_color_matrix(0.0);
        assert_eq!(m, create_identity_color_matrix());
    }
}

mod create_grayscale_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_grayscale_color_matrix();
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn luma_row_sums_to_one() {
        let m = create_grayscale_color_matrix();
        assert_close(m[0] + m[1] + m[2], 1.0);
    }
}

mod create_hue_rotate_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_hue_rotate_color_matrix(90.0);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn zero_degrees_is_close_to_identity() {
        let m = create_hue_rotate_color_matrix(0.0);
        let identity = create_identity_color_matrix();
        for i in 0..20 {
            assert_close(m[i], identity[i]);
        }
    }

    #[test]
    fn three_sixty_degrees_is_close_to_identity() {
        let m = create_hue_rotate_color_matrix(360.0);
        let identity = create_identity_color_matrix();
        for i in 0..20 {
            assert_close(m[i], identity[i]);
        }
    }
}

mod create_identity_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_identity_color_matrix();
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn leaves_red_unchanged() {
        assert_eq!(
            apply_color_matrix_to_color(&create_identity_color_matrix(), RED),
            RED
        );
    }
}

mod create_invert_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_invert_color_matrix();
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn inverts_white_to_black_rgb_only_alpha_unchanged() {
        let result = apply_color_matrix_to_color(&create_invert_color_matrix(), 0xffffff00);
        assert_eq!((result >> 24) & 0xff, 0);
        assert_eq!((result >> 16) & 0xff, 0);
        assert_eq!((result >> 8) & 0xff, 0);
    }
}

mod create_levels_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_levels_color_matrix(0.0, 1.0, 0.0, 1.0, 1.0);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn full_range_with_gamma_one_is_identity() {
        let m = create_levels_color_matrix(0.0, 1.0, 0.0, 1.0, 1.0);
        assert_eq!(m, create_identity_color_matrix());
    }

    #[test]
    fn clips_blacks_with_shifted_in_black() {
        let m = create_levels_color_matrix(128.0 / 255.0, 1.0, 0.0, 1.0, 1.0);
        assert!(m[0] > 1.0);
    }
}

mod create_opacity_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_opacity_color_matrix(0.5);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn scales_alpha_channel() {
        let m = create_opacity_color_matrix(0.5);
        let result = apply_color_matrix_to_color(&m, WHITE);
        let a = result & 0xff;
        assert!((a as f32 - 128.0).abs() < 0.5); // D1 f32 bound (TS: 0.5)
    }
}

mod create_polaroid_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_polaroid_color_matrix();
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }
}

mod create_saturation_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_saturation_color_matrix(0.5);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn saturation_one_is_identity() {
        let m = create_saturation_color_matrix(1.0);
        assert_eq!(m, create_identity_color_matrix());
    }

    #[test]
    fn saturation_zero_matches_grayscale_matrix() {
        let sat0 = create_saturation_color_matrix(0.0);
        assert_eq!(sat0, create_grayscale_color_matrix());
    }
}

mod create_sepia_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_sepia_color_matrix();
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }
}

mod create_technicolor_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_technicolor_color_matrix();
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }
}

mod create_vintage_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_vintage_color_matrix();
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }
}

mod create_white_balance_color_matrix {
    use super::*;

    #[test]
    fn returns_a_20_element_array() {
        let m = create_white_balance_color_matrix(0.0, 0.0);
        assert_eq!(m.len(), COLOR_MATRIX_LENGTH);
    }

    #[test]
    fn neutral_zero_zero_is_identity() {
        let m = create_white_balance_color_matrix(0.0, 0.0);
        let identity = create_identity_color_matrix();
        for i in 0..20 {
            assert_close(m[i], identity[i]);
        }
    }

    #[test]
    fn warm_temperature_increases_red_gain_and_decreases_blue_gain() {
        let m = create_white_balance_color_matrix(50.0, 0.0);
        assert!(m[0] > 1.0);
        assert!(m[12] < 1.0);
    }

    #[test]
    fn cool_temperature_decreases_red_gain_and_increases_blue_gain() {
        let m = create_white_balance_color_matrix(-50.0, 0.0);
        assert!(m[0] < 1.0);
        assert!(m[12] > 1.0);
    }

    #[test]
    fn positive_tint_increases_green_gain() {
        let m = create_white_balance_color_matrix(0.0, 100.0);
        assert!(m[6] > 1.0);
    }
}

mod fuse_color_matrices {
    use super::*;

    #[test]
    fn empty_list_yields_the_identity() {
        assert_eq!(fuse_color_matrices(&[]), create_identity_color_matrix());
    }

    #[test]
    fn single_matrix_is_returned_as_an_independent_copy() {
        let invert = create_invert_color_matrix();
        let fused = fuse_color_matrices(&[&invert]);
        assert_eq!(fused, invert);
    }

    #[test]
    fn fuses_a_run_of_three_in_application_order() {
        let a = create_invert_color_matrix();
        let b = create_grayscale_color_matrix();
        let c = create_contrast_color_matrix(1.5);
        let mut temp = [0.0_f32; 20];
        multiply_color_matrix(&mut temp, &b, &a);
        let mut expected = [0.0_f32; 20];
        multiply_color_matrix(&mut expected, &c, &temp);
        let fused = fuse_color_matrices(&[&a, &b, &c]);
        assert_eq!(fused, expected);
    }

    #[test]
    fn order_matters_composition_is_not_commutative() {
        let invert = create_invert_color_matrix();
        let sepia = create_sepia_color_matrix();
        let forward = fuse_color_matrices(&[&invert, &sepia]);
        let reversed = fuse_color_matrices(&[&sepia, &invert]);
        assert_ne!(
            apply_color_matrix_to_color(&forward, RED),
            apply_color_matrix_to_color(&reversed, RED)
        );
    }

    #[test]
    fn does_not_mutate_its_inputs() {
        let a = create_invert_color_matrix();
        let b = create_sepia_color_matrix();
        let a_copy = a;
        let b_copy = b;
        fuse_color_matrices(&[&a, &b]);
        assert_eq!(a, a_copy);
        assert_eq!(b, b_copy);
    }
}

mod multiply_color_matrix {
    use super::*;

    #[test]
    fn supports_geometry_clone_form_with_non_commuting_offsets() {
        let mut a = create_brightness_color_matrix(0.25);
        let mut b = create_contrast_color_matrix(2.0);
        let a_snapshot = a;
        let b_snapshot = b;
        multiply_color_matrix(&mut a, &a_snapshot, &b_snapshot);
        multiply_color_matrix(&mut b, &a_snapshot, &b_snapshot);
        let expected = [
            2.0, 0.0, 0.0, 0.0, -0.25, 0.0, 2.0, 0.0, 0.0, -0.25, 0.0, 0.0, 2.0, 0.0, -0.25, 0.0,
            0.0, 0.0, 1.0, 0.0,
        ];
        assert_eq!(a, expected);
        assert_eq!(b, expected);
    }

    #[test]
    fn identity_composed_with_identity_is_identity() {
        let identity = create_identity_color_matrix();
        let mut result = [0.0_f32; 20];
        multiply_color_matrix(&mut result, &identity, &identity);
        assert_eq!(result, identity);
    }

    #[test]
    fn writes_to_out() {
        let identity = create_identity_color_matrix();
        let mut out = [0.0_f32; 20];
        multiply_color_matrix(&mut out, &identity, &identity);
        assert_eq!(out, identity);
    }

    #[test]
    fn reuses_first_destination_with_a_distinct_source_value() {
        let a = create_grayscale_color_matrix();
        let b = create_identity_color_matrix();
        let mut expected = [0.0_f32; 20];
        multiply_color_matrix(&mut expected, &a, &b);
        let mut a_mut = a;
        let a_copy = a;
        multiply_color_matrix(&mut a_mut, &a_copy, &b);
        assert_eq!(a_mut, expected);
    }

    #[test]
    fn reuses_second_destination_with_a_distinct_source_value() {
        let a = create_identity_color_matrix();
        let b = create_grayscale_color_matrix();
        let mut expected = [0.0_f32; 20];
        multiply_color_matrix(&mut expected, &a, &b);
        let mut b_mut = b;
        let b_copy = b;
        multiply_color_matrix(&mut b_mut, &a, &b_copy);
        assert_eq!(b_mut, expected);
    }
}
