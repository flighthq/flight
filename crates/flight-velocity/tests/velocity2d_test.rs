use flight_velocity::contract::*;

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
        let a = Velocity2D { x: 1.0, y: 2.0 };
        let b = Velocity2D { x: 3.0, y: 4.0 };
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        add_velocity(&mut out, &a, &b);
        assert_eq!(out.x, 4.0);
        assert_eq!(out.y, 6.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_a() {
        let mut a = Velocity2D { x: 5.0, y: 3.0 };
        let a_clone = clone_velocity2d(&a);
        add_velocity(&mut a, &a_clone, &Velocity2D { x: 1.0, y: 1.0 });
        assert_eq!(a.x, 6.0);
        assert_eq!(a.y, 4.0);
    }
}

mod clamp_velocity {
    use super::*;

    #[test]
    fn returns_velocity_unchanged_when_length_is_within_max_length() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        clamp_velocity(&mut out, &Velocity2D { x: 3.0, y: 0.0 }, 5.0);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn clamps_to_max_length_when_length_exceeds_max_length() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        clamp_velocity(&mut out, &Velocity2D { x: 10.0, y: 0.0 }, 5.0);
        assert_approx(out.x, 5.0);
        assert_approx(out.y, 0.0);
    }

    #[test]
    fn clamps_a_diagonal_velocity_to_max_length() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        clamp_velocity(&mut out, &Velocity2D { x: 3.0, y: 4.0 }, 2.5);
        assert_approx(length_of_velocity(&out), 2.5);
    }

    #[test]
    fn is_alias_safe_when_out_equals_velocity() {
        let mut v = Velocity2D { x: 10.0, y: 0.0 };
        let v_clone = clone_velocity2d(&v);
        clamp_velocity(&mut v, &v_clone, 5.0);
        assert_approx(v.x, 5.0);
        assert_approx(v.y, 0.0);
    }

    #[test]
    fn handles_zero_length_velocity_without_division_error() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        clamp_velocity(&mut out, &Velocity2D { x: 0.0, y: 0.0 }, 5.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod clone_velocity2d {
    use super::*;

    #[test]
    fn creates_a_copy_of_a_velocity() {
        let v = Velocity2D { x: 3.0, y: -7.0 };
        let result = clone_velocity2d(&v);
        assert_eq!(result.x, v.x);
        assert_eq!(result.y, v.y);
    }
}

mod copy_velocity {
    use super::*;

    #[test]
    fn copies_x_and_y() {
        let source = Velocity2D { x: 5.0, y: -3.0 };
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        copy_velocity(&mut out, &source);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, -3.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_source() {
        let mut v = Velocity2D { x: 7.0, y: 2.0 };
        let v_clone = clone_velocity2d(&v);
        copy_velocity(&mut v, &v_clone);
        assert_eq!(v.x, 7.0);
        assert_eq!(v.y, 2.0);
    }
}

mod damp_velocity {
    use super::*;

    #[test]
    fn returns_current_at_factor_one() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        damp_velocity(
            &mut out,
            &Velocity2D { x: 10.0, y: 5.0 },
            &Velocity2D { x: 0.0, y: 0.0 },
            1.0,
        );
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 5.0);
    }

    #[test]
    fn returns_previous_at_factor_zero() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        damp_velocity(
            &mut out,
            &Velocity2D { x: 10.0, y: 5.0 },
            &Velocity2D { x: 2.0, y: 3.0 },
            0.0,
        );
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn blends_at_factor_half() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        damp_velocity(
            &mut out,
            &Velocity2D { x: 10.0, y: 0.0 },
            &Velocity2D { x: 0.0, y: 0.0 },
            0.5,
        );
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_current() {
        let mut current = Velocity2D { x: 10.0, y: 0.0 };
        let current_clone = clone_velocity2d(&current);
        damp_velocity(
            &mut current,
            &current_clone,
            &Velocity2D { x: 0.0, y: 0.0 },
            0.5,
        );
        assert_eq!(current.x, 5.0);
        assert_eq!(current.y, 0.0);
    }
}

mod is_velocity_zero {
    use super::*;

    #[test]
    fn returns_true_for_exact_zero() {
        assert_eq!(
            is_velocity_zero(&Velocity2D { x: 0.0, y: 0.0 }, Some(0.0)),
            true
        );
    }

