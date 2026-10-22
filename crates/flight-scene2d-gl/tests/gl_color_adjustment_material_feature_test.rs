use std::num::NonZeroU32;
use std::sync::Arc;

use flight_render::are_color_adjustments_enabled;
use flight_render_gl::{
    GlColorAdjustmentData, GlRenderState, get_gl_color_adjustment_material_feature,
};
use flight_scene2d_gl::contract::*;
use glow::NativeTexture;

use crate::gl_test_helper::{calls_with, count_calls, create_gl_state};

const CT_MODE_NONE: u32 = 0;
const CT_MODE_UNIFORM: u32 = 1;
const CT_MODE_PACKED_TINT: u32 = 2;
const CT_MODE_PER_INSTANCE: u32 = 3;
const CT_MODE_MATRIX: u32 = 4;
const MIX_RED_GREEN: [f32; 20] = [
    1.0, 0.5, 0.0, 0.0, 0.25, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    0.0,
];

fn make_texture() -> NativeTexture {
    return NativeTexture(NonZeroU32::new(77).unwrap());
}

fn ct(
    red_scale: f32,
    green_scale: f32,
    blue_scale: f32,
    alpha_scale: f32,
    red_bias: f32,
    green_bias: f32,
    blue_bias: f32,
    alpha_bias: f32,
) -> GlColorAdjustmentData {
    return GlColorAdjustmentData::ColorScaleBias([
        red_scale,
        green_scale,
        blue_scale,
        alpha_scale,
        red_bias,
        green_bias,
        blue_bias,
        alpha_bias,
    ]);
}

