use std::sync::{Arc, Mutex};

use flight_geometry::create_matrix;
use flight_render_wgpu::*;

use crate::support::*;

fn normal_color() -> wgpu::BlendComponent {
    return wgpu::BlendComponent {
        src_factor: wgpu::BlendFactor::One,
        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
        operation: wgpu::BlendOperation::Add,
    };
}

fn blend_mode(mode: &str) -> String {
    return mode.to_string();
}

fn cached_pipeline_keys(state: &WgpuRenderState) -> Vec<String> {
    let context = get_wgpu_render_state_runtime(state).context.clone();
    let mut keys: Vec<String> = context
        .read()
        .unwrap()
        .pipeline_cache
        .keys()
        .cloned()
        .collect();
    keys.sort();
    return keys;
}

// A state whose device records every command from creation on, so the warmed pipelines are
// captured too (the source stashes each pipeline's descriptor on the mock).
fn create_recorded_state() -> (WgpuRenderState, Arc<Mutex<Vec<WgpuCommandRecord>>>) {
    let native = create_test_native_device();
    let records = record_test_commands(&native);
    let state = create_wgpu_render_state(&create_test_wgpu_device(native), None);
    return (state, records);
}

// The color blend the pipeline for `mode` was actually created with.
fn baked_color(
    state: &mut WgpuRenderState,
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
    mode: &str,
) -> wgpu::BlendComponent {
    let pipeline = get_wgpu_pipeline(state, Some(&blend_mode(mode)), WgpuStencilMode::Normal);
    return records
        .lock()
        .unwrap()
        .iter()
        .find_map(|record| match record {
            WgpuCommandRecord::CreateRenderPipeline(created) if created.pipeline == pipeline => {
                created.targets[0]
                    .as_ref()
                    .and_then(|target| target.blend)
                    .map(|blend| blend.color)
            }
            _ => None,
        })
        .expect("the pipeline's recorded creation");
}

mod create_wgpu_bind_group_layouts {
    use super::*;

    #[test]
    fn returns_uniform_bind_group_layout_and_texture_bind_group_layout() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let layouts = create_wgpu_bind_group_layouts(&native);
        assert_ne!(
            layouts.uniform_bind_group_layout,
            layouts.texture_bind_group_layout
        );
        // Both layouts are real and compose into the two-group 2D pipeline layout.
        let _layout = create_wgpu_pipeline_layout(
            &native,
            &layouts.uniform_bind_group_layout,
            &layouts.texture_bind_group_layout,
        );
    }
}

mod create_wgpu_pipeline_layout {
    use super::*;

    #[test]
    fn returns_a_pipeline_layout() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let resources = get_wgpu_render_state_device_resources(&state);
        let first = create_wgpu_pipeline_layout(
            &native,
            &resources.uniform_bind_group_layout,
            &resources.texture_bind_group_layout,
        );
        let second = create_wgpu_pipeline_layout(
            &native,
            &resources.uniform_bind_group_layout,
            &resources.texture_bind_group_layout,
        );
        assert_ne!(first, second);
    }
}

mod get_active_wgpu_pipeline {
    use super::*;

    #[test]
    fn returns_the_normal_pipeline_when_no_mask_is_active() {
        let mut state = create_wgpu_render_state_for_test(None);
        let runtime = get_wgpu_render_state_runtime_mut(&mut state);
        runtime.current_mask_depth = 0;
        runtime.mask_write_mode = false;
        let pipeline = get_active_wgpu_pipeline(&mut state);
        assert_eq!(
            pipeline,
            get_wgpu_pipeline(&mut state, None, WgpuStencilMode::Normal)
        );
    }
}

mod get_wgpu_blend_state {
    use super::*;

