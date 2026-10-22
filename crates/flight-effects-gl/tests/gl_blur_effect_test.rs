use flight_effects::{BlurEffect, create_blur_effect};
use flight_entity::Ref;

fn blur_effect(blur_x: f32, blur_y: f32) -> Ref<BlurEffect> {
    let effect = create_blur_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.blur_x = Some(blur_x);
        effect.blur_y = Some(blur_y);
    }
    return effect;
}

mod apply_blur_effect_to_gl {
    use flight_effects_gl::contract::apply_blur_effect_to_gl;

    use super::*;
    use crate::gl_test_helper::{
        clear_calls, draws, make_state, make_texture_target, uniform_values,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 12.0);
        let dest = make_texture_target(&state, 16.0, 12.0);
        let temp = make_texture_target(&state, 16.0, 12.0);
        clear_calls();
        apply_blur_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &temp,
            &blur_effect(2.0, 3.0).read().unwrap(),
        )
        .unwrap();
        assert_eq!(draws().len(), 2);
        assert_eq!(uniform_values("u_sigma"), vec![vec![2.0], vec![3.0]]);
        assert_eq!(uniform_values("u_radius"), vec![vec![6.0], vec![9.0]]);
    }
}

mod apply_blur_effect_to_gl_render_textures {
    use flight_effects_gl::contract::apply_blur_effect_to_gl_render_textures;
    use flight_render_gl::{create_gl_render_texture_pool, is_gl_render_texture_ready};

    use super::*;
    use crate::gl_test_helper::make_state;
    use crate::{lease_render_texture, publish_render_texture};

    #[test]
    fn publishes_destination_and_scratch_handles_after_applying_the_blur_descriptor() {
        let mut state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut source = lease_render_texture(&state, &mut pool, 16.0, 12.0);
        let mut dest = lease_render_texture(&state, &mut pool, 16.0, 12.0);
        let mut scratch = lease_render_texture(&state, &mut pool, 16.0, 12.0);
        publish_render_texture(&mut state, &mut source);
        assert!(
            apply_blur_effect_to_gl_render_textures(
                &mut state,
                &source,
                &mut dest,
                &mut scratch,
                &blur_effect(2.0, 3.0).read().unwrap(),
            )
            .unwrap()
        );
        assert!(is_gl_render_texture_ready(&mut state, &dest));
        assert!(is_gl_render_texture_ready(&mut state, &scratch));
    }
}

mod apply_gaussian_blur_to_gl {
    use flight_effects_gl::contract::{GlGaussianBlurOptions, apply_gaussian_blur_to_gl};

    use crate::gl_test_helper::{
        clear_calls, draws, make_state, make_texture_target, uniform_values,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 16.0, 12.0);
        let dest = make_texture_target(&state, 16.0, 12.0);
        let temp = make_texture_target(&state, 16.0, 12.0);
        clear_calls();
        apply_gaussian_blur_to_gl(
            &mut state,
            &source,
            &dest,
            &temp,
            &GlGaussianBlurOptions {
                blur_x: None,
                blur_y: None,
            },
        )
        .unwrap();
        let recorded = draws();
        assert_eq!(recorded.len(), 2);
        assert_eq!(recorded[0].framebuffer, temp.framebuffer.0.get() as i32);
        assert_eq!(recorded[1].framebuffer, dest.framebuffer.0.get() as i32);
        assert_eq!(
            uniform_values("u_direction"),
            vec![vec![1.0, 0.0], vec![0.0, 1.0]]
        );
    }
}

mod apply_gaussian_blur_to_gl_render_textures {
    use flight_effects_gl::contract::{
        GlGaussianBlurOptions, apply_gaussian_blur_to_gl_render_textures,
    };
    use flight_render_gl::{create_gl_render_texture_pool, is_gl_render_texture_ready};
    use flight_texture::TextureUvTransform;

    use crate::gl_test_helper::make_state;
    use crate::{lease_render_texture, publish_render_texture};

    #[test]
    fn publishes_destination_and_scratch_handles_after_the_two_gaussian_target_passes() {
        let mut state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut source = lease_render_texture(&state, &mut pool, 16.0, 12.0);
        let mut dest = lease_render_texture(&state, &mut pool, 16.0, 12.0);
        let mut scratch = lease_render_texture(&state, &mut pool, 16.0, 12.0);
        publish_render_texture(&mut state, &mut source);
        let options = GlGaussianBlurOptions {
            blur_x: Some(2.0),
            blur_y: Some(3.0),
        };
        assert!(
            apply_gaussian_blur_to_gl_render_textures(
                &mut state,
                &source,
                &mut dest,
                &mut scratch,
                &options
            )
            .unwrap()
        );
        assert!(is_gl_render_texture_ready(&mut state, &dest));
        assert!(is_gl_render_texture_ready(&mut state, &scratch));
        assert_eq!(dest.texture_fields().version, 1);
        assert_eq!(scratch.texture_fields().version, 1);
    }
}

mod gl_blur_effect_runner {
    use flight_effects_gl::contract::gl_blur_effect_runner;

    use super::*;
    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        clear_calls();
        let effect = blur_effect(2.0, 3.0);
        with_effect_context(&mut state, 16.0, 12.0, |ctx| {
            gl_blur_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 2);
    }
}

mod register_gl_blur_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_blur_effect_runner, register_gl_blur_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn registers_the_default_blur_runner_on_only_the_supplied_state() {
        let mut state = make_state();
        let other = make_state();
        register_gl_blur_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "BlurEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_blur_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "BlurEffect").is_none());
    }
}
