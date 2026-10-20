use flight_particles::*;

mod create_particle_objects_state {
    use super::*;

    #[test]
    fn allocates_arrays_sized_to_capacity() {
        let state = create_particle_objects_state(10, None);
        assert_eq!(state.lifetimes.len(), 20);
        assert_eq!(state.velocities.len(), 20);
        assert_eq!(state.spawn_accumulator, 0.0);
    }

    #[test]
    fn all_lifetime_slots_start_as_dead() {
        let state = create_particle_objects_state(5, None);
        for i in 0..5 {
            assert_eq!(state.lifetimes[i * 2 + 1], 0.0);
        }
    }
}

mod ensure_particle_objects_state_capacity {
    use super::*;

    #[test]
    fn does_not_reallocate_when_already_large_enough() {
        let mut state = create_particle_objects_state(10, None);
        let lifetimes_ptr = state.lifetimes.as_ptr();
        let velocities_ptr = state.velocities.as_ptr();
        ensure_particle_objects_state_capacity(&mut state, 10);
        assert_eq!(state.lifetimes.as_ptr(), lifetimes_ptr);
        assert_eq!(state.velocities.as_ptr(), velocities_ptr);
    }

    #[test]
    fn grows_arrays_when_capacity_is_insufficient() {
        let mut state = create_particle_objects_state(5, None);
        ensure_particle_objects_state_capacity(&mut state, 20);
        assert!(state.lifetimes.len() >= 40);
        assert!(state.velocities.len() >= 40);
    }
}

mod initialize_particle_objects_state {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut state = ParticleObjectsState::default();
        initialize_particle_objects_state(&mut state, 5, None);
    }
}
