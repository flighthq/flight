use flight_effects::{LensDirtEffect, create_lens_dirt_effect};
use flight_entity::Ref;

fn lens_dirt_effect() -> Ref<LensDirtEffect> {
    let effect = create_lens_dirt_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.intensity = Some(1.5);
        effect.seed = Some(4.0);
        effect.threshold = Some(0.45);
    }
    return effect;
}

mod apply_lens_dirt_effect_to_gl {
    use flight_effects_gl::contract::apply_lens_dirt_effect_to_gl;
    use flight_render_gl::create_gl_texture_render_target_pool;

    use super::*;
    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target, uniform_values,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        let dest = make_texture_target(&state, 32.0, 16.0);
        let mut pool = create_gl_texture_render_target_pool();
        let effect = create_lens_dirt_effect();
        clear_calls();
        apply_lens_dirt_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &mut pool,
            &effect.read().unwrap(),
        )
        .unwrap();
        assert_eq!(draws().len(), 4);
        assert_eq!(last_uniform("u_threshold"), vec![0.55]);
    }

    #[test]
    fn blurs_a_thresholded_bright_branch_before_the_dirt_modulated_composite() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        let dest = make_texture_target(&state, 32.0, 16.0);
        let mut pool = create_gl_texture_render_target_pool();
        clear_calls();
        apply_lens_dirt_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &mut pool,
            &lens_dirt_effect().read().unwrap(),
        )
        .unwrap();

        // bright pass, two gaussian passes (bright → temp → blurred), composite.
        let recorded = draws();
        assert_eq!(recorded.len(), 4);
        let bright = recorded[0].framebuffer;
        let temp = recorded[1].framebuffer;
        let blurred = recorded[2].framebuffer;
        assert_eq!(recorded[0].textures[0], source.texture.0.get() as i32);
        assert_ne!(bright, dest.framebuffer.0.get() as i32);
        assert_ne!(bright, blurred);
        assert_ne!(temp, blurred);
        assert_eq!(uniform_values("u_sigma"), vec![vec![8.0], vec![8.0]]);
        assert_eq!(recorded[3].textures[0], source.texture.0.get() as i32);
        assert_eq!(recorded[3].framebuffer, dest.framebuffer.0.get() as i32);
        // The three scratch targets return to the pool.
        assert_eq!(pool.free.len(), 3);

        assert_eq!(last_uniform("u_threshold"), vec![0.45]);
        assert_eq!(last_uniform("u_intensity"), vec![1.5]);
        assert_eq!(last_uniform("u_seed"), vec![4.0]);
    }
}

mod gl_lens_dirt_effect_runner {
    use flight_effects_gl::contract::gl_lens_dirt_effect_runner;

    use super::*;
    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = lens_dirt_effect();
        clear_calls();
        with_effect_context(&mut state, 32.0, 16.0, |ctx| {
            gl_lens_dirt_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 4);
    }
}

mod register_gl_lens_dirt_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_lens_dirt_effect_runner,
        register_gl_lens_dirt_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        register_gl_lens_dirt_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "LensDirtEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_lens_dirt_effect_runner as GlEffectRunner
        ));
    }
}
