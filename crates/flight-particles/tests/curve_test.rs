use flight_particles::*;

mod build_particle_color_curve {
    use super::*;

    #[test]
    fn bakes_an_rgb_function_into_an_interleaved_lut() {
        let lut = build_particle_color_curve(&|t| [t, 0.0, 1.0 - t], 3);
        assert_eq!(lut.len(), 9);
        assert_eq!(lut[0], 0.0); // R at t=0
        assert_eq!(lut[2], 1.0); // B at t=0
    }
}

mod build_particle_curve {
    use super::*;

    #[test]
    fn bakes_a_scalar_function_into_a_lut_sampled_at_the_endpoints() {
        let lut = build_particle_curve(&|t| t * t, 5);
        assert_eq!(lut.len(), 5);
        assert_eq!(lut[0], 0.0);
        assert_eq!(lut[4], 1.0);
        assert!((sample_particle_curve(&lut, 0.5) - 0.25).abs() < 0.1);
    }
}

mod lerp_hsv_direct {
    use super::*;

    #[test]
    fn interpolates_from_red_to_green_through_yellow_at_t_0_5() {
        let mut out = [0.0f32; 3];
        lerp_hsv_direct(&mut out, 0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.5);
        assert!(out[0] > 0.7); // R
        assert!(out[1] > 0.7); // G
        assert!((out[2] - 0.0).abs() < 0.01); // B
    }

    #[test]
    fn takes_the_short_arc_when_interpolating_hues() {
        let mut out = [0.0f32; 3];
        lerp_hsv_direct(&mut out, 0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.5);
        assert!(out[0] > 0.5); // R is prominent
        assert!((out[1] - 0.0).abs() < 0.01); // no green
    }

    #[test]
    fn writes_at_the_given_offset() {
        let mut out = [9.0f32, 9.0, 9.0, 0.0, 0.0, 0.0];
        lerp_hsv_direct(&mut out, 3, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0);
        assert!((out[3] - 1.0).abs() < 0.01);
        assert!((out[4] - 0.0).abs() < 0.01);
        assert!((out[5] - 0.0).abs() < 0.01);
    }
}

mod lerp_hsv_in_place {
    use super::*;

    #[test]
    fn interpolates_rgb_values_via_hsv_at_the_given_offset() {
        let mut colors_out = [0.0f32; 3];
        let birth = [1.0f32, 0.0, 0.0]; // red
        let death = [0.0f32, 1.0, 0.0]; // green
        lerp_hsv_in_place(&mut colors_out, 0, &birth, &death, 0.5);
        assert!(colors_out[0] > 0.5);
        assert!(colors_out[1] > 0.5);
        assert!((colors_out[2] - 0.0).abs() < 0.01);
    }

    #[test]
    fn returns_birth_color_at_t_0_and_death_color_at_t_1() {
        let birth = [0.2f32, 0.4, 0.6];
        let death = [0.6f32, 0.4, 0.2];
        let mut out0 = [0.0f32; 3];
        lerp_hsv_in_place(&mut out0, 0, &birth, &death, 0.0);
        assert!((out0[0] - 0.2).abs() < 0.001);
        assert!((out0[1] - 0.4).abs() < 0.001);
        assert!((out0[2] - 0.6).abs() < 0.001);
        let mut out1 = [0.0f32; 3];
        lerp_hsv_in_place(&mut out1, 0, &birth, &death, 1.0);
        assert!((out1[0] - 0.6).abs() < 0.001);
        assert!((out1[1] - 0.4).abs() < 0.001);
        assert!((out1[2] - 0.2).abs() < 0.001);
    }

    #[test]
    fn reads_and_writes_at_the_specified_offset() {
        let birth = [9.0f32, 9.0, 9.0, 1.0, 0.0, 0.0]; // offset 3 = red
        let death = [9.0f32, 9.0, 9.0, 0.0, 1.0, 0.0]; // offset 3 = green
        let mut out = [9.0f32, 9.0, 9.0, 0.0, 0.0, 0.0];
        lerp_hsv_in_place(&mut out, 3, &birth, &death, 0.0);
        assert_eq!(out[0], 9.0);
        assert!((out[3] - 1.0).abs() < 0.01);
        assert!((out[4] - 0.0).abs() < 0.01);
        assert!((out[5] - 0.0).abs() < 0.01);
    }
}

mod particle_color_curve_from_keyframes {
    use super::*;

