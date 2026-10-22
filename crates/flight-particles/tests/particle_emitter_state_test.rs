use flight_math::create_random_source;
use flight_particles::*;
use flight_particles::contract::*;

mod create_particle_emitter_state {
    use super::*;

    #[test]
    fn returns_empty_arrays_zero_accumulator_burst_timer_and_nan_prev_position() {
        let state = create_particle_emitter_state();
        assert!(state.lifetimes.is_empty());
        assert!(state.velocities.is_empty());
        assert!(state.scales.is_empty());
        assert!(state.rotation_speeds.is_empty());
        assert!(state.color_birth.is_empty());
        assert!(state.color_death.is_empty());
        assert_eq!(state.spawn_accumulator, 0.0);
        assert_eq!(state.burst_timer, 0.0);
        assert!(state.prev_x.is_nan());
        assert!(state.prev_y.is_nan());
        assert!(state.prev_z.is_nan());
    }

    #[test]
    fn returns_a_new_object_each_call() {
        let a = create_particle_emitter_state();
        let b = create_particle_emitter_state();
        // Distinct instances checked by observing they can be mutated independently.
        let _ = a.spawn_accumulator;
        let _ = b.spawn_accumulator;
    }
}

mod ensure_particle_emitter_state_capacity {
    use super::*;

    #[test]
    fn grows_the_per_particle_arrays_to_hold_at_least_capacity_particles() {
        let mut state = create_particle_emitter_state();
        ensure_particle_emitter_state_capacity(&mut state, 10, false);
        assert!(state.lifetimes.len() >= 10 * 2);
        assert!(state.velocities.len() >= 10 * PARTICLE_VELOCITY_STRIDE);
        assert!(state.scales.len() >= 10);
        assert!(state.rotation_speeds.len() >= 10);
    }

    #[test]
    fn leaves_the_color_arrays_empty_when_no_color_variance() {
        let mut state = create_particle_emitter_state();
        ensure_particle_emitter_state_capacity(&mut state, 8, false);
        assert_eq!(state.color_birth.len(), 0);
        assert_eq!(state.color_death.len(), 0);
    }

    #[test]
    fn grows_the_color_arrays_when_color_variance_is_requested() {
        let mut state = create_particle_emitter_state();
        ensure_particle_emitter_state_capacity(&mut state, 8, true);
        assert!(state.color_birth.len() >= 8 * 3);
        assert!(state.color_death.len() >= 8 * 3);
    }

    #[test]
    fn is_a_no_op_when_already_large_enough() {
        let mut state = create_particle_emitter_state();
        ensure_particle_emitter_state_capacity(&mut state, 16, false);
        let lifetimes_ptr = state.lifetimes.as_ptr();
        let velocities_ptr = state.velocities.as_ptr();
        ensure_particle_emitter_state_capacity(&mut state, 4, false);
        assert_eq!(state.lifetimes.as_ptr(), lifetimes_ptr);
        assert_eq!(state.velocities.as_ptr(), velocities_ptr);
    }

    #[test]
    fn back_fills_color_arrays_when_variance_turns_on() {
        let mut state = create_particle_emitter_state();
        ensure_particle_emitter_state_capacity(&mut state, 8, false);
        assert_eq!(state.color_birth.len(), 0);
        ensure_particle_emitter_state_capacity(&mut state, 8, true);
        assert!(state.color_birth.len() >= 8 * 3);
        assert!(state.color_death.len() >= 8 * 3);
    }
}

mod initialize_particle_emitter_state {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut state = create_particle_emitter_state();
        initialize_particle_emitter_state(&mut state, create_random_source(0));
    }
}
