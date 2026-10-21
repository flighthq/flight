use flight_scene2d_formats::contract::*;

mod create_lottie_gradient_matrix {
    use super::*;

    #[test]
    fn anchors_the_gradient_one_span_past_the_start_point_on_both_axes() {
        let start: [f32; 2] = [10.0, 20.0];
        let end: [f32; 2] = [40.0, 20.0];
        let span = (end[0] - start[0]).hypot(end[1] - start[1]);
        let matrix = create_lottie_gradient_matrix(&start, &end);
        assert!((matrix.tx - (start[0] + span)).abs() < 1e-5);
        assert!((matrix.ty - (start[1] + span)).abs() < 1e-5);
    }

    #[test]
    fn rotates_a_vertical_gradient_a_quarter_turn_from_a_horizontal_one_of_the_same_span() {
        let horizontal = create_lottie_gradient_matrix(&[0.0, 0.0], &[30.0, 0.0]);
        let vertical = create_lottie_gradient_matrix(&[0.0, 0.0], &[0.0, 30.0]);
        assert!(horizontal.b.abs() < 1e-5);
        assert!(vertical.b.abs() > 1e-5);
    }

    #[test]
    fn scales_in_proportion_to_the_span() {
        let single = create_lottie_gradient_matrix(&[0.0, 0.0], &[10.0, 0.0]);
        let double = create_lottie_gradient_matrix(&[0.0, 0.0], &[20.0, 0.0]);
        assert!((double.a.abs() - single.a.abs() * 2.0).abs() < 1e-5);
        assert!(single.a.abs() > 0.0);
    }
}

mod interpolate_lottie_gradient_opacity {
    use super::*;

    #[test]
    fn answers_fully_opaque_when_the_document_carries_no_opacity_stops() {
        assert_eq!(interpolate_lottie_gradient_opacity(&[], 0.5), 1.0);
    }

    #[test]
    fn clamps_to_the_end_stops_rather_than_extrapolating() {
        let stops = stops();
        assert_eq!(interpolate_lottie_gradient_opacity(&stops, -1.0), 0.0);
        assert_eq!(interpolate_lottie_gradient_opacity(&stops, 2.0), 0.25);
    }

    #[test]
    fn interpolates_linearly_between_the_surrounding_stops() {
        let stops = stops();
        assert!((interpolate_lottie_gradient_opacity(&stops, 0.25) - 0.5).abs() < 1e-5);
        assert!((interpolate_lottie_gradient_opacity(&stops, 0.75) - 0.625).abs() < 1e-5);
    }

    #[test]
    fn takes_the_later_stop_when_two_share_an_offset_rather_than_dividing_by_zero() {
        assert_eq!(
            interpolate_lottie_gradient_opacity(
                &[
                    LottieGradientOpacityStop {
                        alpha: 0.1,
                        offset: 0.5,
                    },
                    LottieGradientOpacityStop {
                        alpha: 0.9,
                        offset: 0.5,
                    },
                ],
                0.5,
            ),
            0.1
        );
    }
}

mod parse_lottie_gradient {
    use super::*;

    #[test]
    fn applies_the_opacity_track_that_follows_the_colour_stops() {
        let out = parse_lottie_gradient(
            &[0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.5, 1.0, 0.25],
            2,
            1.0,
        );
        assert!((out.alphas[0] - 0.5).abs() < 1e-5);
        assert!((out.alphas[1] - 0.25).abs() < 1e-5);
    }

    #[test]
    fn clamps_offsets_outside_the_unit_range() {
        let out = parse_lottie_gradient(&[-1.0, 1.0, 0.0, 0.0, 2.0, 0.0, 0.0, 1.0], 2, 1.0);
        assert_eq!(out.ratios, [0, 255]);
    }

    #[test]
    fn multiplies_the_layer_opacity_through() {
        let out = parse_lottie_gradient(&[0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0], 2, 0.5);
        assert_eq!(out.alphas, [0.5, 0.5]);
    }

    #[test]
    fn reads_colour_stops_and_scales_them_by_the_layer_opacity() {
        let out = parse_lottie_gradient(&[0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0], 2, 1.0);
        assert_eq!(out.colors.len(), 2);
        assert_eq!(out.ratios, [0, 255]);
        assert_eq!(out.alphas, [1.0, 1.0]);
    }
}

fn stops() -> Vec<LottieGradientOpacityStop> {
    return vec![
        LottieGradientOpacityStop {
            alpha: 0.0,
            offset: 0.0,
        },
        LottieGradientOpacityStop {
            alpha: 1.0,
            offset: 0.5,
        },
        LottieGradientOpacityStop {
            alpha: 0.25,
            offset: 1.0,
        },
    ];
}
