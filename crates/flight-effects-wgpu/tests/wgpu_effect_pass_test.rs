use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

const FRAGMENT: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

const DUAL_FRAGMENT: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texA : texture_2d<f32>;
@group(1) @binding(1) var smpA : sampler;
@group(2) @binding(0) var texB : texture_2d<f32>;
@group(2) @binding(1) var smpB : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(texA, smpA, uv, 0.0) * textureSampleLevel(texB, smpB, uv, 0.0).a;
}"#;

fn blend_of(record: &WgpuRenderPipelineRecord) -> wgpu::BlendState {
    return record.targets[0]
        .as_ref()
        .and_then(|target| target.blend)
        .expect("an effect pipeline target carries a blend");
}

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|message| message.to_string())
        .unwrap_or_default();
}

// `select(whenFalse, whenTrue, condition)` in WGSL, read out of the shipped shader.
fn select_arguments(prefix: &str, component_index: usize) -> (f32, f32) {
    let line = EFFECT_VERTEX_WGSL
        .lines()
        .find(|line| line.trim_start().starts_with(prefix))
        .expect("the assignment exists in EFFECT_VERTEX_WGSL");
    let selects: Vec<&str> = line.split("select(").skip(1).collect();
    let chosen = selects[component_index];
    let mut arguments = chosen.split(',').map(|part| part.trim());
    let when_false: f32 = arguments.next().unwrap().parse().unwrap();
    let when_true: f32 = arguments.next().unwrap().parse().unwrap();
    return (when_false, when_true);
}

mod clear_wgpu_effect_target {
    use super::*;

    #[test]
    fn begins_a_pass_that_clears_rather_than_loads_and_ends_it() {
        let mut state = create_wgpu_render_state_for_test(None);
        let dest = create_test_target(&state, 64, 32);
        let records = record_test_commands(&state);
        let screen = begin_wgpu_screen_render_pass_for_test(&mut state, 64, 64);

        clear_wgpu_effect_target(screen.state, &dest.read().unwrap());

        let begins = recorded_pass_begins(&records);
        assert_eq!(begins.len(), 2);
        assert!(matches!(begins[1].color, WgpuColorLoadRecord::Clear(_)));
        assert!(recorded_draws(&records).is_empty());
        end_wgpu_render_pass(screen);
    }
}

mod create_wgpu_dual_source_effect_pipeline {
    use super::*;

    #[test]
    fn lays_out_two_texture_groups_after_the_uniform_group() {
        let mut state = create_wgpu_render_state_for_test(None);
        let a = create_test_target(&state, 8, 8);
        let b = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pipeline = create_wgpu_dual_source_effect_pipeline(&mut state, DUAL_FRAGMENT, None);
        // A layout of three groups is what lets groups 1 and 2 both bind a texture: the draw below
        // validates against it for real.
        let error = capture_test_validation_error(&state, || {});
        assert!(error.is_none());
        with_test_frame(&mut state, |state| {
            draw_wgpu_dual_source_effect_pass(
                state,
                &a.read().unwrap(),
                &b.read().unwrap(),
                Some(&dest.read().unwrap()),
                &mut pipeline,
                &mut |_, _| {},
            );
        });
        assert_eq!(pipeline.blend_mode, WgpuEffectBlendMode::Premul);
    }
}

mod create_wgpu_effect_pipeline {
    use super::*;

    // These three blend states ARE the compositing operators: every effect on this backend picks
    // one by name, so a wrong mapping composites every effect in that mode wrongly.
    #[test]
    fn maps_each_blend_mode_to_its_compositing_operator() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        create_wgpu_effect_pipeline(&mut state, FRAGMENT, Some(WgpuEffectBlendMode::Premul));
        create_wgpu_effect_pipeline(&mut state, FRAGMENT, Some(WgpuEffectBlendMode::Replace));
        create_wgpu_effect_pipeline(&mut state, FRAGMENT, Some(WgpuEffectBlendMode::Erase));

