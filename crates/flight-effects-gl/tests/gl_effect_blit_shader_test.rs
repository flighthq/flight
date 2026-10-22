use flight_effects_gl::contract::apply_gl_effect_blit_offset_pass;

use crate::gl_test_helper::{clear_calls, make_state, make_texture_target, uniform_values};

const SOURCE_WIDTH: f32 = 64.0;
const SOURCE_HEIGHT: f32 = 32.0;

fn offset_for(dx: f32, dy: f32) -> Vec<f32> {
    let mut state = make_state();
    let source = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
    let dest = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
    clear_calls();
    apply_gl_effect_blit_offset_pass(&mut state, &source, &dest, dx, dy).unwrap();
    return uniform_values("u_offset").pop().unwrap();
}

mod apply_gl_effect_blit_offset_pass {
    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::linked_programs;

    #[test]
    fn moves_the_image_right_for_a_positive_dx_by_offsetting_the_sample_left() {
        // D1 f32 bound (TS: toBeCloseTo(x, 10))
        assert_close(offset_for(8.0, 0.0)[0], -8.0 / SOURCE_WIDTH, 0.5e-10);
    }

    #[test]
    fn moves_the_image_down_for_a_positive_dy_by_offsetting_the_sample_up() {
        // D1 f32 bound (TS: toBeCloseTo(x, 10))
        assert_close(offset_for(0.0, 8.0)[1], 8.0 / SOURCE_HEIGHT, 0.5e-10);
    }

    #[test]
    fn gives_the_two_axes_opposite_signs_for_the_same_positive_offset() {
        let offset = offset_for(8.0, 8.0);
        assert!(offset[0] < 0.0);
        assert!(offset[1] > 0.0);
    }

    #[test]
    fn normalises_each_axis_by_the_source_dimension_for_that_axis() {
        let offset = offset_for(16.0, 16.0);
        // D1 f32 bound (TS: toBeCloseTo(x, 10))
        assert_close(offset[0], -16.0 / SOURCE_WIDTH, 0.5e-10);
        assert_close(offset[1], 16.0 / SOURCE_HEIGHT, 0.5e-10);
        assert!((offset[0].abs() - offset[1].abs()).abs() > 0.5e-6);
    }

    #[test]
    fn leaves_the_image_where_it_is_for_a_zero_offset() {
        let offset = offset_for(0.0, 0.0);
        assert_eq!(offset, vec![0.0, 0.0]);
        assert!(offset[0].is_sign_negative());
        assert!(offset[1].is_sign_positive());
    }

    #[test]
    fn compiles_its_program_once_per_context_and_reuses_it() {
        let mut state = make_state();
        let source = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        let dest = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        clear_calls();
        apply_gl_effect_blit_offset_pass(&mut state, &source, &dest, 1.0, 1.0).unwrap();
        apply_gl_effect_blit_offset_pass(&mut state, &source, &dest, 2.0, 2.0).unwrap();
        assert_eq!(linked_programs(), 1);
    }
}

mod apply_gl_effect_blit_pass {
    use flight_effects_gl::contract::{
        apply_gl_effect_blit_offset_pass, apply_gl_effect_blit_pass, apply_gl_effect_erase_pass,
    };

    use super::*;
    use crate::gl_test_helper::{draws, linked_programs};

    #[test]
    fn draws_the_source_into_the_destination_with_no_offset_uniform() {
        let mut state = make_state();
        let source = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        let dest = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        clear_calls();
        apply_gl_effect_blit_pass(&mut state, &source, &dest).unwrap();
        assert_eq!(draws().len(), 1);
        assert!(uniform_values("u_offset").is_empty());
    }

    #[test]
    fn uses_a_different_program_from_the_erase_and_offset_passes() {
        let mut state = make_state();
        let source = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        let dest = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        clear_calls();
        apply_gl_effect_blit_pass(&mut state, &source, &dest).unwrap();
        apply_gl_effect_erase_pass(&mut state, &source, &dest).unwrap();
        apply_gl_effect_blit_offset_pass(&mut state, &source, &dest, 1.0, 1.0).unwrap();
        let mut programs: Vec<i32> = draws().iter().map(|draw| draw.program).collect();
        programs.sort();
        programs.dedup();
        assert_eq!(programs.len(), 3);
        assert_eq!(linked_programs(), 3);
    }
}

mod apply_gl_effect_erase_pass {
    use flight_effects_gl::contract::apply_gl_effect_erase_pass;

    use super::*;
    use crate::gl_test_helper::{calls_with, draws};

    #[test]
    fn sets_destination_out_blending_which_is_what_does_the_erasing() {
        let mut state = make_state();
        let source = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        let dest = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        clear_calls();
        apply_gl_effect_erase_pass(&mut state, &source, &dest).unwrap();
        let draw = &draws()[0];
        assert_eq!(
            (draw.blend_src, draw.blend_dst),
            (glow::ZERO as i32, glow::ONE_MINUS_SRC_ALPHA as i32)
        );
        let erase_blends: Vec<Vec<i64>> = calls_with("blend_func")
            .into_iter()
            .map(|call| call.integers)
            .filter(|pair| pair[0] == i64::from(glow::ZERO))
            .collect();
        assert_eq!(
            erase_blends,
            vec![vec![
                i64::from(glow::ZERO),
                i64::from(glow::ONE_MINUS_SRC_ALPHA)
            ]]
        );
    }

    #[test]
    fn binds_the_mask_as_its_source_texture() {
        let mut state = make_state();
        let source = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        let dest = make_texture_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
        clear_calls();
        apply_gl_effect_erase_pass(&mut state, &source, &dest).unwrap();
        assert_eq!(draws()[0].textures[0], source.texture.0.get() as i32);
    }
}
