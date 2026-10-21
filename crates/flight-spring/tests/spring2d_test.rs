use flight_spring::*;

mod add_spring_impulse_2d {
    use super::*;

    #[test]
    fn adds_each_velocity_component_without_changing_either_value() {
        let mut spring = create_spring2d(Some(10.0), Some(20.0), Some(1.0), Some(2.0));

        add_spring_impulse_2d(&mut spring, 3.0, -5.0);

        assert_eq!(spring.x.value, 10.0);
        assert_eq!(spring.x.velocity, 4.0);
        assert_eq!(spring.y.value, 20.0);
        assert_eq!(spring.y.velocity, -3.0);
    }
}

mod create_spring2d {
    use super::*;

    #[test]
    fn defaults_both_axes_to_value_zero_and_velocity_zero() {
        let spring = create_spring2d(None, None, None, None);
        assert_eq!(spring.x.value, 0.0);
        assert_eq!(spring.x.velocity, 0.0);
        assert_eq!(spring.y.value, 0.0);
        assert_eq!(spring.y.velocity, 0.0);
    }

    #[test]
    fn sets_per_axis_value_and_velocity() {
        let spring = create_spring2d(Some(1.0), Some(2.0), Some(3.0), Some(4.0));
        assert_eq!(spring.x.value, 1.0);
        assert_eq!(spring.y.value, 2.0);
        assert_eq!(spring.x.velocity, 3.0);
        assert_eq!(spring.y.velocity, 4.0);
    }
}

mod initialize_spring2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_spring2d() {
        let mut spring = create_spring2d(Some(0.0), Some(0.0), Some(0.0), Some(0.0));
        initialize_spring2d(&mut spring, Some(5.0), Some(6.0), Some(7.0), Some(8.0));
        assert_eq!(spring.x.value, 5.0);
        assert_eq!(spring.y.value, 6.0);
        assert_eq!(spring.x.velocity, 7.0);
        assert_eq!(spring.y.velocity, 8.0);
    }
}

mod is_spring2d_settled {
    use super::*;

    #[test]
    fn is_false_until_both_axes_rest_at_their_targets() {
        let mut spring = create_spring2d(Some(0.0), Some(0.0), Some(0.0), Some(0.0));
        let config = create_spring_config(4.0, 1.0);
        assert!(!is_spring2d_settled(&spring, 10.0, -6.0, None, None));
        for _ in 0..600 {
            update_spring2d(&mut spring, 10.0, -6.0, &config, 1.0 / 60.0);
        }
        assert!(is_spring2d_settled(&spring, 10.0, -6.0, None, None));
    }
}

mod reset_spring2d {
    use super::*;

    #[test]
    fn mirrors_scalar_reset_for_values_explicit_velocities_and_zero_defaults() {
        let mut spring = create_spring2d(Some(1.0), Some(2.0), Some(3.0), Some(4.0));

        reset_spring2d(&mut spring, 10.0, 20.0, Some(30.0), Some(40.0));
        assert_eq!(spring.x.value, 10.0);
        assert_eq!(spring.x.velocity, 30.0);
        assert_eq!(spring.y.value, 20.0);
        assert_eq!(spring.y.velocity, 40.0);

        reset_spring2d(&mut spring, -10.0, -20.0, None, None);
        assert_eq!(spring.x.value, -10.0);
        assert_eq!(spring.x.velocity, 0.0);
        assert_eq!(spring.y.value, -20.0);
        assert_eq!(spring.y.velocity, 0.0);
    }
}

mod update_spring2d {
    use super::*;

    #[test]
    fn moves_both_components_toward_their_targets() {
        let mut spring = create_spring2d(Some(0.0), Some(0.0), Some(0.0), Some(0.0));
        let config = create_spring_config(2.0, 1.0);
        update_spring2d(&mut spring, 10.0, -20.0, &config, 1.0 / 60.0);
        assert!(spring.x.value > 0.0);
        assert!(spring.y.value < 0.0);
    }

    #[test]
    fn drives_the_axes_independently() {
        let mut spring = create_spring2d(Some(0.0), Some(0.0), Some(0.0), Some(0.0));
        let config = create_spring_config(2.0, 0.8);
        for _ in 0..30 {
            update_spring2d(&mut spring, 10.0, 5.0, &config, 1.0 / 60.0);
        }
        assert!(
            (spring.x.value - spring.y.value).abs() > 1e-3,
            "axes should differ: x={}, y={}",
            spring.x.value,
            spring.y.value
        );
    }
}