        let pipelines = recorded_pipelines(&records);
        let premul = blend_of(&pipelines[0]);
        assert_eq!(premul.color.src_factor, wgpu::BlendFactor::One);
        assert_eq!(premul.color.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
        assert_eq!(premul.alpha.src_factor, wgpu::BlendFactor::One);
        assert_eq!(premul.alpha.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
        let replace = blend_of(&pipelines[1]);
        assert_eq!(replace.color.src_factor, wgpu::BlendFactor::One);
        assert_eq!(replace.color.dst_factor, wgpu::BlendFactor::Zero);
        assert_eq!(replace.alpha.src_factor, wgpu::BlendFactor::One);
        assert_eq!(replace.alpha.dst_factor, wgpu::BlendFactor::Zero);
        let erase = blend_of(&pipelines[2]);
        assert_eq!(erase.color.src_factor, wgpu::BlendFactor::Zero);
        assert_eq!(erase.color.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
        assert_eq!(erase.alpha.src_factor, wgpu::BlendFactor::Zero);
        assert_eq!(erase.alpha.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
        for pipeline in &pipelines {
            assert_eq!(blend_of(pipeline).color.operation, wgpu::BlendOperation::Add);
            assert_eq!(blend_of(pipeline).alpha.operation, wgpu::BlendOperation::Add);
        }
    }

    #[test]
    fn defaults_to_premultiplied_compositing() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        let defaulted = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        create_wgpu_effect_pipeline(&mut state, FRAGMENT, Some(WgpuEffectBlendMode::Premul));

        assert_eq!(defaulted.blend_mode, WgpuEffectBlendMode::Premul);
        let pipelines = recorded_pipelines(&records);
        assert_eq!(blend_of(&pipelines[0]), blend_of(&pipelines[1]));
    }

    // The module compiles the shared vertex prefix and the caller fragment together: a fragment
    // naming only `fs_main` builds a pipeline whose vertex entry `vs_main` exists, which it could
    // not without the prefix.
    #[test]
    fn prepends_the_shared_fullscreen_vertex_to_the_caller_fragment() {
        let mut state = create_wgpu_render_state_for_test(None);
        let error = capture_test_validation_error(&state, || {});
        assert!(error.is_none());
        let pipeline = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        assert!(pipeline.compile_for_format.is_some());
        assert!(!FRAGMENT.contains("vs_main"));
    }
}

mod draw_wgpu_dual_source_effect_pass {
    use super::*;

    #[test]
    fn binds_the_two_sources_to_groups_one_and_two() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source0 = create_test_target(&state, 64, 32);
        let source1 = create_test_target(&state, 64, 32);
        let dest = create_test_target(&state, 64, 32);
        let mut pipeline = create_wgpu_dual_source_effect_pipeline(&mut state, DUAL_FRAGMENT, None);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            draw_wgpu_dual_source_effect_pass(
                state,
                &source0.read().unwrap(),
                &source1.read().unwrap(),
                Some(&dest.read().unwrap()),
                &mut pipeline,
                &mut |_, _| {},
            );
        });

        let sets = recorded_set_bind_groups(&records);
        assert_eq!(
            sets.iter().map(|set| set.index).collect::<Vec<u32>>(),
            vec![0, 1, 2]
        );
        assert_ne!(sets[1].bind_group, sets[2].bind_group);
    }
}

mod draw_wgpu_effect_pass {
    use super::*;

