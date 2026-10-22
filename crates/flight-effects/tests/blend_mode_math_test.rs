use super::*;

fn luma(rgb: &[f32; 3]) -> f32 {
    0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]
}
fn saturation(rgb: &[f32; 3]) -> f32 {
    rgb[0].max(rgb[1]).max(rgb[2]) - rgb[0].min(rgb[1]).min(rgb[2])
}

mod blend_non_separable_rgb {
    use super::*;

    #[test]
    fn color_takes_source_hue_and_saturation_with_backdrop_luma() {
        let mut out = [0.0; 3];
        blend_non_separable_rgb(
            &mut out,
            ADVANCED_BLEND_MODE_COLOR,
            0.2,
            0.2,
            0.2,
            0.9,
            0.1,
            0.1,
        );
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(luma(&out), 0.2, 5e-6);
    }

    #[test]
    fn falls_through_to_the_source_triple_for_an_unknown_mode() {
        let mut out = [0.0; 3];
        blend_non_separable_rgb(&mut out, "acme.Nope", 0.1, 0.2, 0.3, 0.7, 0.8, 0.9);
        assert_eq!(out, [0.7, 0.8, 0.9]);
    }

    #[test]
    fn hue_takes_source_hue_backdrop_saturation_and_luma() {
        let mut out = [0.0; 3];
        let backdrop = [0.4, 0.5, 0.6];
        blend_non_separable_rgb(
            &mut out,
            ADVANCED_BLEND_MODE_HUE,
            0.4,
            0.5,
            0.6,
            0.9,
            0.2,
            0.2,
        );
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(luma(&out), luma(&backdrop), 5e-6);
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(saturation(&out), saturation(&backdrop), 5e-6);
    }

    #[test]
    fn keeps_every_channel_in_zero_to_one_after_gamut_clipping() {
        let mut out = [0.0; 3];
        blend_non_separable_rgb(
            &mut out,
            ADVANCED_BLEND_MODE_COLOR,
            0.95,
            0.95,
            0.95,
            1.0,
            0.0,
            0.0,
        );
        assert!(out.iter().all(|channel| (0.0..=1.0).contains(channel)));
    }

    #[test]
    fn luminosity_replaces_backdrop_luma_with_source_luma_and_preserves_saturation() {
        let mut out = [0.0; 3];
        let backdrop = [0.8, 0.2, 0.4];
        let source = [0.5, 0.5, 0.5];
        blend_non_separable_rgb(
            &mut out,
            ADVANCED_BLEND_MODE_LUMINOSITY,
            0.8,
            0.2,
            0.4,
            0.5,
            0.5,
            0.5,
        );
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(luma(&out), luma(&source), 5e-6);
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(saturation(&out), saturation(&backdrop), 5e-6);
    }

    #[test]
    fn saturation_takes_source_saturation_backdrop_hue_and_luma() {
        let mut out = [0.0; 3];
        let backdrop = [0.4, 0.5, 0.6];
        let source = [0.9, 0.2, 0.2];
        blend_non_separable_rgb(
            &mut out,
            ADVANCED_BLEND_MODE_SATURATION,
            0.4,
            0.5,
            0.6,
            0.9,
            0.2,
            0.2,
        );
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(saturation(&out), saturation(&source), 5e-6);
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(luma(&out), luma(&backdrop), 5e-6);
    }
}

mod get_advanced_blend_rgb {
    use super::*;

    #[test]
    fn computes_difference_per_channel() {
        let mut out = [0.0; 3];
        get_advanced_blend_rgb(
            &mut out,
            ADVANCED_BLEND_MODE_DIFFERENCE,
            0.8,
            0.5,
            0.2,
            0.3,
            0.5,
            0.9,
        );
        for (actual, expected) in out.into_iter().zip([0.5, 0.0, 0.7]) {
            // D1 f32 bound (TS: 5 decimal digits).
            assert_close(actual, expected, 5e-6);
        }
    }

    #[test]
    fn falls_through_to_the_source_triple_for_a_non_advanced_mode() {
        let mut out = [0.0; 3];
        get_advanced_blend_rgb(&mut out, "Multiply", 0.5, 0.5, 0.5, 0.2, 0.3, 0.4);
        assert_eq!(out, [0.2, 0.3, 0.4]);
    }

    #[test]
    fn routes_hsl_modes_through_the_non_separable_path() {
        let mut out = [0.0; 3];
        get_advanced_blend_rgb(
            &mut out,
            ADVANCED_BLEND_MODE_LUMINOSITY,
            0.8,
            0.2,
            0.4,
            0.5,
            0.5,
            0.5,
        );
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(luma(&out), 0.5, 5e-6);
    }
}

