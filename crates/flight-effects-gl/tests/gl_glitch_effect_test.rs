use flight_effects::{GlitchEffect, create_glitch_effect};
use flight_effects_gl::contract::{
    apply_glitch_effect_to_gl, evaluate_glsl_scalar_expression, extract_glsl_expression,
};
use flight_entity::Ref;
use flight_regexp::create_reg_exp;

use crate::bindings;
use crate::gl_test_helper::{
    clear_calls, make_state, make_texture_target, shader_source_containing,
};

const FRAME_ROWS: f32 = 100.0;
const BLOCK_ROWS: f32 = 25.0;

fn apply(effect: &Ref<GlitchEffect>) {
    let mut state = make_state();
    let target = make_texture_target(&state, 200.0, FRAME_ROWS);
    clear_calls();
    apply_glitch_effect_to_gl(&mut state, &target, &target, &effect.read().unwrap()).unwrap();
}

fn block_expression() -> String {
    apply(&create_glitch_effect());
    let source = shader_source_containing("u_colorShift");
    return extract_glsl_expression(&source, &create_reg_exp("float block = ([^;]+);", ""));
}

fn block_at_texcoord_y(texcoord_y: f32) -> f32 {
    return evaluate_glsl_scalar_expression(
        &block_expression(),
        &bindings(&[
            ("blockSize", BLOCK_ROWS),
            ("u_resolution.y", FRAME_ROWS),
            ("v_texCoord.y", texcoord_y),
        ]),
    );
}

mod apply_glitch_effect_to_gl {
    use super::*;
    use crate::gl_test_helper::last_uniform;

    #[test]
    fn numbers_the_topmost_band_0() {
        assert_eq!(block_at_texcoord_y(0.9), 0.0);
    }

    #[test]
    fn numbers_the_bottommost_band_last() {
        assert_eq!(block_at_texcoord_y(0.1), 3.0);
    }

    #[test]
    fn numbers_bands_monotonically_downward_so_the_whole_sequence_runs_one_way() {
        let blocks: Vec<f32> = [0.95, 0.7, 0.45, 0.2]
            .iter()
            .map(|y| block_at_texcoord_y(*y))
            .collect();
        assert_eq!(blocks, vec![0.0, 1.0, 2.0, 3.0]);
        for index in 1..blocks.len() {
            assert!(blocks[index - 1] < blocks[index]);
        }
    }

    #[test]
    fn floors_block_size_at_two_rows_so_a_degenerate_size_cannot_divide_by_zero() {
        let effect = create_glitch_effect();
        effect.write().unwrap().block_size = Some(0.0);
        apply(&effect);
        assert_eq!(last_uniform("u_blockSize"), vec![0.0]);
        assert_eq!(
            evaluate_glsl_scalar_expression(
                "max(2.0, u_blockSize)",
                &bindings(&[("u_blockSize", 0.0)])
            ),
            2.0
        );
    }

    #[test]
    fn passes_the_descriptor_defaults_through_as_uniforms() {
        apply(&create_glitch_effect());
        assert_eq!(last_uniform("u_intensity"), vec![0.5]);
        assert_eq!(last_uniform("u_blockSize"), vec![24.0]);
        assert_eq!(last_uniform("u_colorShift"), vec![8.0]);
        assert_eq!(last_uniform("u_seed"), vec![0.0]);
    }
}

mod gl_glitch_effect_runner {
    use flight_effects_gl::contract::{get_gl_effect_program, gl_glitch_effect_runner};

    use super::*;
    use crate::gl_test_helper::{draws, linked_programs};
    use crate::with_effect_context;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_state();
        let effect = create_glitch_effect();
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_glitch_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
        let linked = linked_programs();
        // The pass compiled under the "stylization.glitch" key: asking for it again compiles nothing.
        let program = get_gl_effect_program(&state, "stylization.glitch", "unused").unwrap();
        assert_eq!(linked_programs(), linked);
        assert_eq!(draws()[0].program, program.program.0.get() as i32);
    }
}

mod register_gl_glitch_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_glitch_effect_runner, register_gl_glitch_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_glitch_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "GlitchEffect").is_none());
        register_gl_glitch_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "GlitchEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_glitch_effect_runner as GlEffectRunner
        ));
    }
}
