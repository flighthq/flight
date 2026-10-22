use flight_particles::*;
use flight_particles::contract::*;

mod create_particle_emitter_signals {
    use super::*;

    #[test]
    fn creates_a_signals_group_with_all_three_signal_slots() {
        let signals = create_particle_emitter_signals();
        // In Rust the fields always exist; the equivalent of "isDefined" is that
        // they can be read without panic.
        let _ = &signals.on_particle_spawn;
        let _ = &signals.on_particle_death;
        let _ = &signals.on_emitter_complete;
    }
}

mod enable_particle_emitter_signals {
    use super::*;

    #[test]
    fn returns_the_same_signals_on_repeated_calls() {
        let mut state = create_particle_emitter_state();
        let a = enable_particle_emitter_signals(&mut state);
        let b = enable_particle_emitter_signals(&mut state);
        assert_eq!(a, b);
    }

    #[test]
    fn returns_none_from_get_before_enablement() {
        let state = create_particle_emitter_state();
        assert!(get_particle_emitter_signals(&state).is_none());
    }

    #[test]
    fn returns_some_from_get_after_enablement() {
        let mut state = create_particle_emitter_state();
        enable_particle_emitter_signals(&mut state);
        assert!(get_particle_emitter_signals(&state).is_some());
    }
}

mod get_particle_emitter_signals {
    use super::*;

    #[test]
    fn returns_none_when_signals_have_not_been_enabled() {
        let state = create_particle_emitter_state();
        assert!(get_particle_emitter_signals(&state).is_none());
    }
}

mod initialize_particle_emitter_signals {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        // Verifies the function exists and is callable.
        let mut signals = create_particle_emitter_signals();
        initialize_particle_emitter_signals(&mut signals);
    }
}
