use flight_effects_wgpu::contract::*;
use flight_entity::Ref;
use flight_render_wgpu::*;

use crate::support::*;

const SOURCE_WIDTH: u32 = 64;
const SOURCE_HEIGHT: u32 = 32;

fn targets(state: &WgpuRenderState) -> (Ref<WgpuTextureRenderTarget>, Ref<WgpuTextureRenderTarget>) {
    return (
        create_test_target(state, SOURCE_WIDTH, SOURCE_HEIGHT),
        create_test_target(state, SOURCE_WIDTH, SOURCE_HEIGHT),
    );
}

fn offset_for(dx: f32, dy: f32) -> (f32, f32) {
    let mut state = create_wgpu_render_state_for_test(None);
    let (source, dest) = targets(&state);
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_wgpu_effect_blit_offset_pass(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            dx,
            dy,
        );
    });
    let uniforms = recorded_effect_uniforms(&records);
    return (uniforms[0][0], uniforms[0][1]);
}

mod apply_wgpu_effect_blit_offset_pass {
    use super::*;

    #[test]
    fn moves_the_image_right_for_a_positive_dx_by_offsetting_the_sample_left() {
        assert!(is_close(offset_for(8.0, 0.0).0, -8.0 / SOURCE_WIDTH as f32, 6));
    }

    #[test]
    fn moves_the_image_down_for_a_positive_dy_by_offsetting_the_sample_up() {
        assert!(is_close(offset_for(0.0, 8.0).1, -8.0 / SOURCE_HEIGHT as f32, 6));
    }

    #[test]
    fn negates_both_axes_for_a_positive_offset() {
        let (x, y) = offset_for(8.0, 8.0);
        assert!(x < 0.0);
        assert!(y < 0.0);
    }

    #[test]
    fn normalises_each_axis_by_the_source_dimension_for_that_axis() {
        let (x, y) = offset_for(16.0, 16.0);
        assert!(is_close(x, -16.0 / SOURCE_WIDTH as f32, 6));
        assert!(is_close(y, -16.0 / SOURCE_HEIGHT as f32, 6));
        assert!(!is_close(x.abs(), y.abs(), 6));
    }

    #[test]
    fn compiles_its_pipeline_once_per_state_and_reuses_it() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (source, dest) = targets(&state);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_blit_offset_pass(state, &source.read().unwrap(), &dest.read().unwrap(), 1.0, 1.0);
            apply_wgpu_effect_blit_offset_pass(state, &source.read().unwrap(), &dest.read().unwrap(), 2.0, 2.0);
        });

        assert_eq!(recorded_pipelines(&records).len(), 1);
    }
}

mod apply_wgpu_effect_blit_pass {
    use super::*;

    #[test]
    fn draws_the_source_into_the_destination_and_writes_no_offset() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (source, dest) = targets(&state);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_blit_pass(state, &source.read().unwrap(), &dest.read().unwrap());
        });

        assert_eq!(recorded_draws(&records).len(), 1);
        assert_eq!(recorded_draw_sources(&records), vec![source.read().unwrap().view.clone()]);
        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        assert_eq!(&recorded_effect_uniforms(&records)[0][0..4], &[0.0, 0.0, 0.0, 0.0]);
    }

    // The three passes are three DIFFERENT pipelines: a copy-paste pointing one at another's cache
    // would blit where it should erase, silently, because a blit and an erase both draw.
    #[test]
    fn uses_a_different_pipeline_from_the_erase_and_offset_passes() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (source, dest) = targets(&state);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_blit_pass(state, &source.read().unwrap(), &dest.read().unwrap());
            apply_wgpu_effect_erase_pass(state, &source.read().unwrap(), &dest.read().unwrap());
            apply_wgpu_effect_blit_offset_pass(state, &source.read().unwrap(), &dest.read().unwrap(), 1.0, 1.0);
        });

        let set = recorded_set_pipelines(&records);
        assert_eq!(set.len(), 3);
        assert_ne!(set[0], set[1]);
        assert_ne!(set[1], set[2]);
        assert_ne!(set[0], set[2]);
        assert_eq!(recorded_pipelines(&records).len(), 3);
    }
}

mod apply_wgpu_effect_erase_pass {
    use super::*;

    // On this backend the erase is a BLEND MODE baked into the pipeline: without it the pass runs,
    // draws, and quietly does not erase.
    #[test]
    fn builds_its_pipeline_in_the_erase_blend_mode_which_is_what_does_the_erasing() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (source, dest) = targets(&state);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_erase_pass(state, &source.read().unwrap(), &dest.read().unwrap());
        });

        let blend = recorded_pipelines(&records)[0].targets[0].as_ref().unwrap().blend.unwrap();
        assert_eq!(blend.color.src_factor, wgpu::BlendFactor::Zero);
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
    }

    #[test]
    fn binds_the_mask_as_its_source() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (mask, dest) = targets(&state);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_erase_pass(state, &mask.read().unwrap(), &dest.read().unwrap());
        });

        assert_eq!(recorded_draw_sources(&records), vec![mask.read().unwrap().view.clone()]);
    }
}
