use flight_render::RenderTargetClear;
use std::sync::{Arc, Mutex, RwLock};

use flight_adjustments::{Adjustment, create_hue_saturation_adjustment, create_invert_adjustment};
use flight_effects::EffectStateOptions;
use flight_effects_wgpu::contract::*;
use flight_entity::Ref;
use flight_render::RenderTargetFormat;
use flight_render_wgpu::*;
use flight_texture::RenderTargetColorSpace;

use crate::support::*;

fn scene_target(pipeline: &WgpuEffectState) -> Ref<WgpuTextureRenderTarget> {
    return pipeline.scene_target.clone().expect("a begun pipeline has a scene target");
}

fn run_empty_frame(state: &mut WgpuRenderState, pipeline: &mut WgpuEffectState) {
    let mut screen = begin_wgpu_screen_render_pass_for_test(state, 800, 600);
    let scene = begin_wgpu_effect_pass(&mut screen, pipeline, None, None);
    end_wgpu_effect_pass(scene, pipeline, &[]);
    end_wgpu_render_pass(screen);
}

fn clear_of(begin: &WgpuRenderPassBeginRecord) -> WgpuClearColorRecord {
    let WgpuColorLoadRecord::Clear(clear) = begin.color else {
        panic!("the scene pass clears");
    };
    return clear;
}

mod begin_wgpu_effect_pass {
    use super::*;

    #[test]
    fn allocates_the_scene_target_on_first_begin_and_reuses_the_same_one_afterwards() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &[]);
        let first = scene_target(&pipeline);
        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &[]);

        // Begin resizes rather than reallocating, so a per-frame pipeline does not churn GPU memory.
        assert!(Arc::ptr_eq(&scene_target(&pipeline), &first));
        end_wgpu_render_pass(screen);
    }

    #[test]
    fn stamps_the_requested_color_space_onto_the_scene_target_before_the_pass_opens() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(
            &mut screen,
            &mut pipeline,
            None,
            Some(RenderTargetColorSpace::Linear),
        );

        assert_eq!(
            scene_target(&pipeline).read().unwrap().color_space,
            RenderTargetColorSpace::Linear
        );
        end_wgpu_effect_pass(scene, &mut pipeline, &[]);
        end_wgpu_render_pass(screen);
    }

    // The clear is an argument, not a state property: what the frame clears to is per-pass data.
    #[test]
    fn clears_the_scene_target_to_the_colour_it_is_given() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let records = record_test_commands(&state);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let clear = RenderTargetClear {
            color: Some([0x40 as f32 / 255.0, 0x80 as f32 / 255.0, 0xc0 as f32 / 255.0, 1.0]),
            colors: None,
            depth: Some(1.0),
            stencil: None,
        };
        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, Some(&clear), None);

        let clear = clear_of(recorded_pass_begins(&records).last().unwrap());
        assert!(is_close(clear.r as f32, 0x40 as f32 / 255.0, 2));
        assert!(is_close(clear.g as f32, 0x80 as f32 / 255.0, 2));
        assert!(is_close(clear.b as f32, 0xc0 as f32 / 255.0, 2));
        assert_eq!(clear.a, 1.0);
        end_wgpu_effect_pass(scene, &mut pipeline, &[]);
        end_wgpu_render_pass(screen);
    }

    #[test]
    fn clears_to_transparent_black_when_the_caller_names_no_colour() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let records = record_test_commands(&state);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);

        let clear = clear_of(recorded_pass_begins(&records).last().unwrap());
        assert_eq!([clear.r, clear.g, clear.b, clear.a], [0.0, 0.0, 0.0, 0.0]);
        end_wgpu_effect_pass(scene, &mut pipeline, &[]);
        end_wgpu_render_pass(screen);
    }

    #[test]
    fn realizes_a_four_sample_scene_target_at_twice_the_canvas_extent() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(
            &state,
            Some(&EffectStateOptions {
                sample_count: Some(4.0),
                ..test_default()
            }),
        );
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);

        {
            let target = scene_target(&pipeline);
            let target = target.read().unwrap();
            assert_eq!(target.width, 1600);
            assert_eq!(target.height, 1200);
            assert_eq!(target.sample_count, 4);
        }
        end_wgpu_effect_pass(scene, &mut pipeline, &[]);
        end_wgpu_render_pass(screen);
    }
}

