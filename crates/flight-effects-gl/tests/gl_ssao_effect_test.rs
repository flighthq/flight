mod apply_ssao_effect_to_gl {
    use flight_effects::create_ssao_effect;
    use flight_effects_gl::contract::apply_ssao_effect_to_gl;

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 8.0);
        let dest = make_texture_target(&state, 16.0, 8.0);
        let effect = create_ssao_effect();
        clear_calls();
        apply_ssao_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap()).unwrap();
        let recorded = draws();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].framebuffer, dest.framebuffer.0.get() as i32);
        assert_eq!(recorded[0].textures[0], source.texture.0.get() as i32);
        assert_eq!(last_uniform("u_resolution"), vec![16.0, 8.0]);
        assert_eq!(last_uniform("u_radius"), vec![1.0]);
        assert_eq!(last_uniform("u_intensity"), vec![1.0]);
    }
}

mod gl_ssao_effect_runner {
    use flight_effects::create_ssao_effect;
    use flight_effects_gl::contract::gl_ssao_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::{make_effect, with_effect_context};

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_ssao_effect();
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_ssao_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
        // A foreign effect registered under this kind is ignored rather than misread.
        let foreign = make_effect("SsaoEffect");
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_ssao_effect_runner(ctx, &*foreign.read().unwrap())
        })
        .unwrap();
        assert!(draws().is_empty());
    }
}

mod register_gl_ssao_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_ssao_effect_runner, register_gl_ssao_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_ssao_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "SsaoEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_ssao_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "SsaoEffect").is_none());
    }
}
