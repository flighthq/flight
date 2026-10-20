use flight_spring::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-3,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod add_spring_impulse {
    use super::*;

    #[test]
    fn adds_velocity_without_changing_position_and_composes_repeated_impulses() {
        let mut spring = create_spring(12.0, 3.0);

        add_spring_impulse(&mut spring, 4.0);
        add_spring_impulse(&mut spring, -1.5);

        assert_eq!(spring.value, 12.0);
        assert_eq!(spring.velocity, 5.5);
    }
}

mod create_spring {
    use super::*;

    #[test]
    fn returns_a_spring_with_zero_value_and_velocity() {
        let spring = create_spring(0.0, 0.0);
        assert_eq!(spring.value, 0.0);
        assert_eq!(spring.velocity, 0.0);
    }

    #[test]
    fn sets_the_provided_value_and_velocity() {
        let spring = create_spring(5.0, -2.0);
        assert_eq!(spring.value, 5.0);
        assert_eq!(spring.velocity, -2.0);
    }
}

mod initialize_spring {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_spring() {
        let mut spring = create_spring(0.0, 0.0);
        initialize_spring(&mut spring, 7.0, -3.0);
        assert_eq!(spring.value, 7.0);
        assert_eq!(spring.velocity, -3.0);
    }
}

mod is_spring_settled {
    use super::*;

