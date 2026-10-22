use flight_effects::{ScanlinesEffect, create_scanlines_effect};
use flight_effects_gl::contract::{
    apply_scanlines_effect_to_gl, evaluate_glsl_scalar_expression, extract_glsl_expression,
};
use flight_entity::Ref;
use flight_regexp::create_reg_exp;

use crate::bindings;
use crate::gl_test_helper::{
    clear_calls, last_uniform, make_state, make_texture_target, shader_source_containing,
};

fn scanlines_effect(count: Option<f32>, intensity: Option<f32>) -> Ref<ScanlinesEffect> {
    let effect = create_scanlines_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.count = count;
        effect.intensity = intensity;
    }
    return effect;
}

fn apply(effect: &Ref<ScanlinesEffect>) {
    let mut state = make_state();
    let target = make_texture_target(&state, 80.0, 60.0);
    clear_calls();
    apply_scanlines_effect_to_gl(&mut state, &target, &target, &effect.read().unwrap()).unwrap();
}

fn line_at_image_y(image_y: f32, count: f32) -> f32 {
    apply(&scanlines_effect(None, None));
    let source = shader_source_containing("u_count");
    let expression = extract_glsl_expression(&source, &create_reg_exp("float line = ([^;]+);", ""));
    return evaluate_glsl_scalar_expression(
        &expression,
        &bindings(&[("v_texCoord.y", 1.0 - image_y), ("u_count", count)]),
    );
}

mod apply_scanlines_effect_to_gl {
    use super::*;
    use crate::assert_close;

    #[test]
    fn anchors_the_pattern_to_top_left_image_rows_rather_than_bottom_left_texcoords() {
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(line_at_image_y(0.2, 2.5), 1.0, 0.5e-6);
        assert_close(line_at_image_y(0.8, 2.5), 0.5, 0.5e-6);
    }

    #[test]
    fn passes_the_descriptor_values_through_to_the_shader_uniforms() {
        apply(&scanlines_effect(Some(17.0), Some(0.45)));
        assert_eq!(last_uniform("u_count"), vec![17.0]);
        // D1 f32 bound (TS: toBeCloseTo(0.45, 6))
        assert_close(last_uniform("u_intensity")[0], 0.45, 0.5e-6);
    }

    #[test]
    fn uses_the_documented_scanline_defaults() {
        apply(&scanlines_effect(None, None));
        assert_eq!(last_uniform("u_count"), vec![240.0]);
        // D1 f32 bound (TS: toBeCloseTo(0.3, 6))
        assert_close(last_uniform("u_intensity")[0], 0.3, 0.5e-6);
    }
}

mod gl_scanlines_effect_runner {
    use flight_effects_gl::contract::gl_scanlines_effect_runner;

    use super::*;
    use crate::with_effect_context;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_state();
        let effect = scanlines_effect(Some(13.0), None);
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_scanlines_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(last_uniform("u_count"), vec![13.0]);
    }
}

mod register_gl_scanlines_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_scanlines_effect_runner,
        register_gl_scanlines_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_scanlines_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "ScanlinesEffect").is_none());
        register_gl_scanlines_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "ScanlinesEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_scanlines_effect_runner as GlEffectRunner
        ));
    }
}
