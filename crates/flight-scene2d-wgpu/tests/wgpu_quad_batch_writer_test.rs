use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::create_matrix;
use flight_materials::contract::create_standard_material;
use flight_materials::{
    BLEND_MODE_DARKEN, BLEND_MODE_LIGHTEN, BLEND_MODE_MULTIPLY, BLEND_MODE_SCREEN, Material2D,
};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

const CT_MODE_NONE: u32 = 0;
const CT_MODE_UNIFORM: u32 = 1;

fn create_test_material() -> Ref<dyn Material2D> {
    return Arc::new(RwLock::new(create_standard_material()));
}

fn standard() -> WgpuQuadMaterialRenderer {
    return STANDARD_WGPU_QUAD_MATERIAL_RENDERER.clone();
}

mod ensure_wgpu_quad_batch_resources {
    use super::*;

    #[test]
    fn returns_resources_with_bind_group_layouts_and_an_empty_pipeline_cache() {
        let state = create_wgpu_render_state_for_test(None);
        let resources = ensure_wgpu_quad_batch_resources(&state);
        assert_ne!(
            resources.instance_bind_group_layout,
            resources.material_bind_group_layout
        );
        assert_ne!(
            resources.base_pipeline_layout,
            resources.material_pipeline_layout
        );
        assert!(resources.pipelines.is_empty());
    }

    #[test]
    fn is_idempotent_returning_the_same_resources_on_repeated_calls() {
        let state = create_wgpu_render_state_for_test(None);
        let r1 = ensure_wgpu_quad_batch_resources(&state);
        let r2 = ensure_wgpu_quad_batch_resources(&state);
        assert_eq!(r1.instance_bind_group_layout, r2.instance_bind_group_layout);
        assert_eq!(r1.base_pipeline_layout, r2.base_pipeline_layout);
    }
}

mod flush_wgpu_quad_batch_writer {
    use super::*;