    #[test]
    fn bakes_an_rgb_timeline_through_its_middle_stop() {
        let lut = particle_color_curve_from_keyframes(
            &[
                ColorKeyframe { time: 0.0, r: 1.0, g: 0.0, b: 0.0 },
                ColorKeyframe { time: 0.5, r: 0.0, g: 1.0, b: 0.0 },
                ColorKeyframe { time: 1.0, r: 0.0, g: 0.0, b: 1.0 },
            ],
            33,
        );
        let mut out = [0.0f32; 3];
        sample_particle_color_curve(&mut out, 0, &lut, 0.5);
        assert!(out[1] > 0.8); // green at mid
    }

    #[test]
    fn empty_keyframe_list_yields_a_flat_transparent_curve() {
        let lut = particle_color_curve_from_keyframes(&[], 33);
        let mut out = [9.0f32; 3];
        sample_particle_color_curve(&mut out, 0, &lut, 0.5);
        assert_eq!(out, [0.0, 0.0, 0.0]);
    }
}

mod particle_color_curve_to_keyframes {
    use super::*;

    #[test]
    fn emits_one_rgb_keyframe_per_lut_sample_at_uniform_times() {
        let keys = particle_color_curve_to_keyframes(&[1.0, 0.0, 0.0, 0.0, 0.0, 1.0]);
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].time, 0.0);
        assert_eq!(keys[0].r, 1.0);
        assert_eq!(keys[0].g, 0.0);
        assert_eq!(keys[0].b, 0.0);
        assert_eq!(keys[1].time, 1.0);
        assert_eq!(keys[1].r, 0.0);
        assert_eq!(keys[1].g, 0.0);
        assert_eq!(keys[1].b, 1.0);
    }

    #[test]
    fn round_trips_a_baked_color_curve_back_to_keyframes() {
        let lut = particle_color_curve_from_keyframes(
            &[
                ColorKeyframe { time: 0.0, r: 1.0, g: 0.0, b: 0.0 },
                ColorKeyframe { time: 1.0, r: 0.0, g: 0.0, b: 1.0 },
            ],
            33,
        );
        let keys = particle_color_curve_to_keyframes(&lut);
        assert_eq!(keys[0].time, 0.0);
        assert_eq!(keys[0].r, 1.0);
        assert_eq!(keys[0].g, 0.0);
        assert_eq!(keys[0].b, 0.0);
        let last = keys.last().unwrap();
        assert_eq!(last.time, 1.0);
        assert_eq!(last.r, 0.0);
        assert_eq!(last.g, 0.0);
        assert_eq!(last.b, 1.0);
    }

    #[test]
    fn handles_empty_and_single_entry_luts() {
        assert!(particle_color_curve_to_keyframes(&[]).is_empty());
        let single = particle_color_curve_to_keyframes(&[0.2, 0.4, 0.6]);
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].time, 0.0);
        assert_eq!(single[0].r, 0.2);
        assert_eq!(single[0].g, 0.4);
        assert_eq!(single[0].b, 0.6);
    }
}

mod particle_curve_from_keyframes {
    use super::*;

    #[test]
    fn interpolates_a_3_stop_scalar_timeline_through_its_middle_stop() {
        let lut = particle_curve_from_keyframes(
            &[
                CurveKeyframe { time: 0.0, value: 0.0 },
                CurveKeyframe { time: 0.5, value: 1.0 },
                CurveKeyframe { time: 1.0, value: 0.0 },
            ],
            33,
        );
        assert!((sample_particle_curve(&lut, 0.0) - 0.0).abs() < 0.01);
        assert!(sample_particle_curve(&lut, 0.5) > 0.9);
        assert!((sample_particle_curve(&lut, 1.0) - 0.0).abs() < 0.01);
    }

    #[test]
    fn sorts_unsorted_keyframes_by_time() {
        let lut = particle_curve_from_keyframes(
            &[
                CurveKeyframe { time: 1.0, value: 10.0 },
                CurveKeyframe { time: 0.0, value: 0.0 },
            ],
            33,
        );
        assert!((sample_particle_curve(&lut, 0.0) - 0.0).abs() < 0.1);
        assert!((sample_particle_curve(&lut, 1.0) - 10.0).abs() < 0.1);
    }

    #[test]
    fn handles_non_normalized_key_times_by_clamping_at_the_ends() {
        let lut = particle_curve_from_keyframes(
            &[
                CurveKeyframe { time: 0.25, value: 2.0 },
                CurveKeyframe { time: 0.75, value: 6.0 },
            ],
            33,
        );
        assert!((sample_particle_curve(&lut, 0.0) - 2.0).abs() < 0.1);
        assert!((sample_particle_curve(&lut, 1.0) - 6.0).abs() < 0.1);
        assert!((sample_particle_curve(&lut, 0.5) - 4.0).abs() < 0.1);
    }

