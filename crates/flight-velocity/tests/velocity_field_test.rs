use flight_velocity::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod add_velocity {
    use super::*;

    #[test]
    fn adds_two_velocity_vectors() {
        let a = create_velocity2d(1.0, 2.0);
        let b = create_velocity2d(3.0, 4.0);
        let mut out = create_velocity2d(0.0, 0.0);
        add_velocity(&mut out, &a, &b);
        assert_eq!(out.x, 4.0);
        assert_eq!(out.y, 6.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_a() {
        let mut a = create_velocity2d(5.0, 3.0);
        let a_clone = clone_velocity2d(&a);
        add_velocity(&mut a, &a_clone, &create_velocity2d(1.0, 1.0));
        assert_eq!(a.x, 6.0);
        assert_eq!(a.y, 4.0);
    }
}

mod begin_velocity_frame {
    use super::*;

    #[test]
    fn advances_the_frame_id() {
        let mut field = create_velocity_field();
        let before = field.frame_id;
        begin_velocity_frame(&mut field);
        assert_eq!(field.frame_id, before + 1);
    }
}

mod clamp_velocity {
    use super::*;

    #[test]
    fn returns_velocity_unchanged_when_length_is_within_max_length() {
        let mut out = create_velocity2d(0.0, 0.0);
        clamp_velocity(&mut out, &create_velocity2d(3.0, 0.0), 5.0);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn clamps_to_max_length_when_length_exceeds_max_length() {
        let mut out = create_velocity2d(0.0, 0.0);
        clamp_velocity(&mut out, &create_velocity2d(10.0, 0.0), 5.0);
        assert_approx(out.x, 5.0);
        assert_approx(out.y, 0.0);
    }

    #[test]
    fn clamps_a_diagonal_velocity_to_max_length() {
        let mut out = create_velocity2d(0.0, 0.0);
        clamp_velocity(&mut out, &create_velocity2d(3.0, 4.0), 2.5);
        assert_approx(length_of_velocity(&out), 2.5);
    }

    #[test]
    fn is_alias_safe_when_out_equals_velocity() {
        let mut v = create_velocity2d(10.0, 0.0);
        let v_clone = clone_velocity2d(&v);
        clamp_velocity(&mut v, &v_clone, 5.0);
        assert_approx(v.x, 5.0);
        assert_approx(v.y, 0.0);
    }

    #[test]
    fn handles_zero_length_velocity_without_division_error() {
        let mut out = create_velocity2d(0.0, 0.0);
        clamp_velocity(&mut out, &create_velocity2d(0.0, 0.0), 5.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod clone_velocity2d {
    use super::*;

    #[test]
    fn creates_a_copy_of_a_velocity() {
        let v = create_velocity2d(3.0, -7.0);
        let result = clone_velocity2d(&v);
        assert_eq!(result.x, v.x);
        assert_eq!(result.y, v.y);
    }
}

mod contribute_velocity {
    use super::*;

    #[test]
    fn records_an_explicit_velocity_readable_this_frame() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 3.0, -4.0);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, -4.0);
    }

    #[test]
    fn accepts_any_source_id() {
        let mut field = create_velocity_field();
        let source_id: u64 = 42;
        contribute_velocity(&mut field, source_id, 1.0, 2.0);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }
}

mod copy_velocity {
    use super::*;

    #[test]
    fn copies_x_and_y() {
        let source = create_velocity2d(5.0, -3.0);
        let mut out = create_velocity2d(0.0, 0.0);
        copy_velocity(&mut out, &source);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, -3.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_source() {
        let mut v = create_velocity2d(7.0, 2.0);
        let v_clone = clone_velocity2d(&v);
        copy_velocity(&mut v, &v_clone);
        assert_eq!(v.x, 7.0);
        assert_eq!(v.y, 2.0);
    }
}

mod create_velocity2d {
    use super::*;

    #[test]
    fn returns_a_velocity2d_with_specified_values() {
        let v = create_velocity2d(3.0, -7.0);
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, -7.0);
    }
}

mod create_velocity_explanation {
    use super::*;

    #[test]
    fn returns_a_velocity_explanation_with_specified_values() {
        let e = create_velocity_explanation(5, true, 4, VelocityReason::Ok, 1.0, 2.0);
        assert_eq!(e.current_frame_id, 5);
        assert_eq!(e.explicit, true);
        assert_eq!(e.last_frame_id, 4);
        assert_eq!(e.reason, VelocityReason::Ok);
        assert_eq!(e.x, 1.0);
        assert_eq!(e.y, 2.0);
    }
}

mod create_velocity_field {
    use super::*;

    #[test]
    fn starts_at_frame_zero_and_returns_zero_for_unknown_sources() {
        let field = create_velocity_field();
        assert_eq!(field.frame_id, 0);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity(&field, 999, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod create_velocity_sample {
    use super::*;

    #[test]
    fn returns_a_velocity_sample_with_default_values() {
        let sample = create_velocity_sample();
        assert_eq!(sample.previous_world_transform, None);
        assert_eq!(sample.velocity.x, 0.0);
        assert_eq!(sample.velocity.y, 0.0);
        assert_eq!(sample.last_frame_id, -1);
        assert_eq!(sample.explicit_frame_id, -1);
    }
}

mod damp_velocity {
    use super::*;

    #[test]
    fn returns_current_at_factor_one() {
        let mut out = create_velocity2d(0.0, 0.0);
        damp_velocity(
            &mut out,
            &create_velocity2d(10.0, 5.0),
            &create_velocity2d(0.0, 0.0),
            1.0,
        );
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 5.0);
    }

    #[test]
    fn returns_previous_at_factor_zero() {
        let mut out = create_velocity2d(0.0, 0.0);
        damp_velocity(
            &mut out,
            &create_velocity2d(10.0, 5.0),
            &create_velocity2d(2.0, 3.0),
            0.0,
        );
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn blends_at_factor_half() {
        let mut out = create_velocity2d(0.0, 0.0);
        damp_velocity(
            &mut out,
            &create_velocity2d(10.0, 0.0),
            &create_velocity2d(0.0, 0.0),
            0.5,
        );
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_current() {
        let mut current = create_velocity2d(10.0, 0.0);
        let current_clone = clone_velocity2d(&current);
        damp_velocity(
            &mut current,
            &current_clone,
            &create_velocity2d(0.0, 0.0),
            0.5,
        );
        assert_eq!(current.x, 5.0);
        assert_eq!(current.y, 0.0);
    }
}

mod ensure_velocity_sample {
    use super::*;

    #[test]
    fn returns_the_same_sample_on_repeat_calls() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        {
            let sample = ensure_velocity_sample(&mut field, source_id);
            sample.velocity.x = 42.0;
        }
        {
            let sample = ensure_velocity_sample(&mut field, source_id);
            assert_eq!(sample.velocity.x, 42.0);
        }
    }
}

mod explain_velocity {
    use super::*;

    #[test]
    fn reports_no_sample_for_an_unknown_source() {
        let field = create_velocity_field();
        let result = explain_velocity(&field, 999);
        assert_eq!(result.reason, VelocityReason::NoSample);
    }

    #[test]
    fn reports_stale_when_the_sample_was_not_touched_this_frame() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 5.0, 5.0);
        begin_velocity_frame(&mut field);
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::Stale);
    }

    #[test]
    fn reports_explicit_zero_for_a_suppressed_velocity() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        suppress_velocity(&mut field, source_id);
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::ExplicitZero);
        assert_eq!(result.explicit, true);
    }

    #[test]
    fn reports_derived_zero_when_the_transform_baseline_produces_zero() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        let frame_id = field.frame_id;
        let sample = ensure_velocity_sample(&mut field, source_id);
        sample.velocity.x = 0.0;
        sample.velocity.y = 0.0;
        sample.last_frame_id = frame_id;
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::DerivedZero);
        assert_eq!(result.explicit, false);
    }

    #[test]
    fn reports_ok_with_velocity_values_for_a_contributing_source() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 3.0, -4.0);
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::Ok);
        assert_eq!(result.x, 3.0);
        assert_eq!(result.y, -4.0);
        assert_eq!(result.explicit, true);
    }

    #[test]
    fn reports_ok_with_explicit_false_for_a_derived_nonzero_velocity() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        let frame_id = field.frame_id;
        let sample = ensure_velocity_sample(&mut field, source_id);
        sample.velocity.x = 7.0;
        sample.velocity.y = -2.0;
        sample.last_frame_id = frame_id;
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::Ok);
        assert_eq!(result.x, 7.0);
        assert_eq!(result.y, -2.0);
        assert_eq!(result.explicit, false);
    }
}