    #[test]
    fn draws_the_six_vertex_fullscreen_quad_into_a_loaded_destination() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 64, 32);
        let dest = create_test_target(&state, 64, 32);
        let mut pipeline = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            draw_wgpu_effect_pass(
                state,
                &source.read().unwrap(),
                Some(&dest.read().unwrap()),
                &mut pipeline,
                &mut |_, _| {},
            );
        });

        assert_eq!(
            recorded_draws(&records)
                .iter()
                .map(|draw| draw.vertex_count)
                .collect::<Vec<u32>>(),
            vec![6]
        );
        let begins = recorded_pass_begins(&records);
        assert_eq!(begins.len(), 1);
        assert_eq!(begins[0].color, WgpuColorLoadRecord::Load);
    }

    #[test]
    fn presents_to_the_open_pass_view_when_the_destination_is_none() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 64, 32);
        let mut pipeline = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        let screen = begin_wgpu_screen_render_pass_for_test(&mut state, 64, 64);
        let canvas_view = get_wgpu_active_render_pass(screen.state)
            .unwrap()
            .color_view
            .clone();
        let records = record_test_commands(screen.state);

        draw_wgpu_effect_pass(
            screen.state,
            &source.read().unwrap(),
            None,
            &mut pipeline,
            &mut |_, _| {},
        );

        assert_eq!(recorded_pass_views(&records), vec![canvas_view]);
        end_wgpu_render_pass(screen);
    }

    // Each draw takes its OWN uniform slot: the GPU reads the buffer at submit, so two draws
    // sharing a slot would both see whichever uniforms were written last.
    #[test]
    fn gives_consecutive_draws_distinct_ring_buffer_slots() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 64, 32);
        let dest = create_test_target(&state, 64, 32);
        let mut pipeline = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            for _ in 0..2 {
                draw_wgpu_effect_pass(
                    state,
                    &source.read().unwrap(),
                    Some(&dest.read().unwrap()),
                    &mut pipeline,
                    &mut |_, _| {},
                );
            }
        });

        let offsets: Vec<u32> = recorded_set_bind_groups(&records)
            .iter()
            .filter(|set| set.index == 0)
            .map(|set| set.offsets[0])
            .collect();
        assert_eq!(offsets[1] - offsets[0], 256);
    }

    #[test]
    fn wraps_back_to_the_first_slot_after_the_ring_is_full() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pipeline = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            for _ in 0..513 {
                draw_wgpu_effect_pass(
                    state,
                    &source.read().unwrap(),
                    Some(&dest.read().unwrap()),
                    &mut pipeline,
                    &mut |_, _| {},
                );
            }
        });

        let offsets: Vec<u32> = recorded_set_bind_groups(&records)
            .iter()
            .filter(|set| set.index == 0)
            .map(|set| set.offsets[0])
            .collect();
        assert_eq!(offsets[512], offsets[0]);
        assert_eq!(*offsets.iter().max().unwrap(), 511 * 256);
    }

    // The texture bind group is cached per VIEW, so a chain that ping-pongs between two targets
    // builds two bind groups and then reuses them.
    #[test]
    fn reuses_one_bind_group_per_source_view() {
        let mut state = create_wgpu_render_state_for_test(None);
        let first = create_test_target(&state, 8, 8);
        let second = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pipeline = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            for source in [&first, &second, &first] {
                draw_wgpu_effect_pass(
                    state,
                    &source.read().unwrap(),
                    Some(&dest.read().unwrap()),
                    &mut pipeline,
                    &mut |_, _| {},
                );
            }
        });

        assert_eq!(recorded_bind_groups(&records).len(), 2);
    }

    #[test]
    fn hands_the_uniform_writer_a_float_and_an_int_view_of_the_same_slot() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pipeline = create_wgpu_effect_pipeline(&mut state, FRAGMENT, None);
        let records = record_test_commands(&state);
        let mut lengths = (0, 0);

        with_test_frame(&mut state, |state| {
            draw_wgpu_effect_pass(
                state,
                &source.read().unwrap(),
                Some(&dest.read().unwrap()),
                &mut pipeline,
                &mut |f32, i32| {
                    lengths = (f32.len(), i32.len());
                    f32[0] = 1.5;
                    i32[1] = 7;
                },
            );
        });

        // Both views span the one slot, and what each wrote lands in the same uploaded bytes.
        assert_eq!(lengths, (64, 64));
        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][0], 1.5);
        assert_eq!(recorded_effect_uniform_ints(&records)[0][1], 7);
    }
}

mod effect_vertex_wgsl {
    use super::*;

    // Every WebGPU effect samples the uv this vertex shader emits, so which edge is uv.y = 0 is
    // fixed here, once: it is TOP, the opposite of the GL fullscreen quad.
    #[test]
    fn emits_a_top_left_uv_the_vertex_at_the_top_of_clip_space_carries_uv_y_zero() {
        let (position_y_when_false, position_y_when_true) = select_arguments("out.position", 1);
        let (uv_y_when_false, uv_y_when_true) = select_arguments("out.uv", 1);

        assert_eq!(position_y_when_true, 1.0);
        assert_eq!(uv_y_when_true, 0.0);
        assert_eq!(position_y_when_false, -1.0);
        assert_eq!(uv_y_when_false, 1.0);
    }