fn scale(value: f32) -> GlColorAdjustmentData {
    return ct(value, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
}

fn record(state: &mut GlRenderState, value: Option<GlColorAdjustmentData>, index: usize) {
    record_gl_quad_batch_color_scale_bias(state, value.as_ref(), index);
}

fn tint_bytes(state: &GlRenderState, offset: usize, length: usize) -> Vec<u8> {
    let runtime = state.gl_runtime.borrow();
    let words = runtime.quad_batch_writer_color_tint_data.as_ref().unwrap();
    let bytes = words
        .iter()
        .flat_map(|word| word.to_ne_bytes())
        .collect::<Vec<_>>();
    return bytes[offset..offset + length].to_vec();
}

fn prepare(state: &mut GlRenderState, max_instances: usize) {
    prepare_gl_quad_batch_write(
        state,
        make_texture(),
        false,
        None,
        None,
        None,
        &STANDARD_GL_QUAD_MATERIAL_RENDERER,
        max_instances,
        None,
    );
}

fn mode(state: &GlRenderState) -> Option<u32> {
    return state
        .gl_runtime
        .borrow()
        .quad_batch_writer_color_scale_bias_mode;
}

fn has_attrib_pointer(values: [i64; 6]) -> bool {
    return calls_with("vertex_attrib_pointer")
        .iter()
        .any(|call| call.integers == values.to_vec());
}

mod register_gl_color_adjustment_material_feature {
    use super::*;

    #[test]
    fn installs_the_fold_so_recorded_tints_drive_the_color_adjustment_state_machine() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        assert!(are_color_adjustments_enabled(&state));
        assert!(state.gl_registries.color_adjustment_feature.is_some());
        assert!(get_gl_color_adjustment_material_feature(&state).is_some());
    }

    #[test]
    fn is_idempotent() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let table = state
            .gl_registries
            .color_adjustment_feature
            .clone()
            .unwrap();
        register_gl_color_adjustment_material_feature(&mut state);
        assert!(Arc::ptr_eq(
            state
                .gl_registries
                .color_adjustment_feature
                .as_ref()
                .unwrap(),
            &table
        ));
    }

    #[test]
    fn stays_untinted_mode_none_when_no_instance_carries_a_color_adjustment() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(&mut state, None, 0);
        record(&mut state, None, 1);
        assert_eq!(mode(&state), Some(CT_MODE_NONE));
        let runtime = state.gl_runtime.borrow();
        assert!(runtime.quad_batch_writer_color_tint_data.is_none());
        assert!(runtime.quad_batch_writer_color_scale_bias_data.is_none());
    }

    #[test]
    fn uses_one_whole_batch_uniform_when_every_instance_shares_one_tint() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let tint = scale(0.5);
        record(&mut state, Some(tint), 0);
        record(&mut state, Some(tint), 1);
        record(&mut state, Some(tint), 2);
        assert_eq!(mode(&state), Some(CT_MODE_UNIFORM));
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_uniform_color_scale_bias,
            Some(tint)
        );
    }

    #[test]
    fn keeps_the_uniform_path_for_a_distinct_but_equal_tint() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(&mut state, Some(scale(0.5)), 0);
        record(&mut state, Some(scale(0.5)), 1);
        assert_eq!(mode(&state), Some(CT_MODE_UNIFORM));
    }

    #[test]
    fn promotes_varying_multiply_only_tints_to_packed_rgba8_without_splitting() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(&mut state, Some(scale(0.5)), 0);
        record(&mut state, Some(scale(0.25)), 1);
        assert_eq!(mode(&state), Some(CT_MODE_PACKED_TINT));
        assert_eq!(
            tint_bytes(&state, 0, 8),
            vec![128, 255, 255, 255, 64, 255, 255, 255]
        );
        assert!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_color_scale_bias_data
                .is_none()
        );
    }

    #[test]
    fn promotes_with_identity_fill_when_a_tinted_instance_follows_an_untinted_one() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(&mut state, None, 0);
        record(&mut state, Some(scale(0.5)), 1);
        assert_eq!(mode(&state), Some(CT_MODE_PACKED_TINT));
        assert_eq!(
            tint_bytes(&state, 0, 8),
            vec![255, 255, 255, 255, 128, 255, 255, 255]
        );
    }

    #[test]
    fn writes_identity_for_an_untinted_instance_once_the_batch_is_per_instance() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(&mut state, Some(scale(0.5)), 0);
        record(&mut state, Some(scale(0.25)), 1);
        record(&mut state, None, 2);
        assert_eq!(tint_bytes(&state, 8, 4), vec![255, 255, 255, 255]);
    }

    #[test]
    fn stores_normalized_linear_color_biases_without_conversion() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(
            &mut state,
            Some(ct(1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0)),
            0,
        );
        record(&mut state, Some(scale(0.5)), 1);
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_color_scale_bias_data
                .as_ref()
                .unwrap()[4],
            1.0
        );
        assert_eq!(mode(&state), Some(CT_MODE_PER_INSTANCE));
    }

    #[test]
    fn widens_to_a_full_matrix_stream_only_when_channel_mixing_appears() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(
            &mut state,
            Some(GlColorAdjustmentData::TintMaterialData(0x808080ff)),
            0,
        );
        record(
            &mut state,
            Some(GlColorAdjustmentData::ColorMatrix(MIX_RED_GREEN)),
            1,
        );
        assert_eq!(mode(&state), Some(CT_MODE_MATRIX));
        let runtime = state.gl_runtime.borrow();
        let data = runtime
            .quad_batch_writer_color_matrix_data
            .as_ref()
            .unwrap();
        // D1 f32 bound (TS: toBeCloseTo 2 digits)
        assert!((data[0] - 128.0 / 255.0).abs() <= 0.005);
        assert_eq!(data[20], 1.0);
        assert_eq!(data[21], 0.5);
        assert_eq!(data[36], 0.25);
    }

    #[test]
    fn records_compact_per_item_tint_data_directly_as_four_bytes() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record(&mut state, None, 0);
        record(
            &mut state,
            Some(GlColorAdjustmentData::TintMaterialData(0x12345678)),
            1,
        );
        assert_eq!(mode(&state), Some(CT_MODE_PACKED_TINT));
        assert_eq!(tint_bytes(&state, 4, 4), vec![0x12, 0x34, 0x56, 0x78]);
    }

    #[test]
    fn drives_the_uniform_color_adjustment_shader_on_flush() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        prepare(&mut state, 1);
        record(&mut state, Some(scale(0.5)), 0);
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;
        flush_gl_quad_batch_writer(&mut state);
        assert!(count_calls("uniform_4_f32") > 0);
        assert_eq!(count_calls("draw_elements_instanced"), 1);
    }

    #[test]
    fn uploads_a_four_byte_per_instance_tint_buffer_on_flush_when_tints_vary() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        prepare(&mut state, 2);
        record(&mut state, Some(scale(0.5)), 0);
        record(&mut state, Some(scale(0.25)), 1);
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 2;
        flush_gl_quad_batch_writer(&mut state);
        assert!(
            state
                .context_state
                .runtime_state
                .borrow()
                .quad_batch_resources
                .as_ref()
                .unwrap()
                .writer_color_scale_bias_buffer
                .is_some()
        );
        assert!(has_attrib_pointer([
            7,
            4,
            i64::from(glow::UNSIGNED_BYTE),
            1,
            4,
            0
        ]));
        assert_eq!(calls_with("draw_elements_instanced")[0].integers[4], 2);
    }

    #[test]
    fn binds_five_vec4_instance_attributes_for_a_full_color_matrix() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        prepare(&mut state, 2);
        record(&mut state, None, 0);
        record(
            &mut state,
            Some(GlColorAdjustmentData::ColorMatrix(MIX_RED_GREEN)),
            1,
        );
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 2;
        flush_gl_quad_batch_writer(&mut state);
        assert!(has_attrib_pointer([7, 4, i64::from(glow::FLOAT), 0, 80, 0]));
        assert!(has_attrib_pointer([
            11,
            4,
            i64::from(glow::FLOAT),
            0,
            80,
            64
        ]));
    }

    #[test]
    fn resets_the_batch_mode_after_flushing_one_uniform_matrix() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        prepare(&mut state, 1);
        record(
            &mut state,
            Some(GlColorAdjustmentData::ColorMatrix(MIX_RED_GREEN)),
            0,
        );
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;
        flush_gl_quad_batch_writer(&mut state);
        assert_eq!(mode(&state), Some(CT_MODE_NONE));
    }

    #[test]
    fn leaves_the_lean_base_shader_untouched_for_an_untinted_batch_on_flush() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        prepare(&mut state, 1);
        record(&mut state, None, 0);
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;
        flush_gl_quad_batch_writer(&mut state);
        assert!(
            state
                .context_state
                .runtime_state
                .borrow()
                .quad_batch_resources
                .as_ref()
                .unwrap()
                .writer_color_scale_bias_buffer
                .is_none()
        );
        assert_eq!(count_calls("draw_elements_instanced"), 1);
    }
}