    #[test]
    fn does_nothing_when_batch_count_is_zero() {
        let mut state = create_test_state_in_pass();
        flush_wgpu_quad_batch_writer(&mut state);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_buffer_cursor,
            0
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn resets_state_after_flush() {
        let mut state = create_test_state_in_pass();
        let tex = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        flush_wgpu_quad_batch_writer(&mut state);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.quad_batch_writer_count, 0);
        assert!(runtime.quad_batch_writer_texture.is_none());
        assert!(runtime.quad_batch_writer_blend_mode.is_none());
        assert!(runtime.quad_batch_writer_material.is_none());
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn records_the_flush_in_render_stats_from_the_live_draw_path() {
        let mut state = create_test_state_in_pass();
        reset_wgpu_render_stats(&mut state);
        let tex = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 3;
        flush_wgpu_quad_batch_writer(&mut state);

        let stats = get_wgpu_render_stats(&mut state);
        assert_eq!(stats.batch_flush_count, 1);
        assert_eq!(stats.draw_call_count, 1);
        assert_eq!(stats.instance_count, 3);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn records_nothing_when_the_flush_issues_no_draw() {
        let mut state = create_test_state_in_pass();
        reset_wgpu_render_stats(&mut state);
        flush_wgpu_quad_batch_writer(&mut state);
        assert_eq!(get_wgpu_render_stats(&mut state).batch_flush_count, 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn claims_a_distinct_buffer_per_flush_so_deferred_draws_never_share_one() {
        let mut state = create_test_state_in_pass();
        let tex1 = create_test_texture_entry(&state);
        let tex2 = create_test_texture_entry(&state);

        prepare_wgpu_quad_batch_write(&mut state, &tex1, None, None, None, &standard(), 1, None);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        flush_wgpu_quad_batch_writer(&mut state);

        prepare_wgpu_quad_batch_write(&mut state, &tex2, None, None, None, &standard(), 1, None);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        flush_wgpu_quad_batch_writer(&mut state);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.quad_batch_writer_buffer_cursor, 2);
        let pool = &runtime.quad_batch_writer_buffer_pool;
        assert!(pool[0].instance_buffer.is_some());
        assert_ne!(pool[0].instance_buffer, pool[1].instance_buffer);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn uploads_exactly_the_recorded_instance_floats() {
        let mut state = create_test_state_in_pass();
        let native = get_wgpu_render_state_native_device(&state);
        let records = record_test_commands(&native);
        let tex = create_test_texture_entry(&state);
        let base =
            prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        let transform = create_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        write_wgpu_quad_batch_instance(
            &mut get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_instance_data,
            base as usize * QUAD_BATCH_INSTANCE_FLOATS,
            &transform,
            4.0,
            5.0,
            0.0,
            0.0,
            1.0,
            1.0,
            0.5,
        );
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        flush_wgpu_quad_batch_writer(&mut state);

        let instance_buffer = get_wgpu_render_state_runtime(&state).quad_batch_writer_buffer_pool
            [0]
        .instance_buffer
        .clone()
        .unwrap();
        let write = recorded_buffer_writes(&records)
            .into_iter()
            .find(|write| write.buffer == instance_buffer)
            .unwrap();
        assert_eq!(
            bytes_to_f32(&write.data),
            vec![
                4.0, 0.0, 0.0, 5.0, 2.0, 3.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.5
            ]
        );
        submit_wgpu_frame(&mut state);
    }
}

mod get_wgpu_quad_batch_pipeline {
    use super::*;

    #[test]
    fn creates_and_caches_a_pipeline_for_a_given_shader_module() {
        let mut state = create_wgpu_render_state_for_test(None);
        let resources = ensure_wgpu_quad_batch_resources(&state);
        let module = (standard().get_shader_module)(&mut state);
        let pipeline = get_wgpu_quad_batch_pipeline(&state, &resources, &module, false, None);
        let pipeline2 = get_wgpu_quad_batch_pipeline(&state, &resources, &module, false, None);
        assert_eq!(pipeline, pipeline2);
    }

    #[test]
    fn uses_the_shared_fixed_function_blend_table_for_every_batch_mode() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let resources = ensure_wgpu_quad_batch_resources(&state);
        let module = (standard().get_shader_module)(&mut state);
        let blend_of = |mode: &str| {
            let pipeline = get_wgpu_quad_batch_pipeline(
                &state,
                &resources,
                &module,
                false,
                Some(&mode.to_string()),
            );
            let record = recorded_pipelines(&records)
                .into_iter()
                .find(|record| record.pipeline == pipeline)
                .unwrap();
            return record.targets[0].as_ref().unwrap().blend.unwrap().color;
        };

        assert_eq!(
            blend_of(BLEND_MODE_MULTIPLY),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Dst,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(
            blend_of(BLEND_MODE_SCREEN),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrc,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(
            blend_of(BLEND_MODE_DARKEN).operation,
            wgpu::BlendOperation::Min
        );
        assert_eq!(
            blend_of(BLEND_MODE_LIGHTEN).operation,
            wgpu::BlendOperation::Max
        );
    }
}

mod get_wgpu_quad_batch_prelude_wgsl {
    use super::*;

    #[test]
    fn returns_the_shared_wgsl_prelude_containing_the_base_structs() {
        let wgsl = get_wgpu_quad_batch_prelude_wgsl();
        assert!(wgsl.contains("struct Uniforms"));
        assert!(wgsl.contains("quadBaseVertex"));
        assert!(wgsl.contains("straightTextureAlpha : u32"));
    }
}

mod pack_wgpu_quad_batch_material_instance {
    use super::*;

    #[test]
    fn is_a_no_op_when_no_per_instance_material_data_is_active() {
        let mut state = create_wgpu_render_state_for_test(None);
        let before = get_wgpu_render_state_runtime(&state)
            .quad_batch_writer_material_data
            .clone();
        pack_wgpu_quad_batch_material_instance(&mut state, None, 0);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_material_data,
            before
        );
    }
}

mod prepare_wgpu_quad_batch_write {
    use super::*;

    #[test]
    fn returns_instance_index_0_for_an_empty_batch() {
        let mut state = create_wgpu_render_state_for_test(None);
        let tex = create_test_texture_entry(&state);
        let base =
            prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        assert_eq!(base, 0);
    }

    #[test]
    fn flushes_when_texture_changes() {
        let mut state = create_test_state_in_pass();
        let tex1 = create_test_texture_entry(&state);
        let tex2 = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(&mut state, &tex1, None, None, None, &standard(), 1, None);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        prepare_wgpu_quad_batch_write(&mut state, &tex2, None, None, None, &standard(), 1, None);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(Arc::ptr_eq(
            runtime.quad_batch_writer_texture.as_ref().unwrap(),
            &tex2
        ));
        assert_eq!(runtime.quad_batch_writer_count, 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn flushes_when_material_changes() {
        let mut state = create_test_state_in_pass();
        let tex = create_test_texture_entry(&state);
        let material_a = create_test_material();
        let material_b = create_test_material();
        prepare_wgpu_quad_batch_write(
            &mut state,
            &tex,
            None,
            None,
            Some(&material_a),
            &standard(),
            1,
            None,
        );
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        prepare_wgpu_quad_batch_write(
            &mut state,
            &tex,
            None,
            None,
            Some(&material_b),
            &standard(),
            1,
            None,
        );

        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(Arc::ptr_eq(
            runtime.quad_batch_writer_material.as_ref().unwrap(),
            &material_b
        ));
        assert_eq!(runtime.quad_batch_writer_count, 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn keeps_accumulating_while_texture_and_material_match() {
        let mut state = create_test_state_in_pass();
        let tex = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        let base =
            prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        assert_eq!(base, 1);
        submit_wgpu_frame(&mut state);
    }
}

mod record_wgpu_quad_batch_color_scale_bias {
    use super::*;

    #[test]
    fn skips_the_tint_and_records_no_fold_state_when_color_adjustment_is_not_enabled() {
        let mut state = create_wgpu_render_state_for_test(None);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.5)), 0);
        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .quad_batch_writer_color_scale_bias_mode
                .unwrap_or(CT_MODE_NONE),
            CT_MODE_NONE
        );
    }

    #[test]
    fn is_a_no_op_for_an_untinted_instance_whether_or_not_the_fold_is_enabled() {
        let mut state = create_wgpu_render_state_for_test(None);
        record_wgpu_quad_batch_color_scale_bias(&mut state, None, 0);
        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .quad_batch_writer_color_scale_bias_mode
                .unwrap_or(CT_MODE_NONE),
            CT_MODE_NONE
        );
    }

    #[test]
    fn delegates_to_the_installed_fold_when_color_adjustment_is_enabled() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.5)), 0);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_UNIFORM)
        );
    }

    #[test]
    fn an_untinted_batch_on_flush_uses_the_lean_material_module() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        open_test_screen_pass(&mut state);
        let tex = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        record_wgpu_quad_batch_color_scale_bias(&mut state, None, 0);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        flush_wgpu_quad_batch_writer(&mut state);
        let context = get_wgpu_render_state_runtime(&state).context.clone();
        assert!(context.read().unwrap().color_scale_bias_module.is_none());
        assert!(context.read().unwrap().packed_tint_module.is_none());
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn reports_a_tint_to_the_installed_guard_when_no_fold_is_registered() {
        let mut state = create_wgpu_render_state_for_test(None);
        enable_wgpu_color_adjustment_guards(&mut state, None);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.5)), 0);
        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .quad_batch_writer_color_scale_bias_mode
                .unwrap_or(CT_MODE_NONE),
            CT_MODE_NONE
        );
    }
}