    #[test]
    fn is_false_while_the_spring_is_still_moving_toward_the_target() {
        let mut spring = create_spring(0.0, 0.0);
        let config = create_spring_config(1.0, 1.0);
        update_spring(&mut spring, 10.0, &config, 1.0 / 60.0);
        assert!(!is_spring_settled(
            &spring,
            10.0,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
    }

    #[test]
    fn is_true_once_the_spring_rests_at_the_target() {
        let mut spring = create_spring(0.0, 0.0);
        let config = create_spring_config(4.0, 1.0);
        for _ in 0..600 {
            update_spring(&mut spring, 10.0, &config, 1.0 / 60.0);
        }
        assert!(is_spring_settled(
            &spring,
            10.0,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
    }

    #[test]
    fn is_false_at_the_target_when_velocity_is_still_high() {
        let spring = create_spring(10.0, 50.0);
        assert!(!is_spring_settled(
            &spring,
            10.0,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
    }

    #[test]
    fn is_false_when_at_rest_but_away_from_the_target() {
        let spring = create_spring(3.0, 0.0);
        assert!(!is_spring_settled(
            &spring,
            10.0,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
    }

    #[test]
    fn never_settles_while_an_undamped_spring_keeps_oscillating() {
        let mut spring = create_spring(0.0, 0.0);
        let config = create_spring_config(1.0, 0.0);
        for _ in 0..600 {
            update_spring(&mut spring, 10.0, &config, 1.0 / 60.0);
            assert!(!is_spring_settled(
                &spring,
                10.0,
                SPRING_SETTLE_EPSILON,
                SPRING_SETTLE_EPSILON
            ));
        }
    }

    #[test]
    fn honors_custom_epsilons() {
        let spring = create_spring(10.4, 0.4);
        assert!(!is_spring_settled(
            &spring,
            10.0,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
        assert!(is_spring_settled(&spring, 10.0, 0.5, 0.5));
    }
}

mod reset_spring {
    use super::*;

    #[test]
    fn snaps_value_and_velocity() {
        let mut spring = create_spring(3.0, 9.0);
        reset_spring(&mut spring, 100.0, 0.0);
        assert_eq!(spring.value, 100.0);
        assert_eq!(spring.velocity, 0.0);
    }

    #[test]
    fn sets_an_explicit_velocity() {
        let mut spring = create_spring(0.0, 0.0);
        reset_spring(&mut spring, -5.0, 12.0);
        assert_eq!(spring.value, -5.0);
        assert_eq!(spring.velocity, 12.0);
    }
}

mod update_spring {
    use super::*;

    #[test]
    fn preserves_oscillation_energy_when_damping_ratio_is_exactly_zero() {
        let frequency: f32 = 2.0;
        let target: f32 = 3.0;
        let mut spring = create_spring(7.0, -4.0);
        let config = create_spring_config(frequency, 0.0);
        let omega = std::f32::consts::TAU * frequency;
        let initial_energy = spring.velocity * spring.velocity
            + omega * omega * (spring.value - target) * (spring.value - target);

        for _ in 0..600 {
            update_spring(&mut spring, target, &config, 1.0 / 60.0);
        }

        let final_energy = spring.velocity * spring.velocity
            + omega * omega * (spring.value - target) * (spring.value - target);
        let relative_error = ((final_energy - initial_energy) / initial_energy).abs();
        assert!(
            relative_error < 1e-2,
            "energy drift too large: initial={initial_energy}, final={final_energy}, \
             relative_error={relative_error}"
        );
    }

    #[test]
    fn uses_the_critical_solution_exactly_at_and_inside_critical_band() {
        let critical_band: f32 = 1e-4;

        fn step(damping_ratio: f32) -> (f32, f32) {
            let mut spring = create_spring(4.0, -3.0);
            update_spring(
                &mut spring,
                -2.0,
                &create_spring_config(3.0, damping_ratio),
                0.2,
            );
            (spring.value, spring.velocity)
        }

        let critical = step(1.0);
        assert_eq!(step(1.0 - critical_band), critical);
        assert_eq!(step(1.0 - critical_band * 0.5), critical);
        assert_eq!(step(1.0 + critical_band * 0.5), critical);
        assert_eq!(step(1.0 + critical_band), critical);

        let underdamped = step(1.0 - critical_band * 2.0);
        let overdamped = step(1.0 + critical_band * 2.0);
        assert_ne!(underdamped, critical);
        assert_ne!(overdamped, critical);
        assert_approx(underdamped.0, critical.0);
        assert!(
            (underdamped.1 - critical.1).abs() < 5e-2,
            "underdamped velocity too far from critical: {} vs {}",
            underdamped.1,
            critical.1
        );
        assert_approx(overdamped.0, critical.0);
        assert!(
            (overdamped.1 - critical.1).abs() < 5e-2,
            "overdamped velocity too far from critical: {} vs {}",
            overdamped.1,
            critical.1
        );
    }

    #[test]
    fn converges_monotonically_to_the_target_with_no_overshoot_when_critically_damped() {
        let mut spring = create_spring(0.0, 0.0);
        let config = create_spring_config(1.0, 1.0);
        let target: f32 = 10.0;

        let mut previous = spring.value;
        for _ in 0..600 {
            update_spring(&mut spring, target, &config, 1.0 / 60.0);
            assert!(
                spring.value >= previous - 1e-6,
                "value decreased: {} -> {}",
                previous,
                spring.value
            );
            assert!(
                spring.value <= target + 1e-6,
                "value overshot target: {} > {}",
                spring.value,
                target
            );
            previous = spring.value;
        }
        assert_approx(spring.value, target);
        assert!(is_spring_settled(
            &spring,
            target,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
    }

    #[test]
    fn overshoots_the_target_at_least_once_then_settles_when_underdamped() {
        let mut spring = create_spring(0.0, 0.0);
        let config = create_spring_config(1.0, 0.3);
        let target: f32 = 10.0;

        let mut overshot = false;
        for _ in 0..2000 {
            update_spring(&mut spring, target, &config, 1.0 / 60.0);
            if spring.value > target + 0.05 {
                overshot = true;
            }
        }
        assert!(overshot);
        assert!(is_spring_settled(
            &spring,
            target,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
    }

    #[test]
    fn converges_slowly_without_overshoot_when_overdamped() {
        let mut under_target = create_spring(0.0, 0.0);
        let config = create_spring_config(1.0, 2.0);
        let target: f32 = 10.0;

        let mut previous = under_target.value;
        for _ in 0..120 {
            update_spring(&mut under_target, target, &config, 1.0 / 60.0);
            assert!(
                under_target.value >= previous - 1e-6,
                "value decreased: {} -> {}",
                previous,
                under_target.value
            );
            assert!(
                under_target.value <= target + 1e-6,
                "value overshot target: {} > {}",
                under_target.value,
                target
            );
            previous = under_target.value;
        }

        let mut critical = create_spring(0.0, 0.0);
        let critical_config = create_spring_config(1.0, 1.0);
        for _ in 0..120 {
            update_spring(&mut critical, target, &critical_config, 1.0 / 60.0);
        }
        assert!(under_target.value < critical.value);
    }

    #[test]
    fn stays_finite_and_bounded_for_a_stiff_spring_stepped_at_a_huge_delta_time() {
        let mut spring = create_spring(0.0, 0.0);
        let config = create_spring_config(1000.0, 1.0);
        let target: f32 = 10.0;

        update_spring(&mut spring, target, &config, 1.0);
        assert!(spring.value.is_finite());
        assert!(spring.velocity.is_finite());
        assert_approx(spring.value, target);
        assert_approx(spring.velocity, 0.0);
    }

    #[test]
    fn stays_finite_for_a_stiff_underdamped_spring_stepped_repeatedly_at_a_huge_delta_time() {
        let mut spring = create_spring(0.0, 0.0);
        let config = create_spring_config(1000.0, 0.5);
        let target: f32 = 10.0;

        for _ in 0..50 {
            update_spring(&mut spring, target, &config, 1.0);
            assert!(spring.value.is_finite());
            assert!(spring.velocity.is_finite());
            assert!(spring.value.abs() < 100.0);
        }
        assert!(is_spring_settled(
            &spring,
            target,
            SPRING_SETTLE_EPSILON,
            SPRING_SETTLE_EPSILON
        ));
    }

    #[test]
    fn is_frame_rate_independent_for_a_constant_target() {
        let config = create_spring_config(2.0, 0.5);
        let target: f32 = 7.0;

        let mut fine = create_spring(0.0, 3.0);
        for _ in 0..60 {
            update_spring(&mut fine, target, &config, 1.0 / 60.0);
        }

        let mut coarse = create_spring(0.0, 3.0);
        update_spring(&mut coarse, target, &config, 1.0);

        assert!(
            (fine.value - coarse.value).abs() < 1e-2,
            "values diverged: fine={}, coarse={}",
            fine.value,
            coarse.value
        );
        assert!(
            (fine.velocity - coarse.velocity).abs() < 1e-1,
            "velocities diverged: fine={}, coarse={}",
            fine.velocity,
            coarse.velocity
        );
    }

    #[test]
    fn is_a_no_op_for_delta_time_less_than_or_equal_to_zero() {
        let mut spring = create_spring(4.0, 2.0);
        let config = create_spring_config(1.0, 1.0);

        update_spring(&mut spring, 100.0, &config, 0.0);
        assert_eq!(spring.value, 4.0);
        assert_eq!(spring.velocity, 2.0);

        update_spring(&mut spring, 100.0, &config, -1.0);
        assert_eq!(spring.value, 4.0);
        assert_eq!(spring.velocity, 2.0);
    }

    #[test]
    fn is_inert_for_a_non_positive_frequency() {
        let mut spring = create_spring(4.0, 2.0);
        update_spring(
            &mut spring,
            100.0,
            &create_spring_config(0.0, 1.0),
            1.0 / 60.0,
        );
        assert_eq!(spring.value, 4.0);
        assert_eq!(spring.velocity, 2.0);
    }

    #[test]
    fn reads_value_and_velocity_before_writing() {
        let mut spring = create_spring(5.0, 2.0);
        let mut reference = create_spring(5.0, 2.0);
        let config = create_spring_config(3.0, 0.7);

        update_spring(&mut spring, 0.0, &config, 1.0 / 60.0);
        update_spring(&mut reference, 0.0, &config, 1.0 / 60.0);
        assert_eq!(spring.value, reference.value);
        assert_eq!(spring.velocity, reference.velocity);
        assert_ne!(spring.value, 5.0);
        assert_ne!(spring.velocity, 2.0);
    }
}

mod update_spring_angle {
    use super::*;

    #[test]
    fn takes_the_shortest_path_across_a_degree_seam_in_both_directions() {
        let config = create_spring_config(2.0, 1.0);

        let mut forward = create_spring(359.0, 0.0);
        let mut forward_reference = create_spring(359.0, 0.0);
        update_spring_angle(&mut forward, 1.0, 360.0, &config, 1.0 / 60.0);
        update_spring(&mut forward_reference, 361.0, &config, 1.0 / 60.0);
        assert_approx(forward.value, forward_reference.value);
        assert_approx(forward.velocity, forward_reference.velocity);

        let mut reverse = create_spring(1.0, 0.0);
        let mut reverse_reference = create_spring(1.0, 0.0);
        update_spring_angle(&mut reverse, 359.0, 360.0, &config, 1.0 / 60.0);
        update_spring(&mut reverse_reference, -1.0, &config, 1.0 / 60.0);
        assert_approx(reverse.value, reverse_reference.value);
        assert_approx(reverse.velocity, reverse_reference.velocity);
    }

    #[test]
    fn uses_caller_selected_units_and_resolves_exact_half_turn_ties_positively() {
        let config = create_spring_config(2.0, 1.0);
        let mut spring = create_spring(0.0, 0.0);
        let mut reference = create_spring(0.0, 0.0);

        update_spring_angle(&mut spring, -0.5, 1.0, &config, 1.0 / 60.0);
        update_spring(&mut reference, 0.5, &config, 1.0 / 60.0);

        assert_approx(spring.value, reference.value);
        assert_approx(spring.velocity, reference.velocity);
    }
}
