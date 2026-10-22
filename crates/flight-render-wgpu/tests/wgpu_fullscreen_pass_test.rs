use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_entity::get_entity_id;
use flight_render_wgpu::*;

use crate::support::*;

const SIMPLE_FRAGMENT_WGSL: &str = r#"
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@fragment
fn fs_main(@builtin(position) pos : vec4f) -> @location(0) vec4f {
  return textureSample(tex, smp, pos.xy);
}
"#;

// The source's fullscreen descriptor (wgpuFullscreenPass.ts): an explicit layout declaring
// @group(0) for uniforms, and no depthStencil state. `with_depth_stencil` adds the backend's inert
// depth24plus-stencil8 state, so each defect can be reproduced on its own.
fn source_shaped_pipeline(
    state: &WgpuRenderState,
    with_depth_stencil: bool,
) -> wgpu::RenderPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let device = &native.device;
    let uniform_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    });
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(&uniform_layout)],
        immediate_size: 0,
    });
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(
            format!("{SOURCE_SHAPED_VERTEX_WGSL}{SOURCE_SHAPED_FRAGMENT_WGSL}").into(),
        ),
    });
    return device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: None,
        layout: Some(&layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: Some("vs_main"),
            compilation_options: test_default(),
            buffers: &[],
        },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: Some("fs_main"),
            compilation_options: test_default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: state.format,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        depth_stencil: with_depth_stencil.then(|| wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth24PlusStencil8,
            depth_write_enabled: Some(false),
            depth_compare: Some(wgpu::CompareFunction::Always),
            stencil: test_default(),
            bias: test_default(),
        }),
        primitive: test_default(),
        multisample: test_default(),
        multiview_mask: None,
        cache: None,
    });
}

// Draws `pipeline` with nothing bound, exactly as the source's no-uniform path does, inside a
// backend screen pass, and returns the first validation error.
fn draw_unbound(state: &mut WgpuRenderState, pipeline: &wgpu::RenderPipeline) -> Option<String> {
    let native = get_wgpu_render_state_native_device(state);
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    let pass = begin_wgpu_screen_render_pass_for_test(state, None, None, false);
    {
        let encoder = get_wgpu_render_state_runtime_mut(pass.state)
            .render_pass
            .as_mut()
            .unwrap();
        encoder.set_pipeline(pipeline);
        encoder.draw(0..3, 0..1);
    }
    end_wgpu_render_pass(pass);
    return block_on(scope.pop()).map(|error| error.to_string());
}

const SOURCE_SHAPED_FRAGMENT_WGSL: &str = r#"
@fragment
fn fs_main() -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 0.0, 1.0);
}
"#;

const SOURCE_SHAPED_VERTEX_WGSL: &str = r#"
@vertex
fn vs_main(@builtin(vertex_index) index : u32) -> @builtin(position) vec4f {
    let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}
"#;

mod create_wgpu_fullscreen_pipeline {
    use super::*;

    #[test]
    fn returns_a_pipeline_with_a_layout_and_bind_group_layouts() {
        let state = create_wgpu_render_state_for_test(None);
        let result = create_wgpu_fullscreen_pipeline(&state, SIMPLE_FRAGMENT_WGSL, Some(1), None);
        assert_ne!(
            result.uniform_bind_group_layout,
            result.texture_bind_group_layouts[0]
        );
        assert_eq!(result.texture_bind_group_layouts.len(), 1);
    }

    #[test]
    fn builds_multiple_texture_bind_group_layouts_when_texture_input_count_1() {
        let state = create_wgpu_render_state_for_test(None);
        let result = create_wgpu_fullscreen_pipeline(&state, SIMPLE_FRAGMENT_WGSL, Some(3), None);
        assert_eq!(result.texture_bind_group_layouts.len(), 3);
    }
}

mod destroy_wgpu_fullscreen_pipeline {
    use super::*;

