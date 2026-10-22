use flight_effects::{TiltShiftEffect, create_tilt_shift_effect};
use flight_effects_gl::contract::{
    apply_tilt_shift_effect_to_gl, evaluate_glsl_scalar_expression, extract_glsl_expression,
};
use flight_entity::Ref;
use flight_regexp::create_reg_exp;
use flight_render_gl::GlRenderState;

use crate::bindings;
use crate::gl_test_helper::{
    clear_calls, last_uniform, make_state, make_texture_target, shader_source_containing,
};

const BAND_CENTER: f32 = 0.25;

fn tilt_shift_effect(center: Option<f32>) -> Ref<TiltShiftEffect> {
    let effect = create_tilt_shift_effect();
    effect.write().unwrap().center = center;
    return effect;
}

fn apply_on(state: &mut GlRenderState, effect: &Ref<TiltShiftEffect>) {
    let target = make_texture_target(state, 64.0, 64.0);
    clear_calls();
    apply_tilt_shift_effect_to_gl(state, &target, &target, &effect.read().unwrap()).unwrap();
}

fn distance_expression() -> String {
    let mut state = make_state();
    apply_on(&mut state, &tilt_shift_effect(None));
    let source = shader_source_containing("u_center");
    return extract_glsl_expression(&source, &create_reg_exp("float dist = ([^;]+);", ""));
}

fn distance_at_texcoord_y(texcoord_y: f32, center: f32) -> f32 {
    return evaluate_glsl_scalar_expression(
        &distance_expression(),
        &bindings(&[("u_center", center), ("v_texCoord.y", texcoord_y)]),
    );
}

mod apply_tilt_shift_effect_to_gl {
    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::uniform_values;

    #[test]
    fn puts_the_sharp_band_at_center_measured_down_the_image() {
        // D1 f32 bound (TS: toBeCloseTo(0, 6))
        assert_close(
            distance_at_texcoord_y(1.0 - BAND_CENTER, BAND_CENTER),
            0.0,
            0.5e-6,
        );
    }

    #[test]
    fn does_not_put_the_band_at_the_mirrored_row() {
        // D1 f32 bound (TS: toBeCloseTo(0.5, 6))
        assert_close(
            distance_at_texcoord_y(BAND_CENTER, BAND_CENTER),
            0.5,
            0.5e-6,
        );
    }

    #[test]
    fn grows_the_distance_either_side_of_the_band_so_the_ramp_is_symmetric_about_it() {
        let above = distance_at_texcoord_y(1.0 - BAND_CENTER + 0.1, BAND_CENTER);
        let below = distance_at_texcoord_y(1.0 - BAND_CENTER - 0.1, BAND_CENTER);
        // D1 f32 bound (TS: toBeCloseTo(0.1, 6))
        assert_close(above, 0.1, 0.5e-6);
        assert_close(below, 0.1, 0.5e-6);
    }

    #[test]
    fn cannot_distinguish_the_two_origins_at_a_centred_band() {
        // D1 f32 bound (TS: toBeCloseTo(x, 10))
        assert_close(
            distance_at_texcoord_y(0.3, 0.5),
            distance_at_texcoord_y(0.7, 0.5),
            0.5e-10,
        );
    }

    #[test]
    fn passes_the_band_geometry_through_as_descriptor_defaults() {
        let mut state = make_state();
        apply_on(&mut state, &tilt_shift_effect(None));
        assert_eq!(last_uniform("u_center"), vec![0.5]);
        assert_eq!(last_uniform("u_width"), vec![0.3]);
        assert_eq!(last_uniform("u_blur"), vec![4.0]);
    }

    #[test]
    fn gives_the_shader_the_source_resolution_the_taps_are_scaled_by() {
        let mut state = make_state();
        apply_on(&mut state, &tilt_shift_effect(None));
        assert_eq!(uniform_values("u_resolution"), vec![vec![64.0, 64.0]]);
    }
}

mod gl_tilt_shift_effect_runner {
    use flight_effects_gl::contract::gl_tilt_shift_effect_runner;

    use super::*;
    use crate::with_effect_context;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_state();
        let effect = tilt_shift_effect(Some(0.2));
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_tilt_shift_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(last_uniform("u_center"), vec![0.2]);
    }
}

mod register_gl_tilt_shift_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_tilt_shift_effect_runner,
        register_gl_tilt_shift_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_tilt_shift_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "TiltShiftEffect").is_none());
        register_gl_tilt_shift_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "TiltShiftEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_tilt_shift_effect_runner as GlEffectRunner
        ));
    }
}
