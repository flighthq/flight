mod apply_median_effect_to_gl {
    use flight_effects::create_median_effect;
    use flight_effects_gl::contract::{MAX_MEDIAN_EFFECT_GL_RADIUS, apply_median_effect_to_gl};

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target, shader_source_containing,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 8.0);
        let dest = make_texture_target(&state, 16.0, 8.0);
        let effect = create_median_effect();
        clear_calls();
        apply_median_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap()).unwrap();
        assert_eq!(draws().len(), 1);
        assert_eq!(last_uniform("u_radius"), vec![1.0]);
        assert_eq!(last_uniform("u_texelSize"), vec![1.0 / 16.0, 1.0 / 8.0]);
        // The shader's fixed window is sized from the exported radius cap.
        let source_text = shader_source_containing("sortFloat");
        assert!(source_text.contains("const int MAX_S = 25;"));
        assert!(source_text.contains("for (int dy = -2; dy <= 2; dy++)"));
        // A radius beyond the cap clamps to it.
        effect.write().unwrap().radius = Some(9.0);
        apply_median_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap()).unwrap();
        assert_eq!(
            last_uniform("u_radius"),
            vec![MAX_MEDIAN_EFFECT_GL_RADIUS as f32]
        );
    }
}

mod gl_median_effect_runner {
    use flight_effects::create_median_effect;
    use flight_effects_gl::contract::gl_median_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_median_effect();
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_median_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
    }
}

mod register_gl_median_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_median_effect_runner, register_gl_median_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_median_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "MedianEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_median_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "MedianEffect").is_none());
    }
}
