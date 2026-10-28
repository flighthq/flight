use flight_entity::get_entity_id;
use flight_spring::contract::*;

fn spring_config(frequency: f32, damping_ratio: f32) -> SpringConfig {
    return create_spring_config(frequency, damping_ratio);
}

fn assert_close(actual: f32, expected: f32, digits: i32) {
    let diff = (actual - expected).abs();
    let ts_bound = 0.5 * 10.0_f32.powi(-digits);
    let limit = ts_bound.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        diff <= limit,
        "expected {expected}, got {actual} (diff: {diff}, limit: {limit})"
    );
}

fn step_critical_band_spring(damping_ratio: f32) -> Spring {
    let mut spring = create_spring(4.0, -3.0);
    update_spring(&mut spring, -2.0, &spring_config(3.0, damping_ratio), 0.2);
    return spring;
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
        let mut spring = create_spring(7.0, -3.0);
        let id = get_entity_id(&spring);
        initialize_spring(&mut spring, 0.0, 0.0);
        assert_eq!(spring.value, 0.0);
        assert_eq!(spring.velocity, 0.0);
        assert_eq!(get_entity_id(&spring), id);
    }
}

mod is_spring_settled {
    use super::*;

    #[test]
    fn is_false_while_the_spring_is_still_moving_toward_the_target() {
        let mut spring = create_spring(0.0, 0.0);
        let config = spring_config(1.0, 1.0);
        update_spring(&mut spring, 10.0, &config, 1.0 / 60.0);
        assert!(!is_spring_settled(&spring, 10.0, None, None));
    }

    #[test]
    fn is_true_once_the_spring_rests_at_the_target() {
        let mut spring = create_spring(0.0, 0.0);
        let config = spring_config(4.0, 1.0);
        for _ in 0..600 {
            update_spring(&mut spring, 10.0, &config, 1.0 / 60.0);
        }
        assert!(is_spring_settled(&spring, 10.0, None, None));
    }

    #[test]
    fn is_false_at_the_target_when_velocity_is_still_high() {
        let spring = create_spring(10.0, 50.0);
        assert!(!is_spring_settled(&spring, 10.0, None, None));
    }

    #[test]
    fn is_false_when_at_rest_but_away_from_the_target() {
        let spring = create_spring(3.0, 0.0);
        assert!(!is_spring_settled(&spring, 10.0, None, None));
    }

    #[test]
    fn never_settles_while_an_undamped_spring_keeps_oscillating() {
        let mut spring = create_spring(0.0, 0.0);
        let config = spring_config(1.0, 0.0);
        for _ in 0..600 {
            update_spring(&mut spring, 10.0, &config, 1.0 / 60.0);
            assert!(!is_spring_settled(&spring, 10.0, None, None));
        }
    }

    #[test]
    fn honors_custom_epsilons() {
        let spring = create_spring(10.4, 0.4);
        assert!(!is_spring_settled(&spring, 10.0, None, None));
        assert!(is_spring_settled(&spring, 10.0, Some(0.5), Some(0.5)));
    }
}

mod reset_spring {
    use super::*;

    #[test]
    fn snaps_value_and_velocity() {
        let mut spring = create_spring(3.0, 9.0);
        reset_spring(&mut spring, 100.0, None);
        assert_eq!(spring.value, 100.0);
        assert_eq!(spring.velocity, 0.0);
    }

    #[test]
    fn sets_an_explicit_velocity() {
        let mut spring = create_spring(0.0, 0.0);
        reset_spring(&mut spring, -5.0, Some(12.0));
        assert_eq!(spring.value, -5.0);
        assert_eq!(spring.velocity, 12.0);
    }
}

mod update_spring {
    use super::*;

    #[test]
    fn uses_the_critical_solution_exactly_at_and_inside_critical_band() {
        let critical_band: f32 = 1e-4;

        let critical = step_critical_band_spring(1.0);
        let lower_edge = step_critical_band_spring(1.0 - critical_band);
        assert_eq!(lower_edge.value, critical.value);
        assert_eq!(lower_edge.velocity, critical.velocity);
        let lower_inside = step_critical_band_spring(1.0 - critical_band * 0.5);
        assert_eq!(lower_inside.value, critical.value);
        assert_eq!(lower_inside.velocity, critical.velocity);
        let upper_inside = step_critical_band_spring(1.0 + critical_band * 0.5);
        assert_eq!(upper_inside.value, critical.value);
        assert_eq!(upper_inside.velocity, critical.velocity);
        let upper_edge = step_critical_band_spring(1.0 + critical_band);
        assert_eq!(upper_edge.value, critical.value);
        assert_eq!(upper_edge.velocity, critical.velocity);

        let underdamped = step_critical_band_spring(1.0 - critical_band * 2.0);
        let overdamped = step_critical_band_spring(1.0 + critical_band * 2.0);
        assert!(underdamped.value != critical.value || underdamped.velocity != critical.velocity);
        assert!(overdamped.value != critical.value || overdamped.velocity != critical.velocity);
        assert_close(underdamped.value, critical.value, 3);
        assert_close(underdamped.velocity, critical.velocity, 2);
        assert_close(overdamped.value, critical.value, 3);
        assert_close(overdamped.velocity, critical.velocity, 2);
    }

