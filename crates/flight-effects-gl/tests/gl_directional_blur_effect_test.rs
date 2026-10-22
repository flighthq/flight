mod apply_directional_blur_effect_to_gl {
    use flight_effects::create_directional_blur_effect;
    use flight_effects_gl::contract::apply_directional_blur_effect_to_gl;

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 8.0);
        let dest = make_texture_target(&state, 16.0, 8.0);
        let effect = create_directional_blur_effect();
        clear_calls();
        apply_directional_blur_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap())
            .unwrap();
        let recorded = draws();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].framebuffer, dest.framebuffer.0.get() as i32);
        assert_eq!(recorded[0].textures[0], source.texture.0.get() as i32);
        assert_eq!(last_uniform("u_angle"), vec![0.0]);
        assert_eq!(last_uniform("u_length"), vec![8.0]);
        assert_eq!(last_uniform("u_samples"), vec![16.0]);
        assert_eq!(last_uniform("u_resolution"), vec![16.0, 8.0]);
    }

    #[test]
    fn negates_sin_u_angle_for_gl_uv_bottom_left_origin() {
        let mut state = make_state();
        let target = make_texture_target(&state, 8.0, 8.0);
        let effect = create_directional_blur_effect();
        apply_directional_blur_effect_to_gl(&mut state, &target, &target, &effect.read().unwrap())
            .unwrap();
        let source = crate::gl_test_helper::shader_source_containing("u_angle");
        assert!(source.contains("vec2(cos(u_angle), -sin(u_angle))"));
    }
}

mod gl_directional_blur_effect_runner {
    use flight_effects::create_directional_blur_effect;
    use flight_effects_gl::contract::gl_directional_blur_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::{make_effect, with_effect_context};

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_directional_blur_effect();
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_directional_blur_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
        // A foreign effect registered under this kind is ignored rather than misread.
        let foreign = make_effect("DirectionalBlurEffect");
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_directional_blur_effect_runner(ctx, &*foreign.read().unwrap())
        })
        .unwrap();
        assert!(draws().is_empty());
    }
}

mod register_gl_directional_blur_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_directional_blur_effect_runner,
        register_gl_directional_blur_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_directional_blur_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "DirectionalBlurEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_directional_blur_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "DirectionalBlurEffect").is_none());
    }
}
