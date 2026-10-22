mod apply_contact_shadows_effect_to_gl {
    use flight_effects::create_contact_shadows_effect;
    use flight_effects_gl::contract::apply_contact_shadows_effect_to_gl;

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target, shader_source_containing,
    };

    // TS spies on applySsaoEffectToGl; Rust observes the same mapping through the SSAO pass's uploads.
    #[test]
    fn maps_the_contact_descriptor_into_the_shared_local_occlusion_realization() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 8.0);
        let dest = make_texture_target(&state, 16.0, 8.0);
        let effect = create_contact_shadows_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.distance = Some(3.0);
            effect.opacity = Some(0.75);
            effect.samples = Some(24.0);
        }
        clear_calls();
        apply_contact_shadows_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap())
            .unwrap();
        assert_eq!(draws().len(), 1);
        assert_eq!(last_uniform("u_intensity"), vec![0.75]);
        assert_eq!(last_uniform("u_radius"), vec![3.0]);
        assert!(shader_source_containing("float variation").contains("luma"));
    }
}

mod gl_contact_shadows_effect_runner {
    use flight_effects::create_contact_shadows_effect;
    use flight_effects_gl::contract::gl_contact_shadows_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_contact_shadows_effect();
        clear_calls();
        with_effect_context(&mut state, 16.0, 8.0, |ctx| {
            gl_contact_shadows_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
    }
}

mod register_gl_contact_shadows_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_contact_shadows_effect_runner,
        register_gl_contact_shadows_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn installs_the_contact_shadows_runner_on_the_supplied_state() {
        let mut state = make_state();
        register_gl_contact_shadows_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "ContactShadowsEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_contact_shadows_effect_runner as GlEffectRunner
        ));
    }
}
