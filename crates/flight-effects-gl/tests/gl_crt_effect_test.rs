use flight_effects::create_crt_effect;
use flight_effects_gl::contract::{
    apply_crt_effect_to_gl, evaluate_glsl_scalar_expression, extract_glsl_expression,
};
use flight_regexp::create_reg_exp;

use crate::bindings;
use crate::gl_test_helper::{make_state, make_texture_target, shader_source_containing};

const RESOLUTION_ROWS: f32 = 10.0;
const HALF_SCANLINE_BELOW_TOP: f32 = 1.0 - 0.5 / RESOLUTION_ROWS;

fn scanline_expression() -> String {
    let mut state = make_state();
    let target = make_texture_target(&state, 4.0, RESOLUTION_ROWS);
    apply_crt_effect_to_gl(
        &mut state,
        &target,
        &target,
        &create_crt_effect().read().unwrap(),
    )
    .unwrap();
    let source = shader_source_containing("u_scanlineIntensity");
    return extract_glsl_expression(&source, &create_reg_exp("float line = ([^;]+);", ""));
}

fn line_at(uv_y: f32) -> f32 {
    return evaluate_glsl_scalar_expression(
        &scanline_expression(),
        &bindings(&[("u_resolution.y", RESOLUTION_ROWS), ("uv.y", uv_y)]),
    );
}

mod apply_crt_effect_to_gl {
    use super::*;
    use crate::assert_close;

    #[test]
    fn puts_the_first_scanline_peak_half_a_line_below_the_top_of_the_image() {
        // D1 f32 bound (TS: toBeCloseTo(1, 6))
        assert_close(line_at(HALF_SCANLINE_BELOW_TOP), 1.0, 0.5e-6);
    }

    #[test]
    fn puts_a_trough_half_a_line_below_the_bottom_of_the_image_so_the_pattern_is_anchored_to_one_edge()
     {
        // D1 f32 bound (TS: toBeCloseTo(0, 6))
        assert_close(line_at(0.5 / RESOLUTION_ROWS), 0.0, 0.5e-6);
    }

    #[test]
    fn darkens_a_trough_row_and_leaves_a_peak_row_alone_scaled_by_scanline_intensity() {
        let peak = line_at(HALF_SCANLINE_BELOW_TOP);
        let trough = line_at(0.5 / RESOLUTION_ROWS);
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(1.0 - 0.3 * (1.0 - peak), 1.0, 0.5e-6);
        assert_close(1.0 - 0.3 * (1.0 - trough), 0.7, 0.5e-6);
    }
}

mod gl_crt_effect_runner {
    use flight_effects_gl::contract::gl_crt_effect_runner;

    use super::*;
    use crate::gl_test_helper::{clear_calls, draws, shader_sources};
    use crate::with_effect_context;

    // TS asserts the `stylization.crt` program key; the native observable is that the CRT program
    // was compiled and drawn.
    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_state();
        let effect = create_crt_effect();
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_crt_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert!(
            shader_sources()
                .iter()
                .any(|source| source.contains("u_scanlineIntensity"))
        );
        assert_eq!(draws().len(), 1);
    }
}

mod register_gl_crt_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_crt_effect_runner, register_gl_crt_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_crt_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "CrtEffect").is_none());
        register_gl_crt_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "CrtEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_crt_effect_runner as GlEffectRunner
        ));
    }
}