mod get_velocity {
    use super::*;

    #[test]
    fn returns_zero_once_the_sample_is_stale_after_the_frame_advances() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 5.0, 5.0);
        begin_velocity_frame(&mut field);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod has_velocity {
    use super::*;

    #[test]
    fn is_true_for_nonzero_velocity_and_false_for_suppressed() {
        let mut field = create_velocity_field();
        let moving_id: u64 = 1;
        let still_id: u64 = 2;
        contribute_velocity(&mut field, moving_id, 1.0, 0.0);
        suppress_velocity(&mut field, still_id);
        assert_eq!(has_velocity(&field, moving_id), true);
        assert_eq!(has_velocity(&field, still_id), false);
    }
}

mod initialize_velocity2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_velocity2d() {
        let mut v = create_velocity2d(0.0, 0.0);
        initialize_velocity2d(&mut v, 3.0, 7.0);
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 7.0);
    }
}

mod initialize_velocity_explanation {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_velocity_explanation() {
        let mut e = create_velocity_explanation(0, false, 0, VelocityReason::NoSample, 0.0, 0.0);
        initialize_velocity_explanation(&mut e, 5, true, 4, VelocityReason::Ok, 1.0, 2.0);
        assert_eq!(e.current_frame_id, 5);
        assert_eq!(e.explicit, true);
        assert_eq!(e.last_frame_id, 4);
        assert_eq!(e.reason, VelocityReason::Ok);
        assert_eq!(e.x, 1.0);
        assert_eq!(e.y, 2.0);
    }
}

