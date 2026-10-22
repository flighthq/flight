mod get_gl_effect_program {
    use flight_effects_gl::contract::get_gl_effect_program;
    use flight_render_gl::create_gl_render_state;

    use crate::gl_test_helper::{clear_calls, linked_programs, make_context_state, make_state};

    #[test]
    fn compiles_a_key_once_per_context_and_hands_back_the_same_program() {
        let state = make_state();
        clear_calls();
        let first = get_gl_effect_program(&state, "blur", "SOURCE_A").unwrap();
        let second = get_gl_effect_program(&state, "blur", "SOURCE_A").unwrap();
        assert_eq!(second, first);
        assert_eq!(linked_programs(), 1);
    }

    #[test]
    fn compiles_each_key_separately_so_two_recipes_never_share_one_program() {
        let state = make_state();
        clear_calls();
        let blur = get_gl_effect_program(&state, "blur", "SOURCE_A").unwrap();
        let bloom = get_gl_effect_program(&state, "bloom", "SOURCE_B").unwrap();
        assert_ne!(bloom.program, blur.program);
        assert_eq!(linked_programs(), 2);
    }

    #[test]
    fn gives_each_context_its_own_program_since_a_program_cannot_cross_contexts() {
        let first_state = make_state();
        let first = get_gl_effect_program(&first_state, "blur", "SOURCE_A").unwrap();
        let second_context = create_gl_render_state(
            flight_render_gl::create_gl_context_state(first_state.gl.clone()).unwrap(),
            None,
        );
        clear_calls();
        let second = get_gl_effect_program(&second_context, "blur", "SOURCE_A").unwrap();
        assert_ne!(second.program, first.program);
        assert_eq!(linked_programs(), 1);
    }

    #[test]
    fn shares_one_program_across_two_states_on_the_same_context() {
        let context = make_context_state();
        let first_state = create_gl_render_state(context.clone(), None);
        let second_state = create_gl_render_state(context, None);
        clear_calls();
        let first = get_gl_effect_program(&first_state, "blur", "SOURCE_A").unwrap();
        let second = get_gl_effect_program(&second_state, "blur", "SOURCE_A").unwrap();
        assert_eq!(second, first);
        assert_eq!(linked_programs(), 1);
    }

    #[test]
    fn ignores_a_changed_source_under_a_key_it_has_already_compiled() {
        let state = make_state();
        clear_calls();
        let first = get_gl_effect_program(&state, "blur", "SOURCE_A").unwrap();
        let second = get_gl_effect_program(&state, "blur", "SOURCE_B_DIFFERENT").unwrap();
        assert_eq!(second, first);
        assert_eq!(linked_programs(), 1);
    }
}

mod get_gl_effect_uniform_location {
    use flight_effects_gl::contract::{get_gl_effect_program, get_gl_effect_uniform_location};

    use crate::gl_test_helper::{calls_named, clear_calls, make_state};

    #[test]
    fn asks_the_driver_once_per_name_and_caches_the_answer() {
        let state = make_state();
        let program = get_gl_effect_program(&state, "uniforms", "SOURCE_A").unwrap();
        clear_calls();
        let first = get_gl_effect_uniform_location(&state, &program, "u_intensity");
        let second = get_gl_effect_uniform_location(&state, &program, "u_intensity");
        assert_eq!(second, first);
        assert_eq!(calls_named("get_uniform_location"), 1);
    }

    #[test]
    fn keeps_each_program_locations_apart_since_one_name_is_a_different_slot_in_each() {
        let state = make_state();
        let first = get_gl_effect_program(&state, "programOne", "SOURCE_A").unwrap();
        let second = get_gl_effect_program(&state, "programTwo", "SOURCE_B").unwrap();
        let from_first = get_gl_effect_uniform_location(&state, &first, "u_intensity");
        let from_second = get_gl_effect_uniform_location(&state, &second, "u_intensity");
        assert_ne!(from_second, from_first);
    }

    #[test]
    fn caches_a_none_location_rather_than_re_asking_the_driver_every_frame() {
        let state = make_state();
        let program = get_gl_effect_program(&state, "nullUniform", "SOURCE_A").unwrap();
        clear_calls();
        assert!(get_gl_effect_uniform_location(&state, &program, "u_missing").is_none());
        assert!(get_gl_effect_uniform_location(&state, &program, "u_missing").is_none());
        assert_eq!(calls_named("get_uniform_location"), 1);
    }

    #[test]
    fn resolves_each_name_separately_within_one_program() {
        let state = make_state();
        let program = get_gl_effect_program(&state, "twoNames", "SOURCE_A").unwrap();
        assert_ne!(
            get_gl_effect_uniform_location(&state, &program, "u_a"),
            get_gl_effect_uniform_location(&state, &program, "u_b")
        );
    }
}
