use flight_render::are_color_adjustments_enabled;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

const CT_MODE_NONE: u32 = 0;
const CT_MODE_UNIFORM: u32 = 1;
const CT_MODE_PACKED_TINT: u32 = 2;
const CT_MODE_PER_INSTANCE: u32 = 3;
const CT_MODE_MATRIX: u32 = 4;
const MIX_RED_GREEN: [f32; 20] = [
    1.0, 0.5, 0.0, 0.0, 0.25, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    0.0,
];

fn tint_bytes(runtime: &WgpuRenderStateRuntime, from: usize, to: usize) -> Vec<u8> {
    let data = runtime.quad_batch_writer_color_tint_data.as_ref().unwrap();
    let bytes: Vec<u8> = data.iter().flat_map(|word| word.to_ne_bytes()).collect();
    return bytes[from..to].to_vec();
}

fn tint(value: u32) -> WgpuColorScaleBiasInput {
    return WgpuColorScaleBiasInput::TintMaterialData(create_test_tint(value));
}

mod register_wgpu_color_adjustment_material_feature {
    use super::*;

    #[test]
    fn installs_the_fold_so_recorded_tints_drive_the_color_adjustment_state_machine() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        assert!(are_color_adjustments_enabled(&state));
        let slot = get_wgpu_color_adjustment_material_feature(&state).unwrap();
        let feature = slot
            .downcast_ref::<&'static WgpuColorAdjustmentMaterialFeature>()
            .unwrap();
        assert!(feature.draw_shape_meshes.is_some());
        assert!(
            feature
                .fragment_shader_chunk
                .contains("applyFlightColorAdjustment")
        );
        assert!(
            feature
                .matrix_fragment_shader_chunk
                .contains("applyFlightColorMatrix")
        );
    }

    #[test]
    fn is_idempotent() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        let first = get_wgpu_color_adjustment_material_feature(&state).unwrap();
        register_wgpu_color_adjustment_material_feature(&mut state);
        let second = get_wgpu_color_adjustment_material_feature(&state).unwrap();
        assert!(std::sync::Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn stays_untinted_when_no_instance_carries_a_color_adjustment() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, None, 0);
        record_wgpu_quad_batch_color_scale_bias(&mut state, None, 1);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_NONE)
        );
        assert!(runtime.quad_batch_writer_color_tint_data.is_none());
        assert!(runtime.quad_batch_writer_color_scale_bias_data.is_none());
    }

    #[test]
    fn uses_one_whole_batch_uniform_when_every_instance_shares_one_tint() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        let shared = create_test_red_scale(0.5);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&shared), 0);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&shared), 1);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_UNIFORM)
        );
        let Some(WgpuColorScaleBiasInput::ColorScaleBias(uniform)) =
            &runtime.quad_batch_writer_uniform_color_scale_bias
        else {
            panic!("a uniform color scale/bias");
        };
        assert_eq!(uniform.red_scale, 0.5);
    }

    #[test]
    fn promotes_varying_multiply_only_tints_to_packed_rgba8_without_splitting() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.5)), 0);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.25)), 1);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_PACKED_TINT)
        );
        assert_eq!(
            tint_bytes(runtime, 0, 8),
            vec![128, 255, 255, 255, 64, 255, 255, 255]
        );
        assert!(runtime.quad_batch_writer_color_scale_bias_data.is_none());
    }

    #[test]
    fn promotes_with_identity_fill_when_a_tinted_instance_follows_an_untinted_one() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, None, 0);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.5)), 1);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_PACKED_TINT)
        );
        assert_eq!(
            tint_bytes(runtime, 0, 8),
            vec![255, 255, 255, 255, 128, 255, 255, 255]
        );
    }

    #[test]
    fn replicates_a_uniform_tint_as_four_bytes_per_instance_on_flush() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        open_test_screen_pass(&mut state);
        let tex = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(
            &mut state,
            &tex,
            None,
            None,
            None,
            &STANDARD_WGPU_QUAD_MATERIAL_RENDERER,
            2,
            None,
        );
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.5)), 0);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&create_test_red_scale(0.5)), 1);
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 2;
        flush_wgpu_quad_batch_writer(&mut state);
        assert_eq!(
            tint_bytes(get_wgpu_render_state_runtime(&state), 0, 8),
            vec![128, 255, 255, 255, 128, 255, 255, 255]
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn records_compact_per_item_tint_data_directly_as_one_storage_word() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, None, 0);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&tint(0x12345678)), 1);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_PACKED_TINT)
        );
        assert_eq!(tint_bytes(runtime, 4, 8), vec![0x12, 0x34, 0x56, 0x78]);
    }

    #[test]
    fn widens_to_the_affine_stream_only_when_an_offset_appears() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&tint(0x808080ff)), 0);
        let offset = WgpuColorScaleBiasInput::ColorScaleBias(create_test_color_scale_bias(
            1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0,
        ));
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&offset), 1);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_PER_INSTANCE)
        );
        let data = runtime
            .quad_batch_writer_color_scale_bias_data
            .as_ref()
            .unwrap();
        assert!((data[0] - 128.0 / 255.0).abs() < 1e-6);
        assert_eq!(data[12], 1.0);
    }

    #[test]
    fn widens_to_a_20_float_matrix_stream_only_when_channel_mixing_appears() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&tint(0x808080ff)), 0);
        let matrix = WgpuColorScaleBiasInput::Values(WgpuColorScaleBiasValues {
            values: MIX_RED_GREEN.to_vec(),
        });
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&matrix), 1);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_MATRIX)
        );
        let data = runtime
            .quad_batch_writer_color_matrix_data
            .as_ref()
            .unwrap();
        assert!((data[0] - 128.0 / 255.0).abs() < 1e-6);
        assert_eq!(data[20], 1.0);
        assert_eq!(data[21], 0.5);
        assert_eq!(data[36], 0.25);
    }
}