mod initialize_velocity_field {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_velocity_field() {
        let mut field = create_velocity_field();
        initialize_velocity_field(&mut field);
        assert_eq!(field.frame_id, 0);
    }
}

mod initialize_velocity_sample {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_velocity_sample() {
        let mut sample = create_velocity_sample();
        initialize_velocity_sample(&mut sample);
        assert_eq!(sample.previous_world_transform, None);
        assert_eq!(sample.velocity.x, 0.0);
        assert_eq!(sample.velocity.y, 0.0);
        assert_eq!(sample.last_frame_id, -1);
        assert_eq!(sample.explicit_frame_id, -1);
    }
}

mod is_velocity_zero {
    use super::*;

    #[test]
    fn returns_true_for_exact_zero() {
        assert_eq!(is_velocity_zero(&create_velocity2d(0.0, 0.0), 0.0), true);
    }

    #[test]
    fn returns_false_for_nonzero() {
        assert_eq!(is_velocity_zero(&create_velocity2d(0.001, 0.0), 0.0), false);
    }

    #[test]
    fn respects_epsilon() {
        assert_eq!(is_velocity_zero(&create_velocity2d(0.001, 0.0), 0.01), true);
        assert_eq!(is_velocity_zero(&create_velocity2d(0.1, 0.0), 0.01), false);
    }
}

mod length_of_velocity {
    use super::*;

    #[test]
    fn returns_the_magnitude_of_the_velocity_vector() {
        assert_approx(length_of_velocity(&create_velocity2d(3.0, 4.0)), 5.0);
    }