mod reset_wgpu_quad_batch_writer_buffer_pool {
    use super::*;

    #[test]
    fn rewinds_the_pool_cursor_so_slots_are_reclaimed_next_frame() {
        let mut state = create_test_state_in_pass();
        let tex = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(&mut state, &tex, None, None, None, &standard(), 1, None);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        flush_wgpu_quad_batch_writer(&mut state);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_buffer_cursor,
            1
        );

        reset_wgpu_quad_batch_writer_buffer_pool(&mut state);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_buffer_cursor,
            0
        );
        submit_wgpu_frame(&mut state);
    }
}

mod write_wgpu_quad_batch_affine_instance {
    use super::*;

    #[test]
    fn packs_pre_scaled_geometry_and_two_affine_uv_axes_into_thirteen_floats() {
        let mut data = [0.0_f32; 13];
        write_wgpu_quad_batch_affine_instance(
            &mut data,
            0,
            &create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0),
            10.0,
            20.0,
            0.1,
            0.2,
            0.3,
            0.4,
            0.5,
            0.6,
            0.9,
        );
        assert_eq!(&data[0..6], &[20.0, 30.0, 80.0, 100.0, 6.0, 7.0]);
        for (index, expected) in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.9].iter().enumerate() {
            assert!((data[index + 6] - expected).abs() < 1e-6);
        }
    }
}

mod write_wgpu_quad_batch_instance {
    use super::*;

    #[test]
    fn maps_an_axis_aligned_uv_rectangle_onto_the_affine_record() {
        let mut data = [0.0_f32; 13];
        write_wgpu_quad_batch_instance(
            &mut data,
            0,
            &create_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0),
            4.0,
            5.0,
            0.1,
            0.2,
            0.7,
            0.8,
            0.9,
        );
        for (index, expected) in [0.1, 0.2, 0.6, 0.0, 0.0, 0.6, 0.9].iter().enumerate() {
            assert!((data[index + 6] - expected).abs() < 1e-6);
        }
    }
}