    #[test]
    fn does_not_flip_x_so_only_the_vertical_axis_differs_from_the_gl_quad() {
        let (position_x_when_false, position_x_when_true) = select_arguments("out.position", 0);
        let (uv_x_when_false, uv_x_when_true) = select_arguments("out.uv", 0);

        assert_eq!(position_x_when_true, 1.0);
        assert_eq!(uv_x_when_true, 1.0);
        assert_eq!(position_x_when_false, -1.0);
        assert_eq!(uv_x_when_false, 0.0);
    }

    #[test]
    fn needs_no_vertex_buffer_building_the_quad_from_the_vertex_index_alone() {
        assert!(EFFECT_VERTEX_WGSL.contains("@builtin(vertex_index)"));
    }
}

mod get_wgpu_effect_blend_mode_string {
    use super::*;

    #[test]
    fn returns_the_source_string_of_each_mode() {
        assert_eq!(get_wgpu_effect_blend_mode_string(WgpuEffectBlendMode::Erase), "erase");
        assert_eq!(get_wgpu_effect_blend_mode_string(WgpuEffectBlendMode::Premul), "premul");
        assert_eq!(get_wgpu_effect_blend_mode_string(WgpuEffectBlendMode::Replace), "replace");
    }
}

mod get_wgpu_effect_pass_state {
    use super::*;

    #[test]
    fn exposes_the_shared_layouts_and_sampler_the_custom_texture_recipes_bind_against() {
        let mut state = create_wgpu_render_state_for_test(None);
        let first = get_wgpu_effect_pass_state(&mut state);
        let second = get_wgpu_effect_pass_state(&mut state);

        assert_eq!(first.sampler, second.sampler);
        assert_eq!(first.texture_bind_group_layout, second.texture_bind_group_layout);
        assert_eq!(first.uniform_bind_group_layout, second.uniform_bind_group_layout);
        assert_ne!(first.texture_bind_group_layout, first.uniform_bind_group_layout);
    }

    #[test]
    fn hands_out_the_same_ring_buffer_slots_the_draw_helpers_use() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass_state = get_wgpu_effect_pass_state(&mut state);

        let first = (pass_state.acquire_slot)(&mut state);
        let second = (pass_state.acquire_slot)(&mut state);

        assert_eq!(first + 256, second);
    }

    // A programmer error, not an expected failure: a pass outside a frame has nothing to record
    // into, and the message names the call that was missed.
    #[test]
    fn panics_when_there_is_no_active_command_encoder() {
        let mut state = create_wgpu_render_state_for_test(None);
        let dest = create_test_target(&state, 8, 8);
        let pass_state = get_wgpu_effect_pass_state(&mut state);

        let result = catch_unwind(AssertUnwindSafe(|| {
            let _ = (pass_state.begin_pass)(&mut state, Some(&dest.read().unwrap()), wgpu::LoadOp::Load);
        }));

        assert!(panic_message(result.unwrap_err()).contains("beginWgpuRenderPass"));
    }
}

mod initialize_wgpu_dual_source_effect_pipeline {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_dual_source_effect_pipeline() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_dual_source_effect_pipeline(
            &mut state,
            DUAL_FRAGMENT,
            Some(WgpuEffectBlendMode::Replace),
        );

        initialize_wgpu_dual_source_effect_pipeline(&mut pipeline, &mut state, DUAL_FRAGMENT, None);

        assert_eq!(pipeline.blend_mode, WgpuEffectBlendMode::Premul);
        assert!(pipeline.variants.as_ref().is_some_and(|variants| variants.is_empty()));
    }
}

mod parse_wgpu_effect_blend_mode {
    use super::*;

    #[test]
    fn parses_each_source_string_and_rejects_others() {
        assert_eq!(parse_wgpu_effect_blend_mode("erase"), Some(WgpuEffectBlendMode::Erase));
        assert_eq!(parse_wgpu_effect_blend_mode("premul"), Some(WgpuEffectBlendMode::Premul));
        assert_eq!(parse_wgpu_effect_blend_mode("replace"), Some(WgpuEffectBlendMode::Replace));
        assert_eq!(parse_wgpu_effect_blend_mode("multiply"), None);
    }
}