    #[test]
    fn returns_false_for_nonzero() {
        assert_eq!(
            is_velocity_zero(&Velocity2D { x: 0.001, y: 0.0 }, Some(0.0)),
            false
        );
    }

    #[test]
    fn uses_the_default_epsilon_of_zero_when_none_is_given() {
        assert_eq!(is_velocity_zero(&Velocity2D { x: 0.0, y: 0.0 }, None), true);
        assert_eq!(
            is_velocity_zero(&Velocity2D { x: 0.0001, y: 0.0 }, None),
            false
        );
    }

    #[test]
    fn respects_epsilon() {
        assert_eq!(
            is_velocity_zero(&Velocity2D { x: 0.001, y: 0.0 }, Some(0.01)),
            true
        );
        assert_eq!(
            is_velocity_zero(&Velocity2D { x: 0.1, y: 0.0 }, Some(0.01)),
            false
        );
    }
}

mod length_of_velocity {
    use super::*;

    #[test]
    fn returns_the_magnitude_of_the_velocity_vector() {
        assert_approx(length_of_velocity(&Velocity2D { x: 3.0, y: 4.0 }), 5.0);
    }

    #[test]
    fn returns_zero_for_zero_vector() {
        assert_eq!(length_of_velocity(&Velocity2D { x: 0.0, y: 0.0 }), 0.0);
    }
}

mod lerp_velocity {
    use super::*;

    #[test]
    fn returns_a_at_t_zero() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        lerp_velocity(
            &mut out,
            &Velocity2D { x: 1.0, y: 2.0 },
            &Velocity2D { x: 9.0, y: 8.0 },
            0.0,
        );
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn returns_b_at_t_one() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        lerp_velocity(
            &mut out,
            &Velocity2D { x: 1.0, y: 2.0 },
            &Velocity2D { x: 9.0, y: 8.0 },
            1.0,
        );
        assert_eq!(out.x, 9.0);
        assert_eq!(out.y, 8.0);
    }

    #[test]
    fn interpolates_at_t_half() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        lerp_velocity(
            &mut out,
            &Velocity2D { x: 0.0, y: 0.0 },
            &Velocity2D { x: 10.0, y: 4.0 },
            0.5,
        );
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_a() {
        let mut a = Velocity2D { x: 0.0, y: 0.0 };
        let a_clone = clone_velocity2d(&a);
        lerp_velocity(&mut a, &a_clone, &Velocity2D { x: 10.0, y: 0.0 }, 0.5);
        assert_eq!(a.x, 5.0);
        assert_eq!(a.y, 0.0);
    }
}

mod normalize_velocity {
    use super::*;

    #[test]
    fn returns_unit_vector_for_nonzero_input() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        normalize_velocity(&mut out, &Velocity2D { x: 3.0, y: 4.0 });
        assert_approx(length_of_velocity(&out), 1.0);
        assert_approx(out.x, 0.6);
        assert_approx(out.y, 0.8);
    }

    #[test]
    fn returns_zero_vector_for_zero_input() {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        normalize_velocity(&mut out, &Velocity2D { x: 0.0, y: 0.0 });
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_source() {
        let mut v = Velocity2D { x: 5.0, y: 0.0 };
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
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        scale_velocity(&mut out, &Velocity2D { x: 3.0, y: -2.0 }, 2.0);
        assert_eq!(out.x, 6.0);
        assert_eq!(out.y, -4.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_velocity() {
        let mut v = Velocity2D { x: 4.0, y: 2.0 };
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
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        subtract_velocity(
            &mut out,
            &Velocity2D { x: 5.0, y: 3.0 },
            &Velocity2D { x: 2.0, y: 1.0 },
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_a() {
        let mut a = Velocity2D { x: 5.0, y: 3.0 };
        let a_clone = clone_velocity2d(&a);
        subtract_velocity(&mut a, &a_clone, &Velocity2D { x: 2.0, y: 1.0 });
        assert_eq!(a.x, 3.0);
        assert_eq!(a.y, 2.0);
    }
}

mod zero_velocity {
    use super::*;

    #[test]
    fn sets_both_components_to_zero() {
        let mut v = Velocity2D { x: 5.0, y: -3.0 };
        zero_velocity(&mut v);
        assert_eq!(v.x, 0.0);
        assert_eq!(v.y, 0.0);
    }
}