    #[test]
    fn converges_monotonically_to_the_target_with_no_overshoot_when_critically_damped() {
        let mut spring = create_spring(0.0, 0.0);
        let config = spring_config(1.0, 1.0);
        let target: f32 = 10.0;

        let mut previous = spring.value;
        for _ in 0..600 {
            update_spring(&mut spring, target, &config, 1.0 / 60.0);
            assert!(
                spring.value >= previous - 1e-9,
                "value decreased: {} -> {}",
                previous,
                spring.value
            );
            assert!(
                spring.value <= target + 1e-9,
                "value overshot target: {} > {}",
                spring.value,
                target
            );
            previous = spring.value;
        }
        assert_close(spring.value, target, 3);
        assert!(is_spring_settled(&spring, target, None, None));
    }

    #[test]
    fn overshoots_the_target_at_least_once_then_settles_when_underdamped() {
        let mut spring = create_spring(0.0, 0.0);
        let config = spring_config(1.0, 0.3);
        let target: f32 = 10.0;

        let mut overshot = false;
        for _ in 0..2000 {
            update_spring(&mut spring, target, &config, 1.0 / 60.0);
            if spring.value > target + 0.05 {
                overshot = true;
            }
        }
        assert!(overshot);
        assert!(is_spring_settled(&spring, target, None, None));
    }

    #[test]
    fn converges_slowly_without_overshoot_when_overdamped() {
        let mut under_target = create_spring(0.0, 0.0);
        let config = spring_config(1.0, 2.0);
        let target: f32 = 10.0;

        let mut previous = under_target.value;
        for _ in 0..120 {
            update_spring(&mut under_target, target, &config, 1.0 / 60.0);
            assert!(
                under_target.value >= previous - 1e-9,
                "value decreased: {} -> {}",
                previous,
                under_target.value
            );
            assert!(
                under_target.value <= target + 1e-9,
                "value overshot target: {} > {}",
                under_target.value,
                target
            );
            previous = under_target.value;
        }

        let mut critical = create_spring(0.0, 0.0);
        let critical_config = spring_config(1.0, 1.0);
        for _ in 0..120 {
            update_spring(&mut critical, target, &critical_config, 1.0 / 60.0);
        }
        assert!(under_target.value < critical.value);
    }

    #[test]
    fn stays_finite_and_bounded_for_a_stiff_spring_stepped_at_a_huge_delta_time() {
        let mut spring = create_spring(0.0, 0.0);
        let config = spring_config(1000.0, 1.0);
        let target: f32 = 10.0;

        update_spring(&mut spring, target, &config, 1.0);
        assert!(spring.value.is_finite());
        assert!(spring.velocity.is_finite());
        assert_eq!(spring.value, target);
        assert_eq!(spring.velocity, 0.0);
    }

    #[test]
    fn stays_finite_for_a_stiff_underdamped_spring_stepped_repeatedly_at_a_huge_delta_time() {
        let mut spring = create_spring(0.0, 0.0);
        let config = spring_config(1000.0, 0.5);
        let target: f32 = 10.0;

        for _ in 0..50 {
            update_spring(&mut spring, target, &config, 1.0);
            assert!(spring.value.is_finite());
            assert!(spring.velocity.is_finite());
            assert!(spring.value.abs() < 100.0);
        }
        assert!(is_spring_settled(&spring, target, None, None));
    }

    #[test]
    fn is_frame_rate_independent_for_a_constant_target() {
        let config = spring_config(2.0, 0.5);
        let target: f32 = 7.0;

        let mut fine = create_spring(0.0, 3.0);
        for _ in 0..60 {
            update_spring(&mut fine, target, &config, 1.0 / 60.0);
        }

        let mut coarse = create_spring(0.0, 3.0);
        update_spring(&mut coarse, target, &config, 1.0);

        assert!((fine.value - coarse.value).abs() <= 5e-7);
    }

    #[test]
    fn is_a_no_op_for_delta_time_less_than_or_equal_to_zero() {
        let mut spring = create_spring(4.0, 2.0);
        let config = spring_config(1.0, 1.0);

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
        update_spring(&mut spring, 100.0, &spring_config(0.0, 1.0), 1.0 / 60.0);
        assert_eq!(spring.value, 4.0);
        assert_eq!(spring.velocity, 2.0);
    }

    #[test]
    fn reads_value_and_velocity_before_writing() {
        let mut spring = create_spring(5.0, 2.0);
        let mut reference = create_spring(5.0, 2.0);
        let config = spring_config(3.0, 0.7);

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
        let config = spring_config(2.0, 1.0);

        let mut forward = create_spring(359.0, 0.0);
        let mut forward_reference = create_spring(359.0, 0.0);
        update_spring_angle(&mut forward, 1.0, 360.0, &config, 1.0 / 60.0);
        update_spring(&mut forward_reference, 361.0, &config, 1.0 / 60.0);
        assert_eq!(forward.value, forward_reference.value);
        assert_eq!(forward.velocity, forward_reference.velocity);

        let mut reverse = create_spring(1.0, 0.0);
        let mut reverse_reference = create_spring(1.0, 0.0);
        update_spring_angle(&mut reverse, 359.0, 360.0, &config, 1.0 / 60.0);
        update_spring(&mut reverse_reference, -1.0, &config, 1.0 / 60.0);
        assert_eq!(reverse.value, reverse_reference.value);
        assert_eq!(reverse.velocity, reverse_reference.velocity);
    }

    #[test]
    fn uses_caller_selected_units_and_resolves_exact_half_turn_ties_positively() {
        let config = spring_config(2.0, 1.0);
        let mut spring = create_spring(0.0, 0.0);
        let mut reference = create_spring(0.0, 0.0);

        update_spring_angle(&mut spring, -0.5, 1.0, &config, 1.0 / 60.0);
        update_spring(&mut reference, 0.5, &config, 1.0 / 60.0);

        assert_eq!(spring.value, reference.value);
        assert_eq!(spring.velocity, reference.velocity);
    }
}