mod create_wgpu_effect_state {
    use super::*;

    #[test]
    fn returns_a_pipeline_with_nothing_allocated_yet() {
        let state = create_wgpu_render_state_for_test(None);

        let pipeline = create_wgpu_effect_state(&state, None);

        assert!(pipeline.scene_target.is_none());
        assert!(pipeline.velocity_texture.is_none());
        assert!(pipeline.lut_texture.texture.is_none());
        assert_eq!(pipeline.lut_texture.size, 0);
        assert!(pipeline.lut_texture.lut.is_none());
        assert!(pipeline.lut_cache.signature.is_none());
    }

    // The pipeline outlives the call; an alias would let a caller retune the format of a pipeline
    // whose scene target was already allocated.
    #[test]
    fn copies_the_options_rather_than_aliasing_the_caller_object() {
        let state = create_wgpu_render_state_for_test(None);
        let mut options = EffectStateOptions {
            format: Some(RenderTargetFormat::Rgba16F),
            ..test_default()
        };

        let pipeline = create_wgpu_effect_state(&state, Some(&options));
        options.format = Some(RenderTargetFormat::Rgba8);
        assert_eq!(options.format, Some(RenderTargetFormat::Rgba8));

        assert_eq!(pipeline.options.format, Some(RenderTargetFormat::Rgba16F));
    }

    #[test]
    fn retains_the_supported_four_sample_request() {
        let state = create_wgpu_render_state_for_test(None);

        let pipeline = create_wgpu_effect_state(
            &state,
            Some(&EffectStateOptions {
                sample_count: Some(4.0),
                ..test_default()
            }),
        );

        assert_eq!(pipeline.options.sample_count, Some(4.0));
    }

    #[test]
    fn gives_each_pipeline_its_own_pool_and_caches() {
        let state = create_wgpu_render_state_for_test(None);

        let a = create_wgpu_effect_state(&state, None);
        let b = create_wgpu_effect_state(&state, None);

        // Owned values: each pipeline holds its own pool, LUT cache and LUT texture memo.
        assert!(!std::ptr::eq(&a.pool, &b.pool));
        assert!(!std::ptr::eq(&a.lut_cache, &b.lut_cache));
        assert!(!std::ptr::eq(&a.lut_texture, &b.lut_texture));
        assert_ne!(
            flight_entity::get_entity_id(&a.lut_cache),
            flight_entity::get_entity_id(&b.lut_cache)
        );
    }
}

mod destroy_wgpu_effect_state {
    use super::*;

    #[test]
    fn releases_the_scene_target_and_clears_the_lut_caches() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        run_empty_frame(&mut state, &mut pipeline);
        let scene = scene_target(&pipeline);

        destroy_wgpu_effect_state(&state, &mut pipeline);

        assert!(pipeline.scene_target.is_none());
        assert!(is_test_texture_destroyed(&state, &scene.read().unwrap().texture));
        assert!(pipeline.lut_texture.texture.is_none());
        assert_eq!(pipeline.lut_texture.size, 0);
        assert!(pipeline.lut_texture.lut.is_none());
        assert!(pipeline.lut_cache.signature.is_none());
        assert!(pipeline.lut_cache.lut.is_none());
    }

    #[test]
    fn is_safe_on_a_pipeline_that_never_began_a_frame() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);

        destroy_wgpu_effect_state(&state, &mut pipeline);

        assert!(pipeline.scene_target.is_none());
    }

    #[test]
    fn is_idempotent_a_second_destroy_neither_panics_nor_resurrects_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        run_empty_frame(&mut state, &mut pipeline);

        destroy_wgpu_effect_state(&state, &mut pipeline);
        destroy_wgpu_effect_state(&state, &mut pipeline);

        assert!(pipeline.scene_target.is_none());
    }
}

mod end_wgpu_effect_pass {
    use super::*;