    #[test]
    fn a_single_keyframe_yields_a_constant_curve() {
        let lut = particle_curve_from_keyframes(
            &[CurveKeyframe { time: 0.5, value: 3.0 }],
            33,
        );
        assert!((sample_particle_curve(&lut, 0.0) - 3.0).abs() < 0.01);
        assert!((sample_particle_curve(&lut, 1.0) - 3.0).abs() < 0.01);
    }

    #[test]
    fn an_empty_keyframe_list_yields_a_flat_zero_curve() {
        let lut = particle_curve_from_keyframes(&[], 33);
        assert_eq!(sample_particle_curve(&lut, 0.0), 0.0);
        assert_eq!(sample_particle_curve(&lut, 1.0), 0.0);
    }
}

mod particle_curve_to_keyframes {
    use super::*;

    #[test]
    fn emits_one_keyframe_per_lut_sample_at_uniform_times() {
        let keys = particle_curve_to_keyframes(&[0.0, 0.5, 1.0]);
        assert_eq!(keys.len(), 3);
        assert_eq!(keys[0].time, 0.0);
        assert_eq!(keys[0].value, 0.0);
        assert_eq!(keys[1].time, 0.5);
        assert_eq!(keys[1].value, 0.5);
        assert_eq!(keys[2].time, 1.0);
        assert_eq!(keys[2].value, 1.0);
    }

    #[test]
    fn round_trips_a_baked_scalar_curve_back_to_keyframes() {
        let lut = particle_curve_from_keyframes(
            &[
                CurveKeyframe { time: 0.0, value: 0.0 },
                CurveKeyframe { time: 1.0, value: 10.0 },
            ],
            33,
        );
        let keys = particle_curve_to_keyframes(&lut);
        assert_eq!(keys[0].time, 0.0);
        assert_eq!(keys[0].value, 0.0);
        let last = keys.last().unwrap();
        assert_eq!(last.time, 1.0);
        assert_eq!(last.value, 10.0);
        let reconstructed = particle_curve_from_keyframes(&keys, lut.len() as i32);
        let diff = (sample_particle_curve(&reconstructed, 0.5)
            - sample_particle_curve(&lut, 0.5))
        .abs();
        assert!(diff < 1e-5);
    }

    #[test]
    fn handles_empty_and_single_entry_luts() {
        assert!(particle_curve_to_keyframes(&[]).is_empty());
        let single = particle_curve_to_keyframes(&[7.0]);
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].time, 0.0);
        assert_eq!(single[0].value, 7.0);
    }
}

mod sample_particle_color_curve {
    use super::*;

    #[test]
    fn interpolates_interleaved_rgb_channels() {
        let lut = [1.0f32, 0.0, 0.0, 0.0, 0.0, 1.0]; // red -> blue
        let mut out = [0.0f32; 3];
        sample_particle_color_curve(&mut out, 0, &lut, 0.5);
        assert!((out[0] - 0.5).abs() < 0.01);
        assert!((out[1] - 0.0).abs() < 0.01);
        assert!((out[2] - 0.5).abs() < 0.01);
    }

    #[test]
    fn writes_at_the_given_offset() {
        let lut = [0.2f32, 0.4, 0.6];
        let mut out = [9.0f32; 5];
        sample_particle_color_curve(&mut out, 2, &lut, 0.0);
        assert!((out[2] - 0.2).abs() < 0.01);
        assert!((out[3] - 0.4).abs() < 0.01);
        assert!((out[4] - 0.6).abs() < 0.01);
    }
}

mod sample_particle_curve {
    use super::*;

    #[test]
    fn returns_endpoints_at_t_0_and_t_1() {
        let lut = [0.0f32, 0.5, 1.0];
        assert_eq!(sample_particle_curve(&lut, 0.0), 0.0);
        assert_eq!(sample_particle_curve(&lut, 1.0), 1.0);
    }

    #[test]
    fn linearly_interpolates_between_samples() {
        let lut = [0.0f32, 1.0];
        assert!((sample_particle_curve(&lut, 0.25) - 0.25).abs() < 0.01);
        assert!((sample_particle_curve(&lut, 0.5) - 0.5).abs() < 0.01);
    }

    #[test]
    fn clamps_out_of_range_t() {
        let lut = [2.0f32, 4.0];
        assert_eq!(sample_particle_curve(&lut, -1.0), 2.0);
        assert_eq!(sample_particle_curve(&lut, 5.0), 4.0);
    }

    #[test]
    fn handles_empty_and_single_entry_curves() {
        assert_eq!(sample_particle_curve(&[], 0.5), 0.0);
        assert_eq!(sample_particle_curve(&[7.0], 0.5), 7.0);
    }
}
