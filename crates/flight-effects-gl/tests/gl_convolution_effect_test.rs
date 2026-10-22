use flight_effects::{ConvolutionEffect, create_convolution_effect};
use flight_entity::Ref;

fn identity_effect(color: Option<u32>) -> Ref<ConvolutionEffect> {
    let effect = create_convolution_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.color = color;
        effect.matrix = vec![1.0];
        effect.matrix_x = 1.0;
        effect.matrix_y = 1.0;
    }
    return effect;
}

mod apply_convolution_effect_to_gl {
    use flight_effects_gl::contract::{
        MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE, apply_convolution_effect_to_gl,
    };

    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_convolution_effect_to_gl(
            &mut state,
            &target,
            &target,
            &identity_effect(None).read().unwrap(),
        )
        .unwrap();
        assert_eq!(draws().len(), 1);
        let matrix = last_uniform("u_matrix[0]");
        assert_eq!(matrix.len(), MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE);
        assert_eq!(matrix[0], 1.0);
        assert_eq!(last_uniform("u_divisor"), vec![1.0]);
    }

    #[test]
    fn binds_the_edge_color_as_packed_rgba_not_as_the_argb_it_once_carried() {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_convolution_effect_to_gl(
            &mut state,
            &target,
            &target,
            &identity_effect(Some(0x44ffee80)).read().unwrap(),
        )
        .unwrap();
        let color = last_uniform("u_edgeColor");
        // D1 f32 bound (TS: toBeCloseTo(x, 5))
        assert_close(color[0], 0x44 as f32 / 255.0, 0.5e-5);
        assert_close(color[1], 1.0, 0.5e-5);
        assert_close(color[2], 0xee as f32 / 255.0, 0.5e-5);
        assert_close(color[3], 0x80 as f32 / 255.0, 0.5e-5);
    }

    #[test]
    fn defaults_the_edge_color_to_transparent_black_when_the_effect_omits_it() {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_convolution_effect_to_gl(
            &mut state,
            &target,
            &target,
            &identity_effect(None).read().unwrap(),
        )
        .unwrap();
        assert_eq!(last_uniform("u_edgeColor"), vec![0.0, 0.0, 0.0, 0.0]);
    }
}

mod gl_convolution_effect_runner {
    use flight_effects_gl::contract::gl_convolution_effect_runner;

    use super::*;
    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = identity_effect(None);
        clear_calls();
        with_effect_context(&mut state, 4.0, 4.0, |ctx| {
            gl_convolution_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
    }
}

mod register_gl_convolution_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_convolution_effect_runner,
        register_gl_convolution_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        register_gl_convolution_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "ConvolutionEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_convolution_effect_runner as GlEffectRunner
        ));
    }
}