    // The early return is the only thing standing between an unbegun pipeline and ending a pass
    // the pipeline never opened.
    #[test]
    fn returns_without_touching_the_pipeline_when_no_scene_target_was_begun() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);
        let index = screen.index;
        let state = screen.state;

        end_wgpu_effect_pass(
            WgpuRenderPass {
                state: &mut *state,
                index,
            },
            &mut pipeline,
            &[],
        );

        assert_eq!(get_wgpu_render_state_runtime(state).pass_stack.len(), 1);
        end_wgpu_render_pass(WgpuRenderPass { state, index });
        assert!(pipeline.scene_target.is_none());
        assert!(pipeline.pool.free.is_empty());
    }

    // The present overwrites, it does not composite: dstFactor zero makes the destination (and
    // therefore the enclosing clear) unable to contribute to the presented pixel at any alpha.
    #[test]
    fn presents_with_a_blend_the_enclosing_clear_cannot_contribute_to() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);

        run_empty_frame(&mut state, &mut pipeline);

        let present = get_wgpu_effect_pipeline(&mut state, "effect.present", "", None);
        assert_eq!(present.read().unwrap().blend_mode, WgpuEffectBlendMode::Replace);
    }

    #[test]
    fn runs_an_empty_operation_list_without_allocating_scratch_targets() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);

        run_empty_frame(&mut state, &mut pipeline);

        assert_eq!(pipeline.pool.free.len(), 0);
    }

    #[test]
    fn presents_the_final_result_with_replace_blend_so_transparent_pixels_overwrite_the_screen_clear() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(
            &state,
            Some(&EffectStateOptions {
                format: Some(RenderTargetFormat::Rgba16F),
                ..test_default()
            }),
        );
        let records = record_test_commands(&state);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(
            &mut screen,
            &mut pipeline,
            None,
            Some(RenderTargetColorSpace::Linear),
        );
        end_wgpu_effect_pass(scene, &mut pipeline, &[]);

        let present = recorded_pipelines(&records).last().cloned().unwrap();
        let blend = present.targets[0].as_ref().unwrap().blend.unwrap();
        assert_eq!(blend.color.src_factor, wgpu::BlendFactor::One);
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::Zero);
        assert_eq!(blend.alpha.src_factor, wgpu::BlendFactor::One);
        assert_eq!(blend.alpha.dst_factor, wgpu::BlendFactor::Zero);
        end_wgpu_render_pass(screen);
    }

    // An unregistered kind is skipped, so the chain does no work, but the bracketing still has to
    // balance.
    #[test]
    fn returns_pooled_scratch_targets_after_running_a_chain() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let chain = vec![WgpuEffectOperation::Effect(create_test_effect(
            "test.wgpu-pipeline-unregistered",
        ))];
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &chain);
        end_wgpu_render_pass(screen);

        let scene = scene_target(&pipeline);
        assert!(pipeline.pool.free.iter().all(|target| !Arc::ptr_eq(target, &scene)));
    }

    // A maximal run of matrix-tier adjustments fuses into ONE color-matrix pass, and both scratch
    // targets go back to the pool afterwards.
    #[test]
    fn fuses_a_run_of_matrix_adjustments_into_one_color_matrix_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let invert: Ref<dyn Adjustment> = Arc::new(RwLock::new(create_invert_adjustment(None)));
        let chain = vec![
            WgpuEffectOperation::Adjustment(invert.clone()),
            WgpuEffectOperation::Adjustment(invert),
        ];
        let records = record_test_commands(&state);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &chain);
        end_wgpu_render_pass(screen);

        // One color-matrix draw plus the present.
        assert_eq!(recorded_draws(&records).len(), 2);
        // Two inverts fuse to identity: the uploaded rows are the identity packing.
        let uniforms = recorded_effect_uniforms(&records);
        assert!(is_close(uniforms[0][0], 1.0, 4));
        assert!(is_close(uniforms[0][16], 0.0, 4));
        assert_eq!(pipeline.pool.free.len(), 2);
    }

    // Any LUT-tier member bakes the whole run (matrices folded in) into one color LUT.
    #[test]
    fn bakes_a_run_containing_a_lut_adjustment_into_one_lut_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let invert: Ref<dyn Adjustment> = Arc::new(RwLock::new(create_invert_adjustment(None)));
        let hue: Ref<dyn Adjustment> = Arc::new(RwLock::new(create_hue_saturation_adjustment(None)));
        let chain = vec![
            WgpuEffectOperation::Adjustment(invert),
            WgpuEffectOperation::Adjustment(hue),
        ];
        let records = record_test_commands(&state);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &chain);
        end_wgpu_render_pass(screen);

        assert_eq!(recorded_draws(&records).len(), 2);
        assert!(pipeline.lut_texture.texture.is_some());
        assert!(pipeline.lut_cache.signature.is_some());
    }

    // An effect breaks the adjustment run: the run flushes first, then the effect runs, then the
    // result presents.
    #[test]
    fn runs_a_registered_effect_after_flushing_the_pending_adjustments() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_blur_effect(&mut state);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let invert: Ref<dyn Adjustment> = Arc::new(RwLock::new(create_invert_adjustment(None)));
        let blur: flight_effects::EffectRef = flight_effects::create_blur_effect();
        let chain = vec![
            WgpuEffectOperation::Adjustment(invert),
            WgpuEffectOperation::Effect(blur),
        ];
        let records = record_test_commands(&state);
        let mut screen = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let scene = begin_wgpu_effect_pass(&mut screen, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &chain);
        end_wgpu_render_pass(screen);

        // Matrix pass, two blur axes, present.
        assert_eq!(recorded_draws(&records).len(), 4);
    }
}