mod get_separable_blend_channel {
    use super::*;

    #[test]
    fn color_burn_clamps_black_and_white_and_computes_the_middle() {
        assert_eq!(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_COLOR_BURN, 0.6, 0.0),
            0.0
        );
        assert_eq!(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_COLOR_BURN, 1.0, 0.5),
            1.0
        );
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_COLOR_BURN, 0.75, 0.5),
            0.5,
            5e-7,
        );
    }

    #[test]
    fn color_dodge_clamps_white_and_black_and_computes_the_middle() {
        assert_eq!(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_COLOR_DODGE, 0.4, 1.0),
            1.0
        );
        assert_eq!(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_COLOR_DODGE, 0.0, 0.5),
            0.0
        );
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_COLOR_DODGE, 0.25, 0.5),
            0.5,
            5e-7,
        );
    }

    #[test]
    fn darken_and_lighten_are_separable_not_hsl() {
        assert!(!is_non_separable_blend_mode(ADVANCED_BLEND_MODE_DARKEN));
        assert!(!is_non_separable_blend_mode(ADVANCED_BLEND_MODE_LIGHTEN));
    }

    #[test]
    fn darken_and_lighten_are_the_w3c_per_channel_min_and_max() {
        for (mode, cb, cs, expected) in [
            (ADVANCED_BLEND_MODE_DARKEN, 0.6, 0.3, 0.3),
            (ADVANCED_BLEND_MODE_DARKEN, 0.2, 0.9, 0.2),
            (ADVANCED_BLEND_MODE_LIGHTEN, 0.6, 0.3, 0.6),
            (ADVANCED_BLEND_MODE_LIGHTEN, 0.2, 0.9, 0.9),
        ] {
            // D1 f32 bound (TS: 6 decimal digits).
            assert_close(get_separable_blend_channel(mode, cb, cs), expected, 5e-7);
        }
    }

    #[test]
    fn difference_is_the_absolute_channel_distance() {
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_DIFFERENCE, 0.8, 0.3),
            0.5,
            5e-7,
        );
    }

    #[test]
    fn exclusion_with_mid_gray_source_collapses_to_mid_gray() {
        for backdrop in [0.2, 0.9] {
            // D1 f32 bound (TS: 6 decimal digits).
            assert_close(
                get_separable_blend_channel(ADVANCED_BLEND_MODE_EXCLUSION, backdrop, 0.5),
                0.5,
                5e-7,
            );
        }
    }

    #[test]
    fn hard_light_over_a_mid_gray_source_is_a_straight_overlay() {
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_HARD_LIGHT, 0.4, 0.5),
            0.4,
            5e-7,
        );
    }

    #[test]
    fn overlay_equals_hard_light_with_operands_swapped() {
        let overlay = get_separable_blend_channel(ADVANCED_BLEND_MODE_OVERLAY, 0.6, 0.3);
        let swapped = get_separable_blend_channel(ADVANCED_BLEND_MODE_HARD_LIGHT, 0.3, 0.6);
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(overlay, swapped, 5e-7);
    }

    #[test]
    fn returns_the_source_channel_for_an_unknown_mode() {
        assert_eq!(get_separable_blend_channel("acme.Nope", 0.2, 0.7), 0.7);
    }

    #[test]
    fn soft_light_leaves_the_backdrop_unchanged_for_a_mid_gray_source() {
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(
            get_separable_blend_channel(ADVANCED_BLEND_MODE_SOFT_LIGHT, 0.6, 0.5),
            0.6,
            5e-7,
        );
    }
}

mod is_non_separable_blend_mode {
    use super::*;

    #[test]
    fn is_false_for_the_separable_modes() {
        for mode in [
            ADVANCED_BLEND_MODE_OVERLAY,
            ADVANCED_BLEND_MODE_HARD_LIGHT,
            ADVANCED_BLEND_MODE_SOFT_LIGHT,
            ADVANCED_BLEND_MODE_DIFFERENCE,
            ADVANCED_BLEND_MODE_EXCLUSION,
            ADVANCED_BLEND_MODE_COLOR_DODGE,
            ADVANCED_BLEND_MODE_COLOR_BURN,
        ] {
            assert!(!is_non_separable_blend_mode(mode));
        }
    }

    #[test]
    fn is_true_only_for_the_four_hsl_modes() {
        for mode in [
            ADVANCED_BLEND_MODE_HUE,
            ADVANCED_BLEND_MODE_SATURATION,
            ADVANCED_BLEND_MODE_COLOR,
            ADVANCED_BLEND_MODE_LUMINOSITY,
        ] {
            assert!(is_non_separable_blend_mode(mode));
        }
    }
}
