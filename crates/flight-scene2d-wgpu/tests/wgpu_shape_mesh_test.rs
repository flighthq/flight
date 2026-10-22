use flight_materials::{BLEND_MODE_ADD, BLEND_MODE_NORMAL};
use flight_render::RenderProxy2D;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

fn triangle() -> WgpuShapeMesh {
    return WgpuShapeMesh {
        vertices: vec![0.0, 0.0, 10.0, 0.0, 0.0, 10.0],
        indices: vec![0, 1, 2],
        color: 0xff8040ff,
        alpha: 1.0,
    };
}

fn white_triangle() -> WgpuShapeMesh {
    let mut mesh = triangle();
    mesh.color = 0xffffffff;
    return mesh;
}

fn proxy(state: &mut WgpuRenderState, alpha: f32) -> RenderProxy2D<WgpuRenderState> {
    let mut proxy = create_test_proxy(state);
    proxy.alpha = alpha;
    proxy.blend_mode = None;
    return proxy;
}

fn uploads_to(
    records: &std::sync::Arc<std::sync::Mutex<Vec<WgpuCommandRecord>>>,
    buffer: &wgpu::Buffer,
) -> Vec<f32> {
    let write = recorded_buffer_writes(records)
        .into_iter()
        .rev()
        .find(|write| &write.buffer == buffer)
        .expect("a write to the buffer");
    return bytes_to_f32(&write.data);
}

mod draw_wgpu_shape_mesh_batch {
    use super::*;

    #[test]
    fn writes_only_the_shared_matrix_and_color_fields_preserving_a_feature_owned_uniform_tail() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let mut uniform_buffers = Vec::new();
        let mut bind_groups = Vec::new();
        let mut uniform_data = [0.0_f32; 24];
        uniform_data[16..24].copy_from_slice(&[0.25, 0.5, 0.75, 1.0, 0.1, 0.2, 0.3, 0.4]);
        // Draw once through the lean path to obtain a real pipeline entry and its layout.
        let probe = proxy(&mut state, 1.0);
        draw_wgpu_shape_meshes(&mut state, &probe, &[triangle()], &mut test_default());
        let entry = get_wgpu_render_state_runtime(&state)
            .shape_mesh_pipelines
            .as_ref()
            .unwrap()
            .values()
            .next()
            .unwrap()
            .clone();
        let half = proxy(&mut state, 0.5);

        draw_wgpu_shape_mesh_batch(
            &mut state,
            &half,
            &[white_triangle()],
            &mut buffers,
            &entry,
            &mut uniform_buffers,
            &mut bind_groups,
            &mut uniform_data,
        );

        assert_eq!(uniform_buffers.len(), 1);
        let upload = uploads_to(&records, &uniform_buffers[0]);
        assert_eq!(&upload[12..16], &[0.5, 0.5, 0.5, 0.5]);
        assert_eq!(&upload[16..24], &[0.25, 0.5, 0.75, 1.0, 0.1, 0.2, 0.3, 0.4]);
        submit_wgpu_frame(&mut state);
    }
}

mod draw_wgpu_shape_meshes {
    use super::*;

    #[test]
    fn sets_the_shape_mesh_pipeline_and_draws_each_mesh() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let proxy = proxy(&mut state, 1.0);

        draw_wgpu_shape_meshes(&mut state, &proxy, &[triangle(), triangle()], &mut buffers);

