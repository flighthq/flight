use flight_effects::BevelEffect;
use flight_effects_gl::contract::apply_bevel_effect_to_gl;
use flight_render_gl::create_gl_texture_render_target_pool;

use crate::gl_test_helper::{clear_calls, last_uniform, make_state, make_texture_target};

fn run(effect: &BevelEffect) {
    let mut state = make_state();
    let target = make_texture_target(&state, 4.0, 4.0);
    let mut pool = create_gl_texture_render_target_pool();
    clear_calls();
    apply_bevel_effect_to_gl(&mut state, &target, &target, &mut pool, effect).unwrap();
}

mod apply_bevel_effect_to_gl {
    use flight_effects::create_bevel_effect;

    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::draws;

    #[test]
    fn is_a_function() {
        run(&create_bevel_effect().read().unwrap());
        assert!(!draws().is_empty());
        assert_eq!(last_uniform("u_clipMode"), vec![1.0]);
    }

    #[test]
    fn splits_each_packed_rgba_color_into_composite_rgb_and_an_alpha_multiplied_by_its_alpha_field()
    {
        let effect = create_bevel_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.highlight_alpha = Some(0.5);
            effect.highlight_color = Some(0x9d55ff80);
            effect.shadow_alpha = Some(1.0);
            effect.shadow_color = Some(0x102030c0);
        }
        run(&effect.read().unwrap());
        let highlight = last_uniform("u_highlight");
        // D1 f32 bound (TS: toBeCloseTo(x, 5))
        assert_close(highlight[0], 0x9d as f32 / 255.0, 0.5e-5);
        assert_close(highlight[1], 0x55 as f32 / 255.0, 0.5e-5);
        assert_close(highlight[2], 1.0, 0.5e-5);
        assert_close(highlight[3], (0x80 as f32 / 255.0) * 0.5, 0.5e-5);
        let shadow = last_uniform("u_shadow");
        assert_close(shadow[0], 0x10 as f32 / 255.0, 0.5e-5);
        assert_close(shadow[1], 0x20 as f32 / 255.0, 0.5e-5);
        assert_close(shadow[2], 0x30 as f32 / 255.0, 0.5e-5);
        assert_close(shadow[3], 0xc0 as f32 / 255.0, 0.5e-5);
    }

    #[test]
    fn defaults_to_opaque_white_over_opaque_black_the_pair_the_pre_migration_defaults_produced() {
        run(&create_bevel_effect().read().unwrap());
        assert_eq!(last_uniform("u_highlight"), vec![1.0, 1.0, 1.0, 1.0]);
        assert_eq!(last_uniform("u_shadow"), vec![0.0, 0.0, 0.0, 1.0]);
    }
}

mod gl_bevel_effect_runner {
    use flight_effects::create_bevel_effect;
    use flight_effects_gl::contract::gl_bevel_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_bevel_effect();
        clear_calls();
        with_effect_context(&mut state, 32.0, 16.0, |ctx| {
            gl_bevel_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert!(!draws().is_empty());
    }
}

mod register_gl_bevel_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_bevel_effect_runner, register_gl_bevel_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_bevel_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "BevelEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_bevel_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "BevelEffect").is_none());
    }
}