    #[test]
    fn resolves_all_six_fixed_states_and_falls_back_to_normal_for_null_or_unknown_modes() {
        let color = |mode: Option<&str>| {
            let mode = mode.map(blend_mode);
            return get_wgpu_blend_state(mode.as_ref()).color;
        };
        assert_eq!(color(None), normal_color());
        assert_eq!(color(Some("Overlay")), normal_color());
        assert_eq!(color(Some("Normal")), normal_color());
        assert_eq!(
            color(Some("Add")),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(
            color(Some("Multiply")),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Dst,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(
            color(Some("Screen")),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrc,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(color(Some("Darken")).operation, wgpu::BlendOperation::Min);
        assert_eq!(color(Some("Lighten")).operation, wgpu::BlendOperation::Max);
    }
}

mod get_wgpu_pipeline {
    use super::*;

    #[test]
    fn returns_a_cached_pipeline_on_second_call() {
        let mut state = create_wgpu_render_state_for_test(None);
        let p1 = get_wgpu_pipeline(&mut state, None, WgpuStencilMode::Normal);
        let p2 = get_wgpu_pipeline(&mut state, None, WgpuStencilMode::Normal);
        assert_eq!(p1, p2);
    }

    #[test]
    fn returns_different_pipelines_for_different_stencil_modes() {
        let mut state = create_wgpu_render_state_for_test(None);
        let normal = get_wgpu_pipeline(&mut state, None, WgpuStencilMode::Normal);
        let mask_write = get_wgpu_pipeline(&mut state, None, WgpuStencilMode::MaskWrite);
        assert_ne!(normal, mask_write);
    }

    // The TS spy reads the mock pipeline descriptor's blend; a real wgpu pipeline exposes no
    // descriptor; each mode's pipeline is built (naga-validated) and cached under its own key, and the
    // blend each one bakes is read off its recorded creation.
    #[test]
    fn realizes_each_fixed_function_blend_mode_with_gl_parity_factors() {
        let mut state = create_wgpu_render_state_for_test(None);
        let modes = ["Normal", "Add", "Multiply", "Screen", "Darken", "Lighten"];
        let mut pipelines = Vec::new();
        for mode in modes {
            let mode = blend_mode(mode);
            pipelines.push(get_wgpu_pipeline(
                &mut state,
                Some(&mode),
                WgpuStencilMode::Normal,
            ));
        }
        for (i, a) in pipelines.iter().enumerate() {
            for b in pipelines.iter().skip(i + 1) {
                assert_ne!(a, b);
            }
        }
        let format = format!("{:?}", state.format);
        let mut expected: Vec<String> = modes
            .iter()
            .map(|mode| format!("{mode}-normal-{format}"))
            .collect();
        expected.sort();
        assert_eq!(cached_pipeline_keys(&state), expected);

        let (mut recorded, records) = create_recorded_state();
        let mut blend_of = |mode: &str| baked_color(&mut recorded, &records, mode);
        assert_eq!(blend_of("Normal"), normal_color());
        assert_eq!(
            blend_of("Add"),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(
            blend_of("Multiply"),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Dst,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(
            blend_of("Screen"),
            wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrc,
                operation: wgpu::BlendOperation::Add,
            }
        );
        assert_eq!(blend_of("Darken").operation, wgpu::BlendOperation::Min);
        assert_eq!(blend_of("Lighten").operation, wgpu::BlendOperation::Max);
    }

    // Shader-composited modes build real pipelines whose recorded baked blend is Normal's.
    #[test]
    fn falls_back_to_normal_blend_for_shader_composited_modes() {
        let mut state = create_wgpu_render_state_for_test(None);
        for mode in ["Overlay", "HardLight"] {
            let mode = blend_mode(mode);
            let pipeline = get_wgpu_pipeline(&mut state, Some(&mode), WgpuStencilMode::Normal);
            assert_eq!(
                pipeline,
                get_wgpu_pipeline(&mut state, Some(&mode), WgpuStencilMode::Normal)
            );
            assert_eq!(get_wgpu_blend_state(Some(&mode)).color, normal_color());
            assert_eq!(get_wgpu_blend_state(Some(&mode)).alpha, normal_color());
        }
        let (mut recorded, records) = create_recorded_state();
        for mode in ["Overlay", "HardLight"] {
            assert_eq!(baked_color(&mut recorded, &records, mode), normal_color());
        }
    }
}

mod initialize_wgpu_bind_group_layouts {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_bind_group_layouts() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let mut layouts = create_wgpu_bind_group_layouts(&native);
        let uniform = layouts.uniform_bind_group_layout.clone();
        let texture = layouts.texture_bind_group_layout.clone();
        initialize_wgpu_bind_group_layouts(&mut layouts, &native);
        assert_ne!(layouts.uniform_bind_group_layout, uniform);
        assert_ne!(layouts.texture_bind_group_layout, texture);
        let _layout = create_wgpu_pipeline_layout(
            &native,
            &layouts.uniform_bind_group_layout,
            &layouts.texture_bind_group_layout,
        );
    }
}

mod set_wgpu_matrix_from_transform {
    use super::*;

    #[test]
    fn builds_a_column_major_clip_space_matrix_from_an_identity_transform() {
        let mut m = [0.0f32; 9];
        set_wgpu_matrix_from_transform(
            &mut m,
            &create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
            &WgpuRenderPassViewport {
                height: 2.0,
                width: 2.0,
            },
        );
        // Identity scale on a 2x2 viewport: a*iw=1, -d*ih=-1, tx*iw-1=-1, -ty*ih+1=1
        assert!((m[0] - 1.0).abs() < 1e-5);
        assert!((m[4] + 1.0).abs() < 1e-5);
        assert!((m[6] + 1.0).abs() < 1e-5);
        assert!((m[7] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn builds_a_distinct_out_from_aliased_inputs_out_input_matrix() {
        let mut m = [0.0f32; 9];
        set_wgpu_matrix_from_transform(
            &mut m,
            &create_matrix(2.0, 0.0, 0.0, 2.0, 100.0, 50.0),
            &WgpuRenderPassViewport {
                height: 300.0,
                width: 400.0,
            },
        );
        assert!((m[0] - 2.0 * (2.0 / 400.0)).abs() < 1e-5);
    }
}

mod uniform_byte_size {
    use super::*;

    #[test]
    fn is_128_bytes() {
        assert_eq!(UNIFORM_BYTE_SIZE, 128);
    }
}

mod write_wgpu_matrix_only_uniforms {
    use super::*;

    #[test]
    fn advances_uniform_offset() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let before = get_wgpu_render_state_runtime(pass.state).uniform_offset;
        let t = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        write_wgpu_matrix_only_uniforms(
            pass.state, 1.0, &t, 0.0, 0.0, 10.0, 10.0, 0.0, 0.0, 1.0, 1.0,
        );
        let runtime = get_wgpu_render_state_runtime(pass.state);
        assert_eq!(runtime.uniform_offset, before + runtime.uniform_stride);
        end_wgpu_render_pass(pass);
    }
}

mod write_wgpu_quad_uniforms {
    use super::*;

    #[test]
    fn advances_uniform_offset_by_uniform_stride() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let before = get_wgpu_render_state_runtime(pass.state).uniform_offset;
        let t = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        write_wgpu_quad_uniforms(
            pass.state, 1.0, &t, None, 0.0, 0.0, 100.0, 100.0, 0.0, 0.0, 1.0, 1.0, false,
        );
        let runtime = get_wgpu_render_state_runtime(pass.state);
        assert_eq!(runtime.uniform_offset, before + runtime.uniform_stride);
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn writes_quad_coordinates_into_uniform_data_at_float_offset_24() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let t = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let offset = write_wgpu_quad_uniforms(
            pass.state, 0.5, &t, None, 10.0, 20.0, 30.0, 40.0, 0.1, 0.2, 0.9, 0.8, false,
        );
        let float_base = (offset >> 2) as usize;
        let data = &get_wgpu_render_state_runtime(pass.state).uniform_data;
        assert!((data[float_base + 24] - 10.0).abs() < 1e-5);
        assert!((data[float_base + 25] - 20.0).abs() < 1e-5);
        assert!((data[float_base + 26] - 30.0).abs() < 1e-5);
        assert!((data[float_base + 27] - 40.0).abs() < 1e-5);
        assert!((data[float_base + 28] - 0.1).abs() < 1e-5);
        assert!((data[float_base + 12] - 0.5).abs() < 1e-5); // alpha
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn writes_the_native_straight_alpha_texture_flag_at_u32_offset_14() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let t = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

        let straight_offset = write_wgpu_quad_uniforms(
            pass.state, 1.0, &t, None, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, true,
        );
        let premultiplied_offset = write_wgpu_quad_uniforms(
            pass.state, 1.0, &t, None, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, false,
        );

        // The source's Uint32Array view over the float ring is the f32 slot's bit pattern.
        let data = &get_wgpu_render_state_runtime(pass.state).uniform_data;
        assert_eq!(data[(straight_offset >> 2) as usize + 14].to_bits(), 1);
        assert_eq!(data[(premultiplied_offset >> 2) as usize + 14].to_bits(), 0);
        end_wgpu_render_pass(pass);
    }
}