        assert!(
            get_wgpu_render_state_runtime(&state)
                .shape_mesh_pipelines
                .as_ref()
                .is_some_and(|cache| !cache.is_empty())
        );
        // Each drawn mesh uploads its three indices, padded to a 4-byte write.
        for index_buffer in &buffers.index_buffers {
            let write = recorded_buffer_writes(&records)
                .into_iter()
                .find(|write| &write.buffer == index_buffer)
                .unwrap();
            assert_eq!(write.data.len(), 8);
            assert_eq!(&write.data[0..6], &[0, 0, 1, 0, 2, 0]);
        }
        assert_eq!(buffers.index_buffers.len(), 2);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn retains_distinct_gpu_storage_for_every_mesh_recorded_before_submit() {
        let mut state = create_test_state_in_pass();
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let proxy = proxy(&mut state, 1.0);
        let mut second = triangle();
        second.color = 0x0080ffff;

        draw_wgpu_shape_meshes(&mut state, &proxy, &[triangle(), second], &mut buffers);

        assert_eq!(buffers.vertex_buffers.len(), 2);
        assert_eq!(buffers.index_buffers.len(), 2);
        assert_eq!(buffers.uniform_buffers.len(), 2);
        assert_ne!(buffers.vertex_buffers[0], buffers.vertex_buffers[1]);
        assert_ne!(buffers.index_buffers[0], buffers.index_buffers[1]);
        assert_ne!(buffers.uniform_buffers[0], buffers.uniform_buffers[1]);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn retires_grown_geometry_buffers_until_the_recorded_frame_is_submitted() {
        let mut state = create_test_state_in_pass();
        let native = get_wgpu_render_state_native_device(&state);
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let proxy = proxy(&mut state, 1.0);
        let mut larger = triangle();
        larger.vertices.extend_from_slice(&[10.0, 10.0]);
        larger.indices = vec![0, 1, 2, 1, 3, 2];

        draw_wgpu_shape_meshes(&mut state, &proxy, &[triangle()], &mut buffers);
        draw_wgpu_shape_meshes(&mut state, &proxy, &[larger], &mut buffers);

        let retired = get_wgpu_render_state_runtime(&state)
            .retired_buffers
            .clone()
            .unwrap();
        assert_eq!(retired.len(), 2);
        for buffer in &retired {
            assert!(!is_test_buffer_destroyed(&native, buffer));
        }
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn gates_the_fill_by_the_active_contour_clip_stencil_reference() {
        let mut state = create_test_state_in_pass();
        get_wgpu_render_state_runtime_mut(&mut state).current_mask_depth = 2;
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let proxy = proxy(&mut state, 1.0);

        draw_wgpu_shape_meshes(&mut state, &proxy, &[triangle()], &mut buffers);

        let pipeline = recorded_pipelines(&records).pop().unwrap();
        let stencil = pipeline.depth_stencil.unwrap().stencil;
        assert_eq!(stencil.front.compare, wgpu::CompareFunction::Equal);
        assert_eq!(stencil.write_mask, 0x00);
        assert_eq!(buffers.uniform_buffers.len(), 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn bakes_the_node_blend_mode_into_a_distinct_shape_pipeline() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let mut normal = proxy(&mut state, 1.0);
        normal.blend_mode = Some(BLEND_MODE_NORMAL.to_string());
        let mut add = proxy(&mut state, 1.0);
        add.blend_mode = Some(BLEND_MODE_ADD.to_string());

        draw_wgpu_shape_meshes(&mut state, &normal, &[triangle()], &mut test_default());
        draw_wgpu_shape_meshes(&mut state, &add, &[triangle()], &mut test_default());

        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .shape_mesh_pipelines
                .as_ref()
                .unwrap()
                .len(),
            2
        );
        let blends: Vec<wgpu::BlendComponent> = recorded_pipelines(&records)
            .iter()
            .map(|record| record.targets[0].as_ref().unwrap().blend.unwrap().color)
            .collect();
        assert!(blends.contains(&wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        }));
        assert!(blends.contains(&wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::One,
            operation: wgpu::BlendOperation::Add,
        }));
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn writes_premultiplied_color_into_the_uniform_buffer() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let proxy = proxy(&mut state, 0.5);

        draw_wgpu_shape_meshes(&mut state, &proxy, &[white_triangle()], &mut buffers);

        let uniform = uploads_to(&records, &buffers.uniform_buffers[0]);
        for value in &uniform[12..16] {
            assert!((value - 0.5).abs() < 1e-6);
        }
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn skips_fully_transparent_meshes() {
        let mut state = create_test_state_in_pass();
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let proxy = proxy(&mut state, 1.0);
        let mut transparent = triangle();
        transparent.alpha = 0.0;

        draw_wgpu_shape_meshes(&mut state, &proxy, &[transparent], &mut buffers);

        assert!(buffers.index_buffers.is_empty());
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn is_a_no_op_for_an_empty_mesh_list() {
        let mut state = create_test_state_in_pass();
        let proxy = proxy(&mut state, 1.0);

        draw_wgpu_shape_meshes(&mut state, &proxy, &[], &mut test_default());

        assert!(
            get_wgpu_render_state_runtime(&state)
                .shape_mesh_pipelines
                .as_ref()
                .is_none_or(|cache| cache.is_empty())
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn ignores_color_scale_bias_when_the_opt_in_feature_is_not_registered() {
        let mut state = create_test_state_in_pass();
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let mut proxy = proxy(&mut state, 1.0);
        proxy.color_scale_bias = Some(create_test_color_scale_bias(
            0.5, 0.5, 0.5, 1.0, 0.0, 0.0, 0.0, 0.0,
        ));

        draw_wgpu_shape_meshes(&mut state, &proxy, &[triangle()], &mut buffers);

        assert_eq!(buffers.uniform_buffers.len(), 1);
        assert_eq!(buffers.color_scale_bias_uniform_buffers.len(), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn keeps_registered_but_unadjusted_meshes_on_the_lean_uniform_path() {
        let mut state = create_test_state_in_pass();
        register_wgpu_color_adjustment_material_feature(&mut state);
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let proxy = proxy(&mut state, 1.0);

        draw_wgpu_shape_meshes(&mut state, &proxy, &[triangle()], &mut buffers);

        assert_eq!(buffers.uniform_buffers.len(), 1);
        assert_eq!(buffers.color_scale_bias_uniform_buffers.len(), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn folds_color_scale_bias_through_a_separate_96_byte_uniform_and_shader() {
        let mut state = create_test_state_in_pass();
        register_wgpu_color_adjustment_material_feature(&mut state);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let mut proxy = proxy(&mut state, 0.5);
        proxy.color_scale_bias = Some(create_test_color_scale_bias(
            0.25, 0.5, 0.75, 0.8, 0.1, 0.2, 0.3, 0.4,
        ));

        draw_wgpu_shape_meshes(&mut state, &proxy, &[white_triangle()], &mut buffers);

        assert_eq!(buffers.uniform_buffers.len(), 0);
        assert_eq!(buffers.color_scale_bias_uniform_buffers.len(), 1);
        let uniform = uploads_to(&records, &buffers.color_scale_bias_uniform_buffers[0]);
        assert_eq!(uniform.len(), 24);
        assert_eq!(&uniform[12..16], &[0.5, 0.5, 0.5, 0.5]);
        assert_eq!(
            &uniform[16..24],
            &[0.25, 0.5, 0.75, 0.8, 0.1, 0.2, 0.3, 0.4]
        );
        assert!(
            get_wgpu_render_state_runtime(&state)
                .context
                .read()
                .unwrap()
                .shape_mesh_color_scale_bias_pipelines
                .as_ref()
                .is_some_and(|cache| cache.len() == 1)
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn leaves_the_full_color_matrix_path_outside_the_bounded_solid_mesh_fold() {
        let mut state = create_test_state_in_pass();
        register_wgpu_color_adjustment_material_feature(&mut state);
        let mut buffers: WgpuShapeMeshBuffers = test_default();
        let mut proxy = proxy(&mut state, 1.0);
        proxy.color_matrix = Some([0.0; 20]);

        draw_wgpu_shape_meshes(&mut state, &proxy, &[triangle()], &mut buffers);

        assert_eq!(buffers.uniform_buffers.len(), 1);
        assert_eq!(buffers.color_scale_bias_uniform_buffers.len(), 0);
        submit_wgpu_frame(&mut state);
    }
}
