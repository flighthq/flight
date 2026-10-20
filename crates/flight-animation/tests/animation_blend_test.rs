use flight_animation::*;

mod accumulate_animation_sample {
    use super::*;

    #[test]
    fn adds_positive_weighted_samples_and_ignores_zero_negative_weights() {
        let mut accumulator = create_animation_sample_accumulator(2, false);
        accumulate_animation_sample(&mut accumulator, &[2.0, 4.0], 2.0);
        accumulate_animation_sample(&mut accumulator, &[100.0, 100.0], 0.0);
        assert_eq!(accumulator.values, vec![4.0, 8.0]);
        assert_eq!(accumulator.weight, 2.0);
    }

    #[test]
    fn aligns_equivalent_quaternion_hemispheres() {
        let sqrt1_2: f32 = std::f32::consts::FRAC_1_SQRT_2;
        let mut accumulator = create_animation_sample_accumulator(4, true);
        accumulate_animation_sample(&mut accumulator, &[0.0, 0.0, sqrt1_2, sqrt1_2], 1.0);
        accumulate_animation_sample(&mut accumulator, &[0.0, 0.0, -sqrt1_2, -sqrt1_2], 1.0);
        let mut out = [0.0, 0.0, 0.0, 0.0];
        assert!(finish_animation_sample(&mut out, &accumulator));
        assert!((out[2] - sqrt1_2).abs() < 1e-5);
        assert!((out[3] - sqrt1_2).abs() < 1e-5);
    }
}

mod add_animation_sample {
    use super::*;

    #[test]
    fn adds_weighted_scalar_vector_deltas() {
        let base = [1.0, 2.0, 3.0];
        let mut out = [0.0, 0.0, 0.0];
        add_animation_sample(&mut out, &base, &[2.0, -2.0, 4.0], 0.5, false);
        assert_eq!(out, [2.0, 1.0, 5.0]);
    }

    #[test]
    fn multiplies_a_weighted_quaternion_delta_onto_the_base() {
        let half_turn_z = [0.0, 0.0, 1.0, 0.0];
        let mut out = [0.0, 0.0, 0.0, 0.0];
        add_animation_sample(&mut out, &[0.0, 0.0, 0.0, 1.0], &half_turn_z, 0.5, true);
        let sqrt1_2: f32 = std::f32::consts::FRAC_1_SQRT_2;
        assert!((out[2] - sqrt1_2).abs() < 1e-5);
        assert!((out[3] - sqrt1_2).abs() < 1e-5);
    }
}

mod blend_animation_samples {
    use super::*;

    #[test]
    fn linearly_blends_components_and_clamps_alpha() {
        let mut out = [0.0, 0.0];
        blend_animation_samples(&mut out, &[0.0, 10.0], &[10.0, 20.0], 0.25, false);
        assert_eq!(out, [2.5, 12.5]);
        blend_animation_samples(&mut out, &[0.0, 10.0], &[10.0, 20.0], 2.0, false);
        assert_eq!(out, [10.0, 20.0]);
    }

    #[test]
    fn slerps_quaternions_over_the_shortest_arc() {
        let mut out = [0.0, 0.0, 0.0, 0.0];
        blend_animation_samples(
            &mut out,
            &[0.0, 0.0, 0.0, 1.0],
            &[0.0, 0.0, -1.0, 0.0],
            0.5,
            true,
        );
        let sqrt1_2: f32 = std::f32::consts::FRAC_1_SQRT_2;
        assert!((out[2].abs() - sqrt1_2).abs() < 1e-5);
        assert!((out[3].abs() - sqrt1_2).abs() < 1e-5);
    }
}

mod create_animation_sample_accumulator {
    use super::*;

    #[test]
    fn creates_an_accumulator_with_zeroed_component_buffer() {
        let accumulator = create_animation_sample_accumulator(3, false);
        assert_eq!(accumulator.components, 3);
        assert_eq!(accumulator.values, vec![0.0, 0.0, 0.0]);
        assert_eq!(accumulator.weight, 0.0);
    }
}

mod finish_animation_sample {
    use super::*;

    #[test]
    fn normalizes_scalar_vector_sums_by_total_weight() {
        let mut accumulator = create_animation_sample_accumulator(2, false);
        accumulate_animation_sample(&mut accumulator, &[0.0, 10.0], 1.0);
        accumulate_animation_sample(&mut accumulator, &[10.0, 20.0], 3.0);
        let mut out = [0.0, 0.0];
        assert!(finish_animation_sample(&mut out, &accumulator));
        assert_eq!(out, [7.5, 17.5]);
    }

    #[test]
    fn returns_false_and_preserves_output_for_an_empty_accumulator() {
        let mut out = [7.0];
        assert!(!finish_animation_sample(
            &mut out,
            &create_animation_sample_accumulator(1, false)
        ));
        assert_eq!(out, [7.0]);
    }
}

mod initialize_animation_sample_accumulator {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_animation_sample_accumulator() {
        let _ = initialize_animation_sample_accumulator
            as fn(&mut AnimationSampleAccumulator, usize, bool);
    }
}

mod reset_animation_sample_accumulator {
    use super::*;

    #[test]
    fn clears_state_while_retaining_the_owned_buffer() {
        let mut accumulator = create_animation_sample_accumulator(2, false);
        accumulate_animation_sample(&mut accumulator, &[2.0, 4.0], 1.0);
        reset_animation_sample_accumulator(&mut accumulator);
        assert_eq!(accumulator.values, vec![0.0, 0.0]);
        assert_eq!(accumulator.weight, 0.0);
    }
}
