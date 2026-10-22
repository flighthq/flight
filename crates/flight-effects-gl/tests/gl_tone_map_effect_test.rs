mod apply_tone_map_effect_to_gl {
    use flight_effects::{ToneMapOperator, create_tone_map_effect};
    use flight_effects_gl::contract::apply_tone_map_effect_to_gl;

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, linked_programs, make_state, make_texture_target,
        shader_source_containing,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 8.0);
        let dest = make_texture_target(&state, 16.0, 8.0);
        let effect = create_tone_map_effect();
        clear_calls();
        apply_tone_map_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap()).unwrap();
        assert_eq!(draws().len(), 1);
        assert_eq!(last_uniform("u_exposure"), vec![1.0]);
        assert_eq!(last_uniform("u_white"), vec![1.0]);
        assert!(shader_source_containing("vec3 tonemap(vec3 x)").contains("2.51 * x + 0.03"));
        // Each operator compiles its own program.
        effect.write().unwrap().operator = Some(ToneMapOperator::Reinhard);
        apply_tone_map_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap()).unwrap();
        assert_eq!(linked_programs(), 2);
        assert!(shader_source_containing("vec3 tonemap(vec3 x)").contains("u_white * u_white"));
    }
}

mod gl_tone_map_effect_runner {
    use flight_effects::create_tone_map_effect;
    use flight_effects_gl::contract::gl_tone_map_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_tone_map_effect();
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_tone_map_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
    }
}

mod register_gl_tone_map_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_tone_map_effect_runner,
        register_gl_tone_map_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_tone_map_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "ToneMapEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_tone_map_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "ToneMapEffect").is_none());
    }
}
