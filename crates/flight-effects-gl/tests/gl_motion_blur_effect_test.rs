mod apply_motion_blur_effect_to_gl {
    use flight_effects::create_motion_blur_effect;
    use flight_effects_gl::contract::apply_motion_blur_effect_to_gl;
    use flight_render_gl::create_gl_texture;

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 8.0);
        let dest = make_texture_target(&state, 16.0, 8.0);
        let effect = create_motion_blur_effect();
        clear_calls();
        apply_motion_blur_effect_to_gl(&mut state, &source, &dest, None, &effect.read().unwrap())
            .unwrap();
        assert_eq!(draws().len(), 1);
        assert_eq!(last_uniform("u_intensity"), vec![1.0]);
        assert_eq!(last_uniform("u_samples"), vec![16.0]);
        assert_eq!(last_uniform("u_resolution"), vec![16.0, 8.0]);
        assert_eq!(last_uniform("u_hasVelocity"), vec![0.0]);
        let input = create_gl_texture(&state).unwrap();
        clear_calls();
        apply_motion_blur_effect_to_gl(
            &mut state,
            &source,
            &dest,
            Some(input),
            &effect.read().unwrap(),
        )
        .unwrap();
        assert_eq!(last_uniform("u_hasVelocity"), vec![1.0]);
        assert_eq!(draws()[0].textures[1], input.0.get() as i32);
    }

    #[test]
    fn negates_velocity_pixels_y_for_gl_uv_bottom_left_origin() {
        let mut state = make_state();
        let target = make_texture_target(&state, 8.0, 8.0);
        let effect = create_motion_blur_effect();
        apply_motion_blur_effect_to_gl(&mut state, &target, &target, None, &effect.read().unwrap())
            .unwrap();
        let source = crate::gl_test_helper::shader_source_containing("u_hasVelocity");
        assert!(source.contains("vec2(velocityPixels.x, -velocityPixels.y)"));
    }
}

mod gl_motion_blur_effect_runner {
    use flight_effects::create_motion_blur_effect;
    use flight_effects_gl::contract::gl_motion_blur_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, last_uniform, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_motion_blur_effect();
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_motion_blur_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
        // The context carried no scene velocity texture, so the sentinel path ran.
        assert_eq!(last_uniform("u_hasVelocity"), vec![0.0]);
    }
}

mod register_gl_motion_blur_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_motion_blur_effect_runner,
        register_gl_motion_blur_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_motion_blur_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "MotionBlurEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_motion_blur_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "MotionBlurEffect").is_none());
    }
}
