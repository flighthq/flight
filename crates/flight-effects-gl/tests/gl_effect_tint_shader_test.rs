use flight_effects_gl::contract::{apply_gl_effect_invert_tint_pass, apply_gl_effect_tint_pass};

use crate::assert_close;
use crate::gl_test_helper::{clear_calls, last_uniform, make_state, make_texture_target};

mod apply_gl_effect_invert_tint_pass {
    use super::*;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_gl_effect_invert_tint_pass(&mut state, &target, &target, 0x000000ff, 1.0, 1.0)
            .unwrap();
        assert_eq!(crate::gl_test_helper::draws().len(), 1);
    }

    #[test]
    fn reads_the_packed_color_and_folds_its_alpha_the_same_contract_as_the_non_inverted_pass() {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_gl_effect_invert_tint_pass(&mut state, &target, &target, 0x9d55ff80, 0.5, 1.0)
            .unwrap();
        let color = last_uniform("u_color");
        // D1 f32 bound (TS: toBeCloseTo(x, 5))
        assert_close(color[0], 0x9d as f32 / 255.0, 0.5e-5);
        assert_close(color[1], 0x55 as f32 / 255.0, 0.5e-5);
        assert_close(color[2], 1.0, 0.5e-5);
        assert_close(
            last_uniform("u_alpha")[0],
            (0x80 as f32 / 255.0) * 0.5,
            0.5e-5,
        );
    }
}

mod apply_gl_effect_tint_pass {
    use super::*;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_gl_effect_tint_pass(&mut state, &target, &target, 0x000000ff, 1.0, 1.0).unwrap();
        assert_eq!(crate::gl_test_helper::draws().len(), 1);
    }

    #[test]
    fn splits_a_packed_rgba_color_into_the_shader_rgb_and_an_alpha_multiplied_by_the_caller_alpha()
    {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_gl_effect_tint_pass(&mut state, &target, &target, 0x9d55ff80, 0.5, 1.0).unwrap();
        let color = last_uniform("u_color");
        // D1 f32 bound (TS: toBeCloseTo(x, 5))
        assert_close(color[0], 0x9d as f32 / 255.0, 0.5e-5);
        assert_close(color[1], 0x55 as f32 / 255.0, 0.5e-5);
        assert_close(color[2], 1.0, 0.5e-5);
        assert_close(
            last_uniform("u_alpha")[0],
            (0x80 as f32 / 255.0) * 0.5,
            0.5e-5,
        );
    }

    #[test]
    fn passes_an_opaque_tint_through_at_exactly_the_caller_alpha() {
        let mut state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        apply_gl_effect_tint_pass(&mut state, &target, &target, 0xffffffff, 0.25, 1.0).unwrap();
        // D1 f32 bound (TS: toBeCloseTo(0.25, 5))
        assert_close(last_uniform("u_alpha")[0], 0.25, 0.5e-5);
    }
}
