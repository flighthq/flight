mod apply_gradient_bevel_effect_to_gl {
    use flight_effects::create_gradient_bevel_effect;
    use flight_effects_gl::contract::apply_gradient_bevel_effect_to_gl;
    use flight_render_gl::create_gl_texture_render_target_pool;

    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, draws, make_state, make_texture_target,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        let dest = make_texture_target(&state, 32.0, 16.0);
        let mut pool = create_gl_texture_render_target_pool();
        let effect = create_gradient_bevel_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.colors = vec![0x000000, 0xffffff];
            effect.alphas = vec![1.0, 1.0];
            effect.ratios = vec![0.0, 255.0];
        }
        clear_calls();
        apply_gradient_bevel_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &mut pool,
            &effect.read().unwrap(),
        )
        .unwrap();
        assert!(!draws().is_empty());
        assert_eq!(pool.free.len(), 3);
        // The transient ramp texture is created and deleted within the call.
        let ramps: Vec<i64> = calls_with("tex_image_2d")
            .into_iter()
            .filter(|call| call.integers[3] == 256 && call.integers[4] == 1)
            .map(|call| call.integers[3])
            .collect();
        assert_eq!(ramps.len(), 1);
        assert!(calls_named("delete_textures") >= 1);
    }
}

mod gl_gradient_bevel_effect_runner {
    use flight_effects::create_gradient_bevel_effect;
    use flight_effects_gl::contract::gl_gradient_bevel_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_gradient_bevel_effect();
        clear_calls();
        with_effect_context(&mut state, 32.0, 16.0, |ctx| {
            gl_gradient_bevel_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert!(!draws().is_empty());
    }
}

mod register_gl_gradient_bevel_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_gradient_bevel_effect_runner,
        register_gl_gradient_bevel_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_gradient_bevel_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "GradientBevelEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_gradient_bevel_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "GradientBevelEffect").is_none());
    }
}