mod set_wgpu_effect_state_sample_count_guard {
    use super::*;

    #[test]
    fn reports_the_requested_and_applied_sample_counts_through_the_optional_diagnostics_seam() {
        let mut state = create_wgpu_render_state_for_test(None);
        let substitutions: Arc<Mutex<Vec<(f32, f32)>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = substitutions.clone();
        set_wgpu_effect_state_sample_count_guard(
            &mut state,
            Some(Arc::new(move |_state: &WgpuRenderState, requested: f32, applied: f32| {
                sink.lock().unwrap().push((requested, applied));
            })),
        );

        create_wgpu_effect_state(
            &state,
            Some(&EffectStateOptions {
                sample_count: Some(2.0),
                ..test_default()
            }),
        );
        assert_eq!(*substitutions.lock().unwrap(), vec![(2.0, 4.0)]);

        set_wgpu_effect_state_sample_count_guard(&mut state, None);
        create_wgpu_effect_state(
            &state,
            Some(&EffectStateOptions {
                sample_count: Some(8.0),
                ..test_default()
            }),
        );
        assert_eq!(*substitutions.lock().unwrap(), vec![(2.0, 4.0)]);
    }
}

mod set_wgpu_effect_state_skip_guard {
    use super::*;

    // Clearing must restore the original silence exactly: the seam is the ONLY path by which a
    // dropped effect is observable.
    #[test]
    fn reports_every_effect_kind_the_pass_drops_and_goes_silent_again_when_cleared() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let dropped: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = dropped.clone();
        let chain = vec![WgpuEffectOperation::Effect(create_test_effect(
            "test.wgpu-pipeline-skip-seam",
        ))];

        set_wgpu_effect_state_skip_guard(
            &mut state,
            Some(Arc::new(move |_state: &WgpuRenderState, kind: &str| {
                sink.lock().unwrap().push(kind.to_string());
            })),
        );
        let mut guarded = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);
        let scene = begin_wgpu_effect_pass(&mut guarded, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &chain);
        end_wgpu_render_pass(guarded);

        assert_eq!(*dropped.lock().unwrap(), vec!["test.wgpu-pipeline-skip-seam".to_string()]);

        set_wgpu_effect_state_skip_guard(&mut state, None);
        let mut silent = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);
        let scene = begin_wgpu_effect_pass(&mut silent, &mut pipeline, None, None);
        end_wgpu_effect_pass(scene, &mut pipeline, &chain);
        end_wgpu_render_pass(silent);

        assert_eq!(*dropped.lock().unwrap(), vec!["test.wgpu-pipeline-skip-seam".to_string()]);
    }
}

mod set_wgpu_effect_velocity_texture {
    use super::*;

    #[test]
    fn sets_the_velocity_texture_on_the_pipeline() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pipeline = create_wgpu_effect_state(&state, None);
        let texture = create_test_target(&state, 4, 4).read().unwrap().texture.clone();

        set_wgpu_effect_velocity_texture(&mut pipeline, Some(texture.clone()));

        assert_eq!(pipeline.velocity_texture, Some(texture));
    }
}
