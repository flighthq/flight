use flight_effects::{DisplacementEffect, create_displacement_effect};
use flight_effects_gl::contract::{
    apply_displacement_effect_to_gl, evaluate_glsl_scalar_expression, extract_glsl_expression,
};
use flight_entity::Ref;
use flight_regexp::create_reg_exp;

use crate::bindings;
use crate::gl_test_helper::{
    clear_calls, last_uniform, make_state, make_texture_target, shader_source_containing,
};

const SOURCE_WIDTH: f32 = 128.0;
const SOURCE_HEIGHT: f32 = 64.0;

fn displacement_effect(
    intensity: Option<f32>,
    frequency: Option<f32>,
    seed: Option<f32>,
) -> Ref<DisplacementEffect> {
    let effect = create_displacement_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.intensity = intensity;
        effect.frequency = frequency;
        effect.seed = seed;
    }
    return effect;
}

fn apply(effect: &Ref<DisplacementEffect>) {
    let mut state = make_state();
    let target = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
    clear_calls();
    apply_displacement_effect_to_gl(&mut state, &target, &target, &effect.read().unwrap()).unwrap();
}

fn shader_source() -> String {
    apply(&displacement_effect(None, None, None));
    return shader_source_containing("u_frequency");
}

mod apply_displacement_effect_to_gl {
    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::uniform_values;

    #[test]
    fn drives_the_horizontal_warp_from_top_left_image_space() {
        let source = shader_source();
        let image_y = evaluate_glsl_scalar_expression(
            &extract_glsl_expression(&source, &create_reg_exp("float imageY = ([^;]+);", "")),
            &bindings(&[("v_texCoord.y", 0.8)]),
        );
        let warp_x = evaluate_glsl_scalar_expression(
            &extract_glsl_expression(
                &source,
                &create_reg_exp(r"vec2 warp = vec2\(\s*([^,]+),", "s"),
            ),
            &bindings(&[("f", 2.5), ("imageY", image_y), ("u_seed", 0.3)]),
        );
        let expected = (0.2_f32 * 2.5 + 0.3).sin() + (0.2_f32 * 2.5 * 2.3 + 0.3 * 1.7).sin() * 0.5;
        // D1 f32 bound (TS: toBeCloseTo(x, 10))
        assert_close(image_y, 0.2, 0.5e-10);
        // D1 f32 bound (TS: toBeCloseTo(x, 10)); f32 evaluation of two sines accumulates a few ULP
        assert_close(warp_x, expected, 16.0 * f32::EPSILON);
    }

    #[test]
    fn negates_a_vertical_image_space_offset_on_the_way_back_to_bottom_left_texcoords() {
        let expression = extract_glsl_expression(
            &shader_source(),
            &create_reg_exp(r"vec2 displaced = vec2\([^,]+,\s*([^)]+)\);", ""),
        );
        let displaced_y = evaluate_glsl_scalar_expression(
            &expression,
            &bindings(&[("offset.y", 0.1), ("v_texCoord.y", 0.4)]),
        );
        // D1 f32 bound (TS: toBeCloseTo(0.3, 10))
        assert_close(displaced_y, 0.3, 0.5e-10);
    }

    #[test]
    fn passes_the_descriptor_and_source_dimensions_through_to_the_shader_uniforms() {
        apply(&displacement_effect(Some(3.0), Some(7.0), Some(0.25)));
        assert_eq!(last_uniform("u_intensity"), vec![3.0]);
        assert_eq!(last_uniform("u_frequency"), vec![7.0]);
        // D1 f32 bound (TS: toBeCloseTo(0.25, 6))
        assert_close(last_uniform("u_seed")[0], 0.25, 0.5e-6);
        assert_eq!(
            uniform_values("u_resolution"),
            vec![vec![SOURCE_WIDTH, SOURCE_HEIGHT]]
        );
    }

    #[test]
    fn uses_the_documented_displacement_defaults() {
        apply(&displacement_effect(None, None, None));
        assert_eq!(last_uniform("u_intensity"), vec![8.0]);
        assert_eq!(last_uniform("u_frequency"), vec![12.0]);
        assert_eq!(last_uniform("u_seed"), vec![0.0]);
    }
}

mod gl_displacement_effect_runner {
    use flight_effects_gl::contract::gl_displacement_effect_runner;

    use super::*;
    use crate::with_effect_context;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_state();
        let effect = displacement_effect(Some(4.0), None, None);
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_displacement_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(last_uniform("u_intensity"), vec![4.0]);
    }
}

mod register_gl_displacement_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_displacement_effect_runner,
        register_gl_displacement_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_displacement_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "DisplacementEffect").is_none());
        register_gl_displacement_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "DisplacementEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_displacement_effect_runner as GlEffectRunner
        ));
    }
}