    #[test]
    fn does_not_throw() {
        let state = create_wgpu_render_state_for_test(None);
        let pipeline = create_wgpu_fullscreen_pipeline(&state, SIMPLE_FRAGMENT_WGSL, Some(1), None);
        let result = catch_unwind(AssertUnwindSafe(|| {
            destroy_wgpu_fullscreen_pipeline(&state, &pipeline);
        }));
        assert!(result.is_ok());
    }
}

mod draw_wgpu_fullscreen_pass {
    use super::*;

    // Repro for the fullscreen fix (Principal cafc5d6b). The source's descriptor is invalid under
    // WebGPU itself, not just natively: a pipeline's attachment state must match the pass's, and
    // every bind group the layout declares must be set before a draw.
    #[test]
    fn the_source_descriptor_fails_validation_on_both_counts_and_the_fixed_form_draws() {
        let mut state = create_wgpu_render_state_for_test(None);
        let no_depth = source_shaped_pipeline(&state, false);
        let error = draw_unbound(&mut state, &no_depth).expect("the depth mismatch is rejected");
        assert!(
            error.contains("Incompatible depth-stencil attachment format"),
            "{error}"
        );
        let unbound = source_shaped_pipeline(&state, true);
        let error = draw_unbound(&mut state, &unbound).expect("the unbound group 0 is rejected");
        assert!(
            error.contains("expects a BindGroup to be set at index 0"),
            "{error}"
        );

        // The fixed form: inert depth-stencil state and the placeholder group at @group(0).
        let fixed =
            create_wgpu_fullscreen_pipeline(&state, SOURCE_SHAPED_FRAGMENT_WGSL, Some(0), None);
        let native = get_wgpu_render_state_native_device(&state);
        let scope = native
            .device
            .push_error_scope(wgpu::ErrorFilter::Validation);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        draw_wgpu_fullscreen_pass(pass.state, &fixed, &[], None);
        end_wgpu_render_pass(pass);
        assert_eq!(block_on(scope.pop()).map(|error| error.to_string()), None);
    }

    #[test]
    fn does_not_throw_when_render_pass_is_open_and_no_uniforms() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pipeline = create_wgpu_fullscreen_pipeline(&state, SIMPLE_FRAGMENT_WGSL, Some(1), None);
        let target = create_wgpu_texture_render_target(&state, 64.0, 64.0, None, None, None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let result = catch_unwind(AssertUnwindSafe(|| {
            draw_wgpu_fullscreen_pass(pass.state, &pipeline, &[&target], None);
        }));
        assert!(result.is_ok());
        end_wgpu_render_pass(pass);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn is_a_no_op_when_render_pass_is_not_open() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pipeline = create_wgpu_fullscreen_pipeline(&state, SIMPLE_FRAGMENT_WGSL, Some(1), None);
        let target = create_wgpu_texture_render_target(&state, 64.0, 64.0, None, None, None);
        let result = catch_unwind(AssertUnwindSafe(|| {
            draw_wgpu_fullscreen_pass(&mut state, &pipeline, &[&target], None);
        }));
        assert!(result.is_ok());
        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(runtime.render_pass.is_none());
        assert!(runtime.command_encoder.is_none());
    }
}

mod initialize_wgpu_fullscreen_pipeline {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_fullscreen_pipeline() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pipeline =
            create_wgpu_fullscreen_pipeline(&state, SIMPLE_FRAGMENT_WGSL, Some(1), None);
        let id = get_entity_id(&pipeline);
        let previous = pipeline.pipeline.clone();
        initialize_wgpu_fullscreen_pipeline(
            &mut pipeline,
            &state,
            SIMPLE_FRAGMENT_WGSL,
            Some(2),
            None,
        );
        assert_eq!(pipeline.texture_bind_group_layouts.len(), 2);
        assert_ne!(pipeline.pipeline, previous);
        assert_eq!(get_entity_id(&pipeline), id);
    }
}
