mod apply_bloom_effect_to_gl {
    use flight_effects::create_bloom_effect;
    use flight_effects_gl::contract::apply_bloom_effect_to_gl;
    use flight_render_gl::create_gl_texture_render_target_pool;

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 16.0);
        let dest = make_texture_target(&state, 16.0, 16.0);
        let mut pool = create_gl_texture_render_target_pool();
        let effect = create_bloom_effect();
        clear_calls();
        apply_bloom_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &mut pool,
            &effect.read().unwrap(),
        )
        .unwrap();
        // bright pass + two separable blur passes + composite
        assert_eq!(draws().len(), 4);
        assert_eq!(last_uniform("u_threshold"), vec![0.8]);
        assert_eq!(last_uniform("u_intensity"), vec![1.0]);
        // The three intermediate targets return to the pool.
        assert_eq!(pool.free.len(), 3);
    }
}

mod gl_bloom_effect_runner {
    use flight_effects::create_bloom_effect;
    use flight_effects_gl::contract::gl_bloom_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_bloom_effect();
        clear_calls();
        with_effect_context(&mut state, 16.0, 16.0, |ctx| {
            gl_bloom_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 4);
    }
}

mod register_gl_bloom_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_bloom_effect_runner, register_gl_bloom_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        register_gl_bloom_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "BloomEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_bloom_effect_runner as GlEffectRunner
        ));
    }
}