    #[test]
    fn returns_zero_for_zero_vector() {
        assert_eq!(length_of_velocity(&create_velocity2d(0.0, 0.0)), 0.0);
    }
}

mod lerp_velocity {
    use super::*;

    #[test]
    fn returns_a_at_t_zero() {
        let mut out = create_velocity2d(0.0, 0.0);
        lerp_velocity(
            &mut out,
            &create_velocity2d(1.0, 2.0),
            &create_velocity2d(9.0, 8.0),
            0.0,
        );
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn returns_b_at_t_one() {
        let mut out = create_velocity2d(0.0, 0.0);
        lerp_velocity(
            &mut out,
            &create_velocity2d(1.0, 2.0),
            &create_velocity2d(9.0, 8.0),
            1.0,
        );
        assert_eq!(out.x, 9.0);
        assert_eq!(out.y, 8.0);
    }

    #[test]
    fn interpolates_at_t_half() {
        let mut out = create_velocity2d(0.0, 0.0);
        lerp_velocity(
            &mut out,
            &create_velocity2d(0.0, 0.0),
            &create_velocity2d(10.0, 4.0),
            0.5,
        );
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_a() {
        let mut a = create_velocity2d(0.0, 0.0);
        let a_clone = clone_velocity2d(&a);
        lerp_velocity(&mut a, &a_clone, &create_velocity2d(10.0, 0.0), 0.5);
        assert_eq!(a.x, 5.0);
        assert_eq!(a.y, 0.0);
    }
}

mod normalize_velocity {
    use super::*;

    #[test]
    fn returns_unit_vector_for_nonzero_input() {
        let mut out = create_velocity2d(0.0, 0.0);
        normalize_velocity(&mut out, &create_velocity2d(3.0, 4.0));
        assert_approx(length_of_velocity(&out), 1.0);
        assert_approx(out.x, 0.6);
        assert_approx(out.y, 0.8);
    }

    #[test]
    fn returns_zero_vector_for_zero_input() {
        let mut out = create_velocity2d(0.0, 0.0);
        normalize_velocity(&mut out, &create_velocity2d(0.0, 0.0));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_source() {
        let mut v = create_velocity2d(5.0, 0.0);
        let v_clone = clone_velocity2d(&v);
        normalize_velocity(&mut v, &v_clone);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 0.0);
    }
}

mod scale_velocity {
    use super::*;

    #[test]
    fn scales_by_a_factor() {
        let mut out = create_velocity2d(0.0, 0.0);
        scale_velocity(&mut out, &create_velocity2d(3.0, -2.0), 2.0);
        assert_eq!(out.x, 6.0);
        assert_eq!(out.y, -4.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_velocity() {
        let mut v = create_velocity2d(4.0, 2.0);
        let v_clone = clone_velocity2d(&v);
        scale_velocity(&mut v, &v_clone, 0.5);
        assert_eq!(v.x, 2.0);
        assert_eq!(v.y, 1.0);
    }
}

mod subtract_velocity {
    use super::*;

    #[test]
    fn subtracts_b_from_a() {
        let mut out = create_velocity2d(0.0, 0.0);
        subtract_velocity(
            &mut out,
            &create_velocity2d(5.0, 3.0),
            &create_velocity2d(2.0, 1.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_a() {
        let mut a = create_velocity2d(5.0, 3.0);
        let a_clone = clone_velocity2d(&a);
        subtract_velocity(&mut a, &a_clone, &create_velocity2d(2.0, 1.0));
        assert_eq!(a.x, 3.0);
        assert_eq!(a.y, 2.0);
    }
}

mod suppress_velocity {
    use super::*;

    #[test]
    fn zeroes_a_previously_set_velocity() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 9.0, 9.0);
        suppress_velocity(&mut field, source_id);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod zero_velocity {
    use super::*;

    #[test]
    fn sets_both_components_to_zero() {
        let mut v = create_velocity2d(5.0, -3.0);
        zero_velocity(&mut v);
        assert_eq!(v.x, 0.0);
        assert_eq!(v.y, 0.0);
    }
}
