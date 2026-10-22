use flight_entity::get_entity_id;
use flight_spring::*;

fn spring_config(frequency: f32, damping_ratio: f32) -> SpringConfig {
    return create_spring_config(Some(&SpringConfigOptions {
        damping_ratio: Some(damping_ratio),
        frequency: Some(frequency),
    }));
}

fn spring2d_with_state(value_x: f32, value_y: f32, velocity_x: f32, velocity_y: f32) -> Spring2D {
    let mut spring = create_spring2d();
    spring.x.value = value_x;
    spring.x.velocity = velocity_x;
    spring.y.value = value_y;
    spring.y.velocity = velocity_y;
    return spring;
}

mod add_spring_impulse_2d {
    use super::*;

    #[test]
    fn adds_each_velocity_component_without_changing_either_value() {
        let mut spring = spring2d_with_state(10.0, 20.0, 1.0, 2.0);

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
        let spring = create_spring2d();
        assert_eq!(spring.x.value, 0.0);
        assert_eq!(spring.x.velocity, 0.0);
        assert_eq!(spring.y.value, 0.0);
        assert_eq!(spring.y.velocity, 0.0);
    }

    #[test]
    fn takes_per_axis_value_and_velocity_by_assignment_after_create() {
        // D23 (B): the source's stateful create is canonical create, then axis assignment.
        let spring = spring2d_with_state(1.0, 2.0, 3.0, 4.0);
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
        let mut spring = spring2d_with_state(5.0, 6.0, 7.0, 8.0);
        let id = get_entity_id(&spring);
        let x_id = get_entity_id(&spring.x);
        let y_id = get_entity_id(&spring.y);
        initialize_spring2d(&mut spring);
        assert_eq!(spring.x.value, 0.0);
        assert_eq!(spring.y.value, 0.0);
        assert_eq!(spring.x.velocity, 0.0);
        assert_eq!(spring.y.velocity, 0.0);
        assert_eq!(get_entity_id(&spring), id);
        assert_eq!(get_entity_id(&spring.x), x_id);
        assert_eq!(get_entity_id(&spring.y), y_id);
    }
}

mod is_spring2d_settled {
    use super::*;

    #[test]
    fn is_false_until_both_axes_rest_at_their_targets() {
        let mut spring = spring2d_with_state(0.0, 0.0, 0.0, 0.0);
        let config = spring_config(4.0, 1.0);
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
        let mut spring = spring2d_with_state(1.0, 2.0, 3.0, 4.0);

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
        let mut spring = spring2d_with_state(0.0, 0.0, 0.0, 0.0);
        let config = spring_config(2.0, 1.0);
        update_spring2d(&mut spring, 10.0, -20.0, &config, 1.0 / 60.0);
        assert!(spring.x.value > 0.0);
        assert!(spring.y.value < 0.0);
    }

    #[test]
    fn drives_the_axes_independently() {
        let mut spring = spring2d_with_state(0.0, 0.0, 0.0, 0.0);
        let config = spring_config(2.0, 0.8);
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
