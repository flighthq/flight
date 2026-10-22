use flight_geometry::create_matrix4;
use flight_meshgeometry::{
    MeshGeometryOptions, VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic,
    create_box_mesh_geometry, create_mesh_geometry,
};
use flight_render_wgpu::*;
use flight_scene3d_wgpu::contract::*;
use flight_texture::{TextureFilter, TextureWrap, set_texture_uv_offset, set_texture_uv_scale};
use std::sync::Arc;

use crate::support::*;

fn make_pipeline(state: &mut WgpuRenderState) -> WgpuMeshPipeline {
    let module = create_test_mesh_module(state);
    let material_bind_group_layout = create_test_empty_layout(state);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: None,
            double_sided: false,
            extra_bind_group_layout: None,
            format: wgpu::TextureFormat::Bgra8Unorm,
            ibl_bind_group_layout: None,
            material_bind_group_layout,
            module,
            pbr_sample_bind_group_layout: None,
            shadow_bind_group_layout: None,
            skinned: None,
            topology: None,
        },
    );
}

fn make_blended_pipeline(state: &mut WgpuRenderState) -> WgpuMeshPipeline {
    let module = create_test_mesh_module(state);
    let material_bind_group_layout = create_test_empty_layout(state);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: Some(true),
            double_sided: false,
            extra_bind_group_layout: None,
            format: wgpu::TextureFormat::Bgra8Unorm,
            ibl_bind_group_layout: None,
            material_bind_group_layout,
            module,
            pbr_sample_bind_group_layout: None,
            shadow_bind_group_layout: None,
            skinned: None,
            topology: None,
        },
    );
}

fn make_shadow_pipeline(state: &mut WgpuRenderState) -> WgpuMeshPipeline {
    let module = create_test_mesh_module(state);
    let material_bind_group_layout = create_test_empty_layout(state);
    let shadow_bind_group_layout = ensure_wgpu_shadow_sample_layout(state);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: None,
            double_sided: false,
            extra_bind_group_layout: None,
            format: wgpu::TextureFormat::Bgra8Unorm,
            ibl_bind_group_layout: None,
            material_bind_group_layout,
            module,
            pbr_sample_bind_group_layout: None,
            shadow_bind_group_layout: Some(shadow_bind_group_layout),
            skinned: None,
            topology: None,
        },
    );
}

fn make_pbr_sample_pipeline(state: &mut WgpuRenderState) -> WgpuMeshPipeline {
    let module = create_test_mesh_module(state);
    let material_bind_group_layout = create_test_empty_layout(state);
    let pbr_sample_bind_group_layout = ensure_wgpu_pbr_sample_layout(state);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: None,
            double_sided: false,
            extra_bind_group_layout: None,
            format: wgpu::TextureFormat::Bgra8Unorm,
            ibl_bind_group_layout: None,
            material_bind_group_layout,
            module,
            pbr_sample_bind_group_layout: Some(pbr_sample_bind_group_layout),
            shadow_bind_group_layout: None,
            skinned: None,
            topology: None,
        },
    );
}

fn make_test_shadow(test: &WgpuScene3DTestState) -> WgpuScene3DShadow {
    let texture = test.native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 4,
            height: 4,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: SHADOW_DEPTH_FORMAT,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = texture.create_view(&test_default());
    return WgpuScene3DShadow {
        depth_texture: texture,
        depth_view: view,
        enabled: true,
        map_height: 1024,
        map_width: 1024,
        matrix: create_matrix4(),
        normal_bias_world: 0.0,
        pcf_radius: 0.0,
        shadow_bias: 0.0,
    };
}

fn make_test_cube(
    test: &WgpuScene3DTestState,
    mip_level_count: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = test.native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 4,
            height: 4,
            depth_or_array_layers: 6,
        },
        mip_level_count,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::Cube),
        ..test_default()
    });
    return (texture, view);
}

fn make_test_ibl(test: &WgpuScene3DTestState) -> WgpuScene3DIbl {
    let (irradiance_cube, irradiance_cube_view) = make_test_cube(test, 1);
    let (prefiltered_cube, prefiltered_cube_view) = make_test_cube(test, 3);
    let brdf_lut = test.native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 4,
            height: 4,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let brdf_lut_view = brdf_lut.create_view(&test_default());
    return WgpuScene3DIbl {
        brdf_lut,
        brdf_lut_view,
        intensity: 1.0,
        irradiance_cube,
        irradiance_cube_view,
        prefiltered_cube,
        prefiltered_cube_view,
        prefiltered_mip_count: 5,
    };
}

// One full instance record: the identity model matrix followed by the opaque-white tint.
fn identity_instance_record(count: usize) -> Vec<f32> {
    let mut records = vec![0.0_f32; count * 20];
    for index in 0..count {
        let offset = index * 20;
        records[offset] = 1.0;
        records[offset + 5] = 1.0;
        records[offset + 10] = 1.0;
        records[offset + 15] = 1.0;
        records[offset + 16..offset + 20].fill(1.0);
    }
    return records;
}

fn last_pipeline_layout_group_count(test: &WgpuScene3DTestState) -> usize {
    let layouts = test.named("createPipelineLayout");
    let Some(WgpuCommandRecord::CreatePipelineLayout(layout)) = layouts.last() else {
        panic!("a pipeline layout was created");
    };
    return layout.bind_group_layouts.len();
}

fn premultiplied(dst_factor: wgpu::BlendFactor) -> wgpu::BlendState {
    let component = wgpu::BlendComponent {
        src_factor: wgpu::BlendFactor::One,
        dst_factor,
        operation: wgpu::BlendOperation::Add,
    };
    return wgpu::BlendState {
        color: component,
        alpha: component,
    };
}

fn make_feature() -> WgpuColorAdjustmentMaterialFeature {
    fn record(
        _runtime: &mut WgpuRenderStateRuntime,
        _value: Option<&WgpuColorScaleBiasInput>,
        _index: u32,
    ) {
    }
    fn resolve_flush(
        _state: &mut WgpuRenderState,
        _count: u32,
    ) -> Option<WgpuColorAdjustmentFlush> {
        return None;
    }
    return WgpuColorAdjustmentMaterialFeature {
        fragment_shader_chunk: "fn applyFlightColorAdjustment() {}",
        matrix_fragment_shader_chunk: "fn applyFlightColorMatrix() {}",
        draw_shape_meshes: None,
        record,
        resolve_flush,
    };
}

mod begin_wgpu_mesh_draw {
    use super::*;

    #[test]
    fn stores_the_active_pipeline_sets_it_and_binds_the_frame_group() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_frame_bind_group(&mut test.state);
        let pipeline = make_pipeline(&mut test.state);
        begin_wgpu_mesh_draw(&mut test.state, &pipeline);
        let active = get_wgpu_scene3d_runtime(&mut test.state)
            .active_mesh_pipeline
            .clone()
            .unwrap();
        assert_eq!(active.pipeline, pipeline.pipeline);
        assert!(test.count("setPipeline") > 0);
        assert!(test.set_bind_groups().iter().any(|set| set.index == 0));
    }

    #[test]
    fn does_not_bind_group_3_for_a_pipeline_without_a_shadow_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_frame_bind_group(&mut test.state);
        let pipeline = make_pipeline(&mut test.state);
        begin_wgpu_mesh_draw(&mut test.state, &pipeline);
        assert!(!test.set_bind_groups().iter().any(|set| set.index == 3));
    }

    #[test]
    fn binds_the_shared_shadow_group_at_group_3_for_a_shadow_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_frame_bind_group(&mut test.state);
        let pipeline = make_shadow_pipeline(&mut test.state);
        begin_wgpu_mesh_draw(&mut test.state, &pipeline);
        assert!(test.set_bind_groups().iter().any(|set| set.index == 3));
    }

    #[test]
    fn binds_the_combined_pbr_sample_group_at_group_3() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_frame_bind_group(&mut test.state);
        let pipeline = make_pbr_sample_pipeline(&mut test.state);
        begin_wgpu_mesh_draw(&mut test.state, &pipeline);
        assert!(test.set_bind_groups().iter().any(|set| set.index == 3));
    }
}

mod build_wgpu_material_bind_group {
    use super::*;

    #[test]
    fn emits_the_uniform_buffer_at_0_the_sampler_at_1_and_each_map_view_at_2_plus_i() {
        let test = make_wgpu_scene3d_state(None);
        let layout = create_test_material_layout(&test.state, 2);
        let buffer = create_test_uniform_buffer(&test.state, 48);
        let sampler = create_test_sampler(&test.state);
        let view0 = create_test_view(&test.state);
        let view1 = create_test_view(&test.state);

        build_wgpu_material_bind_group(
            &test.state,
            &layout,
            &buffer,
            &sampler,
            &[view0.clone(), view1.clone()],
        );

        let group = test.bind_groups()[0].clone();
        let bindings: Vec<u32> = group.entries.iter().map(|entry| entry.binding).collect();
        assert_eq!(bindings, vec![0, 1, 2, 3]);
        assert!(
            matches!(&group.entries[0].resource, WgpuBindingResourceRecord::Buffer(binding) if binding.buffer == buffer)
        );
        assert_eq!(
            group.entries[1].resource,
            WgpuBindingResourceRecord::Sampler(sampler)
        );
        assert_eq!(
            group.entries[2].resource,
            WgpuBindingResourceRecord::TextureView(view0)
        );
        assert_eq!(
            group.entries[3].resource,
            WgpuBindingResourceRecord::TextureView(view1)
        );
    }
}

mod build_wgpu_per_map_material_bind_group {
    use super::*;

    #[test]
    fn emits_parallel_samplers_before_their_matching_map_views() {
        let test = make_wgpu_scene3d_state(None);
        let layout = create_test_per_map_layout(&test.state, 2);
        let buffer = create_test_uniform_buffer(&test.state, 48);
        let sampler0 = create_test_sampler(&test.state);
        let sampler1 = create_test_sampler(&test.state);
        let view0 = create_test_view(&test.state);
        let view1 = create_test_view(&test.state);

        build_wgpu_per_map_material_bind_group(
            &test.state,
            &layout,
            &buffer,
            &[sampler0.clone(), sampler1.clone()],
            &[view0.clone(), view1.clone()],
        );

        let group = test.bind_groups()[0].clone();
        let bindings: Vec<u32> = group.entries.iter().map(|entry| entry.binding).collect();
        assert_eq!(bindings, vec![0, 1, 2, 3, 4]);
        assert!(
            matches!(&group.entries[0].resource, WgpuBindingResourceRecord::Buffer(binding) if binding.buffer == buffer)
        );
        let resources: Vec<WgpuBindingResourceRecord> = group.entries[1..]
            .iter()
            .map(|entry| entry.resource.clone())
            .collect();
        assert_eq!(
            resources,
            vec![
                WgpuBindingResourceRecord::Sampler(sampler0),
                WgpuBindingResourceRecord::Sampler(sampler1),
                WgpuBindingResourceRecord::TextureView(view0),
                WgpuBindingResourceRecord::TextureView(view1),
            ]
        );
    }
}

mod create_wgpu_mesh_pipeline {
    use super::*;

    #[test]
    fn builds_a_pipeline_over_the_shared_frame_and_draw_layouts() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = make_pipeline(&mut test.state);
        assert!(!pipeline.has_shadow_group);
        assert_eq!(test.count("createRenderPipeline"), 1);
        assert_eq!(last_pipeline_layout_group_count(&test), 3);
    }

    #[test]
    fn appends_the_shadow_layout_as_group_3_when_given_a_shadow_bind_group_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = make_shadow_pipeline(&mut test.state);
        assert!(pipeline.has_shadow_group);
        assert_eq!(last_pipeline_layout_group_count(&test), 4);
    }

    #[test]
    fn uses_one_group_3_sample_layout_for_pbr_shadow_and_ibl_resources() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = make_pbr_sample_pipeline(&mut test.state);
        assert!(pipeline.has_pbr_sample_group);
        assert!(!pipeline.has_shadow_group);
        assert!(!pipeline.has_ibl_group);
        assert_eq!(last_pipeline_layout_group_count(&test), 4);
    }

    #[test]
    fn uses_premultiplied_blending_and_disables_depth_writes_for_a_blended_variant() {
        let mut test = make_wgpu_scene3d_state(None);
        make_blended_pipeline(&mut test.state);
        let descriptor = test.pipelines().last().cloned().unwrap();
        assert_eq!(
            descriptor.targets[0].as_ref().unwrap().blend,
            Some(premultiplied(wgpu::BlendFactor::OneMinusSrcAlpha))
        );
        assert_eq!(
            descriptor.depth_stencil.unwrap().depth_write_enabled,
            Some(false)
        );
    }

    #[test]
    fn uses_the_active_surface_blend_mode_for_a_blended_variant() {
        let mut test = make_wgpu_scene3d_state(None);
        get_wgpu_scene3d_runtime(&mut test.state).active_blend_mode =
            Some(flight_materials::BLEND_MODE_ADD.to_string());
        make_blended_pipeline(&mut test.state);
        let descriptor = test.pipelines().last().cloned().unwrap();
        assert_eq!(
            descriptor.targets[0].as_ref().unwrap().blend,
            Some(premultiplied(wgpu::BlendFactor::One))
        );
    }

    #[test]
    fn keeps_blending_disabled_and_depth_writes_enabled_for_an_opaque_variant() {
        let mut test = make_wgpu_scene3d_state(None);
        make_pipeline(&mut test.state);
        let descriptor = test.pipelines().last().cloned().unwrap();
        assert_eq!(descriptor.targets[0].as_ref().unwrap().blend, None);
        assert_eq!(
            descriptor.depth_stencil.unwrap().depth_write_enabled,
            Some(true)
        );
    }
}

mod draw_wgpu_mesh_subset {
    use super::*;

    #[test]
    fn issues_an_indexed_draw_over_the_subset_after_a_pipeline_is_active() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_frame_bind_group(&mut test.state);
        let pipeline = make_pipeline(&mut test.state);
        begin_wgpu_mesh_draw(&mut test.state, &pipeline);
        let proxy = make_test_proxy();
        draw_wgpu_mesh_subset(
            &mut test.state,
            &proxy,
            &create_box_mesh_geometry(None, None, None),
        );
        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, proxy.subset.index_count);
    }

    // The defect this covers: non-indexed geometry issued no draw call at all, so a valid imported
    // mesh rendered nothing and reported nothing.
    #[test]
    fn issues_a_non_indexed_draw_for_geometry_without_indices() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_frame_bind_group(&mut test.state);
        let pipeline = make_pipeline(&mut test.state);
        begin_wgpu_mesh_draw(&mut test.state, &pipeline);
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 9].into_boxed_slice(),
            layout: std::sync::Arc::new(std::sync::RwLock::new(VertexAttributeLayout {
                attributes: vec![VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                }],
                stride: 12,
            })),
            indices: None,
            subsets: None,
            topology: None,
        });
        let proxy = make_test_proxy_for(
            &geometry,
            share_test_material(flight_materials::contract::create_standard_pbr_material()),
        );

        draw_wgpu_mesh_subset(&mut test.state, &proxy, &geometry);

        let draws = test.draws();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].vertex_count, proxy.subset.index_count);
        assert_eq!(proxy.subset.index_offset, 0);
        // It must not try to bind an index buffer it does not have.
        assert_eq!(test.count("setIndexBuffer"), 0);
        assert_eq!(test.count("drawIndexed"), 0);
    }

    #[test]
    fn is_a_no_op_when_no_pipeline_is_active() {
        let mut test = make_wgpu_scene3d_state(None);
        draw_wgpu_mesh_subset(
            &mut test.state,
            &make_test_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(test.count("drawIndexed"), 0);
    }
}

mod ensure_wgpu_frame_bind_group {
    use super::*;

    #[test]
    fn creates_the_frame_buffer_and_bind_group_once_and_reuses_them() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_frame_bind_group(&mut test.state);
        let buffers = test.count("createBuffer");
        let b = ensure_wgpu_frame_bind_group(&mut test.state);
        assert_eq!(a, b);
        assert_eq!(test.count("createBuffer"), buffers);
    }
}

mod ensure_wgpu_ibl_sample_bind_group {
    use super::*;

    #[test]
    fn writes_the_disabled_ibl_uniform_and_reuses_the_bind_group_when_no_ibl_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_ibl_sample_bind_group(&mut test.state);
        let made = test.count("createBindGroup");
        let b = ensure_wgpu_ibl_sample_bind_group(&mut test.state);
        assert_eq!(a, b);
        assert_eq!(test.count("createBindGroup"), made);
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn rebuilds_the_bind_group_when_a_baked_ibl_set_becomes_present() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_ibl_sample_bind_group(&mut test.state);
        let before = test.count("createBindGroup");
        let ibl = make_test_ibl(&test);
        get_wgpu_scene3d_runtime(&mut test.state).ibl = Some(ibl);
        ensure_wgpu_ibl_sample_bind_group(&mut test.state);
        assert_eq!(test.count("createBindGroup"), before + 1);
    }
}

mod ensure_wgpu_ibl_sample_layout {
    use super::*;

    #[test]
    fn creates_the_ibl_sample_layout_once_per_state() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_ibl_sample_layout(&mut test.state);
        let made = test.count("createBindGroupLayout");
        let b = ensure_wgpu_ibl_sample_layout(&mut test.state);
        assert_eq!(a, b);
        assert_eq!(test.count("createBindGroupLayout"), made);
    }
}

mod ensure_wgpu_instance_buffer {
    use super::*;

    #[test]
    fn creates_a_gpu_buffer_sized_for_the_given_instance_count() {
        let mut test = make_wgpu_scene3d_state(None);
        let records = identity_instance_record(1);
        ensure_wgpu_instance_buffer(&mut test.state, Some(&records), 1);
        assert!(test.count("createBuffer") > 0);
    }

    // Two instanced draws in one frame record into the same pass, submitted once, so each claim must
    // be a distinct slot.
    #[test]
    fn hands_successive_claims_in_a_frame_distinct_buffers() {
        let mut test = make_wgpu_scene3d_state(None);
        let records = identity_instance_record(1);
        let a = ensure_wgpu_instance_buffer(&mut test.state, Some(&records), 1);
        let b = ensure_wgpu_instance_buffer(&mut test.state, Some(&records), 1);
        assert_ne!(a, b);
    }

    #[test]
    fn reuses_a_slot_buffer_across_frames_when_capacity_is_sufficient() {
        let mut test = make_wgpu_scene3d_state(None);
        let records = identity_instance_record(1);
        let first = ensure_wgpu_instance_buffer(&mut test.state, Some(&records), 1);
        let buffers_before = test.count("createBuffer");

        get_wgpu_render_state_runtime_mut(&mut test.state).mesh_instance_buffer_cursor = 0;
        let second = ensure_wgpu_instance_buffer(&mut test.state, Some(&records), 1);

        assert_eq!(second, first);
        assert_eq!(test.count("createBuffer"), buffers_before);
    }

    #[test]
    fn falls_back_to_an_identity_matrix_when_matrices_is_null() {
        let mut test = make_wgpu_scene3d_state(None);
        let buffer = ensure_wgpu_instance_buffer(&mut test.state, None, 1);
        let writes = test.buffer_writes();
        let write = writes.iter().find(|write| write.buffer == buffer).unwrap();
        assert_eq!(bytes_to_f32(&write.data), identity_instance_record(1));
    }
}

mod ensure_wgpu_material_binding {
    use super::*;

    #[test]
    fn creates_the_buffer_and_bind_group_once_owns_a_copy_of_the_scratch_and_steady_state_binds_build_nothing()
     {
        let mut test = make_wgpu_scene3d_state(None);
        let layout = create_test_material_layout(&test.state, 2);
        let sampler = create_test_sampler(&test.state);
        let scratch = vec![create_test_view(&test.state), create_test_view(&test.state)];
        let binding =
            ensure_wgpu_material_binding(&mut test.state, 1, &layout, 48, &sampler, &scratch);

        assert_eq!(test.count("createBuffer"), 1);
        assert_eq!(test.count("createBindGroup"), 1);
        assert_eq!(binding.views.as_ref().unwrap(), &scratch);

        ensure_wgpu_material_binding(&mut test.state, 1, &layout, 48, &sampler, &scratch);
        ensure_wgpu_material_binding(&mut test.state, 1, &layout, 48, &sampler, &scratch);
        assert_eq!(test.count("createBuffer"), 1);
        assert_eq!(test.count("createBindGroup"), 1);
    }

    #[test]
    fn rebuilds_the_bind_group_in_place_reusing_the_buffer_when_a_resolved_view_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        let layout = create_test_material_layout(&test.state, 2);
        let sampler = create_test_sampler(&test.state);
        let mut scratch = vec![create_test_view(&test.state), create_test_view(&test.state)];
        ensure_wgpu_material_binding(&mut test.state, 1, &layout, 48, &sampler, &scratch);
        scratch[0] = create_test_view(&test.state);
        ensure_wgpu_material_binding(&mut test.state, 1, &layout, 48, &sampler, &scratch);

        assert_eq!(test.count("createBuffer"), 1);
        assert_eq!(test.count("createBindGroup"), 2);
    }

    #[test]
    fn rebuilds_when_the_primary_sampler_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        let layout = create_test_material_layout(&test.state, 2);
        let sampler = create_test_sampler(&test.state);
        let scratch = vec![create_test_view(&test.state), create_test_view(&test.state)];
        ensure_wgpu_material_binding(&mut test.state, 1, &layout, 48, &sampler, &scratch);
        let other = create_test_sampler(&test.state);
        ensure_wgpu_material_binding(&mut test.state, 1, &layout, 48, &other, &scratch);
        assert_eq!(test.count("createBindGroup"), 2);
    }
}

mod ensure_wgpu_pbr_sample_bind_group {
    use super::*;

    #[test]
    fn packs_shadow_and_ibl_sample_bindings_into_one_cached_group() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_pbr_sample_bind_group(&mut test.state);
        let last = test.bind_groups().last().cloned().unwrap();
        let made = test.count("createBindGroup");
        let b = ensure_wgpu_pbr_sample_bind_group(&mut test.state);

        assert_eq!(a, b);
        assert_eq!(test.count("createBindGroup"), made);
        assert_eq!(last.entries.len(), 8);
        assert!(test.count("writeBuffer") >= 2);
    }

    #[test]
    fn rebuilds_the_group_when_a_shadow_map_becomes_present() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_pbr_sample_bind_group(&mut test.state);
        let before = test.count("createBindGroup");
        let shadow = make_test_shadow(&test);
        get_wgpu_scene3d_runtime(&mut test.state).shadow = Some(shadow);
        ensure_wgpu_pbr_sample_bind_group(&mut test.state);
        assert_eq!(test.count("createBindGroup"), before + 1);
    }

    #[test]
    fn packs_the_directional_shadow_configuration_into_the_combined_pbr_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut shadow = make_test_shadow(&test);
        shadow.normal_bias_world = 0.02;
        shadow.pcf_radius = 2.0;
        shadow.shadow_bias = 0.01;
        get_wgpu_scene3d_runtime(&mut test.state).shadow = Some(shadow);

        ensure_wgpu_pbr_sample_bind_group(&mut test.state);

        let uniform = get_wgpu_scene3d_runtime(&mut test.state)
            .shadow_uniform_buffer
            .clone()
            .unwrap();
        let write = test
            .buffer_writes()
            .into_iter()
            .find(|write| write.buffer == uniform)
            .unwrap();
        let values = bytes_to_f32(&write.data);
        assert_eq!(values[16], 1.0);
        assert_eq!(values[17], 2.0);
        assert!((values[18] - 0.01).abs() < 1e-6);
        assert!((values[19] - 0.02).abs() < 1e-6);
    }
}

mod ensure_wgpu_pbr_sample_layout {
    use super::*;

    #[test]
    fn creates_the_combined_pbr_sample_layout_once_per_state() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_pbr_sample_layout(&mut test.state);
        let last = test.bind_group_layouts().last().cloned().unwrap();
        let made = test.count("createBindGroupLayout");
        let b = ensure_wgpu_pbr_sample_layout(&mut test.state);

        assert_eq!(a, b);
        assert_eq!(test.count("createBindGroupLayout"), made);
        assert_eq!(last.entries.len(), 8);
    }
}

mod ensure_wgpu_per_map_material_binding {
    use super::*;

    #[test]
    fn owns_the_parallel_scratch_copies_and_builds_nothing_on_steady_state_rebind() {
        let mut test = make_wgpu_scene3d_state(None);
        let layout = create_test_per_map_layout(&test.state, 2);
        let samplers = vec![
            create_test_sampler(&test.state),
            create_test_sampler(&test.state),
        ];
        let views = vec![create_test_view(&test.state), create_test_view(&test.state)];
        let binding = ensure_wgpu_per_map_material_binding(
            &mut test.state,
            1,
            &layout,
            48,
            &samplers,
            &views,
        );

        assert_eq!(binding.samplers.as_ref().unwrap(), &samplers);
        assert_eq!(binding.views.as_ref().unwrap(), &views);
        ensure_wgpu_per_map_material_binding(&mut test.state, 1, &layout, 48, &samplers, &views);
        assert_eq!(test.count("createBuffer"), 1);
        assert_eq!(test.count("createBindGroup"), 1);
    }

    #[test]
    fn rebuilds_only_the_bind_group_when_a_non_primary_sampler_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        let layout = create_test_per_map_layout(&test.state, 2);
        let mut samplers = vec![
            create_test_sampler(&test.state),
            create_test_sampler(&test.state),
        ];
        let views = vec![create_test_view(&test.state), create_test_view(&test.state)];
        let binding = ensure_wgpu_per_map_material_binding(
            &mut test.state,
            1,
            &layout,
            48,
            &samplers,
            &views,
        );
        let replacement = create_test_sampler(&test.state);
        samplers[1] = replacement.clone();

        let rebuilt = ensure_wgpu_per_map_material_binding(
            &mut test.state,
            1,
            &layout,
            48,
            &samplers,
            &views,
        );

        assert_eq!(rebuilt.buffer, binding.buffer);
        assert_eq!(rebuilt.samplers.unwrap()[1], replacement);
        assert_eq!(test.count("createBuffer"), 1);
        assert_eq!(test.count("createBindGroup"), 2);
    }
}

mod ensure_wgpu_placeholder_texture_view {
    use super::*;

    #[test]
    fn creates_the_1x1_white_texture_once_and_reuses_the_view() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_placeholder_texture_view(&mut test.state);
        let textures = test.count("createTexture");
        let b = ensure_wgpu_placeholder_texture_view(&mut test.state);
        assert_eq!(a, b);
        assert_eq!(test.count("createTexture"), textures);
        assert_eq!(test.texture_writes()[0].data, vec![255, 255, 255, 255]);
    }
}

mod ensure_wgpu_scene3d_layouts {
    use super::*;

    #[test]
    fn creates_the_frame_and_draw_layouts_once_per_state() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_scene3d_layouts(&mut test.state);
        let made = test.count("createBindGroupLayout");
        ensure_wgpu_scene3d_layouts(&mut test.state);
        assert_eq!(test.count("createBindGroupLayout"), made);
    }
}

mod ensure_wgpu_scene3d_pipeline {
    use super::*;

    fn cache_keys(state: &mut WgpuRenderState) -> Vec<String> {
        let mut keys: Vec<String> = get_wgpu_scene3d_runtime(state)
            .pipeline_cache
            .keys()
            .cloned()
            .collect();
        keys.sort();
        return keys;
    }

    #[test]
    fn compiles_a_key_once_and_returns_the_cached_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut compiles = 0;
        let mut compile = |state: &mut WgpuRenderState, _blended: bool, _skinned: bool| {
            compiles += 1;
            return make_pipeline(state);
        };
        let a = ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        let b = ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        assert_eq!(a.pipeline, b.pipeline);
        assert_eq!(compiles, 1);
    }

    #[test]
    fn caches_separate_opaque_and_blended_variants_of_the_same_family_key() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut variants = Vec::new();
        let mut compile = |state: &mut WgpuRenderState, blended: bool, _skinned: bool| {
            variants.push(blended);
            return make_pipeline(state);
        };

        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        get_wgpu_scene3d_runtime(&mut test.state).active_blended_run = true;
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);

        assert_eq!(variants, vec![false, true]);
        assert_eq!(
            cache_keys(&mut test.state),
            vec![
                "fam:bgra8unorm|-|blend:Normal|rigid|direct".to_string(),
                "fam:bgra8unorm|-|opaque|rigid|direct".to_string(),
            ]
        );
    }

    #[test]
    fn caches_distinct_blended_equations_as_separate_immutable_pipeline_variants() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut compiles = 0;
        let mut compile = |state: &mut WgpuRenderState, _blended: bool, _skinned: bool| {
            compiles += 1;
            return make_pipeline(state);
        };
        get_wgpu_scene3d_runtime(&mut test.state).active_blended_run = true;
        get_wgpu_scene3d_runtime(&mut test.state).active_blend_mode =
            Some(flight_materials::BLEND_MODE_ADD.to_string());
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        get_wgpu_scene3d_runtime(&mut test.state).active_blend_mode =
            Some(flight_materials::BLEND_MODE_MULTIPLY.to_string());
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);

        assert_eq!(compiles, 2);
        assert_eq!(
            cache_keys(&mut test.state),
            vec![
                "fam:bgra8unorm|-|blend:Add|rigid|direct".to_string(),
                "fam:bgra8unorm|-|blend:Multiply|rigid|direct".to_string(),
            ]
        );
    }

    #[test]
    fn caches_one_pipeline_variant_per_blend_mode_not_per_alpha_convention() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut compiles = 0;
        let mut compile = |state: &mut WgpuRenderState, _blended: bool, _skinned: bool| {
            compiles += 1;
            return make_pipeline(state);
        };
        get_wgpu_scene3d_runtime(&mut test.state).active_blended_run = true;
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        get_wgpu_scene3d_runtime(&mut test.state).active_blend_mode =
            Some(flight_materials::BLEND_MODE_ADD.to_string());
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);

        assert_eq!(compiles, 2);
        assert_eq!(
            cache_keys(&mut test.state),
            vec![
                "fam:bgra8unorm|-|blend:Add|rigid|direct".to_string(),
                "fam:bgra8unorm|-|blend:Normal|rigid|direct".to_string(),
            ]
        );
    }

    #[test]
    fn caches_rigid_and_skinned_variants_independently() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut variants = Vec::new();
        let mut compile = |state: &mut WgpuRenderState, _blended: bool, skinned: bool| {
            variants.push(skinned);
            return make_pipeline(state);
        };

        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);
        get_wgpu_scene3d_runtime(&mut test.state).active_skinned_run = true;
        ensure_wgpu_scene3d_pipeline(&mut test.state, "fam:bgra8unorm|-", &mut compile);

        assert_eq!(variants, vec![false, true]);
        assert_eq!(
            cache_keys(&mut test.state),
            vec![
                "fam:bgra8unorm|-|opaque|rigid|direct".to_string(),
                "fam:bgra8unorm|-|opaque|skin|direct".to_string(),
            ]
        );
    }
}

mod ensure_wgpu_shadow_sample_bind_group {
    use super::*;

    #[test]
    fn writes_the_disabled_shadow_uniform_and_reuses_the_bind_group_when_no_shadow_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_shadow_sample_bind_group(&mut test.state);
        let made = test.count("createBindGroup");
        let b = ensure_wgpu_shadow_sample_bind_group(&mut test.state);
        assert_eq!(a, b);
        assert_eq!(test.count("createBindGroup"), made);
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn rebuilds_the_bind_group_when_a_shadow_map_becomes_present() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_shadow_sample_bind_group(&mut test.state);
        let before = test.count("createBindGroup");
        let shadow = make_test_shadow(&test);
        get_wgpu_scene3d_runtime(&mut test.state).shadow = Some(shadow);
        ensure_wgpu_shadow_sample_bind_group(&mut test.state);
        assert_eq!(test.count("createBindGroup"), before + 1);
    }

    #[test]
    fn packs_the_same_directional_shadow_configuration_into_the_classic_toon_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut shadow = make_test_shadow(&test);
        shadow.normal_bias_world = 0.02;
        shadow.pcf_radius = 2.0;
        shadow.shadow_bias = 0.01;
        get_wgpu_scene3d_runtime(&mut test.state).shadow = Some(shadow);

        ensure_wgpu_shadow_sample_bind_group(&mut test.state);

        let uniform = get_wgpu_scene3d_runtime(&mut test.state)
            .shadow_uniform_buffer
            .clone()
            .unwrap();
        let write = test
            .buffer_writes()
            .into_iter()
            .find(|write| write.buffer == uniform)
            .unwrap();
        let values = bytes_to_f32(&write.data);
        assert_eq!(values[16], 1.0);
        assert_eq!(values[17], 2.0);
        assert!((values[18] - 0.01).abs() < 1e-6);
        assert!((values[19] - 0.02).abs() < 1e-6);
    }
}

mod ensure_wgpu_shadow_sample_layout {
    use super::*;

    #[test]
    fn creates_the_shadow_sample_layout_once_per_state() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_shadow_sample_layout(&mut test.state);
        let made = test.count("createBindGroupLayout");
        let b = ensure_wgpu_shadow_sample_layout(&mut test.state);
        assert_eq!(a, b);
        assert_eq!(test.count("createBindGroupLayout"), made);
    }
}

mod get_wgpu_material_sampler {
    use super::*;

    #[test]
    fn returns_the_shared_clamp_sampler_for_a_null_map() {
        let test = make_wgpu_scene3d_state(None);
        assert_eq!(
            get_wgpu_material_sampler(&test.state, None),
            get_wgpu_render_state_device_resources(&test.state).linear_sampler
        );
    }

    #[test]
    fn derives_a_wrap_and_mip_specific_sampler_for_a_tiling_map() {
        let test = make_wgpu_scene3d_state(None);
        let mut texture = create_test_bitmap_texture(1, 1);
        {
            let sampler =
                &mut flight_texture::TextureUvTransform::texture_fields_mut(&mut texture).sampler;
            sampler.wrap_u = TextureWrap::Repeat;
            sampler.wrap_v = TextureWrap::Repeat;
        }

        let sampler = get_wgpu_material_sampler(&test.state, Some(&texture));

        assert_ne!(
            sampler,
            get_wgpu_render_state_device_resources(&test.state).linear_sampler
        );
        assert_eq!(
            get_wgpu_material_sampler(&test.state, Some(&texture)),
            sampler
        );
    }

    #[test]
    fn preserves_independent_minification_and_magnification_filters() {
        let test = make_wgpu_scene3d_state(None);
        let mut texture = create_test_bitmap_texture(1, 1);
        {
            let sampler =
                &mut flight_texture::TextureUvTransform::texture_fields_mut(&mut texture).sampler;
            sampler.min_filter = TextureFilter::Nearest;
            sampler.mag_filter = TextureFilter::Linear;
        }

        get_wgpu_material_sampler(&test.state, Some(&texture));

        let created = test.samplers().last().cloned().unwrap();
        assert_eq!(created.min_filter, wgpu::FilterMode::Nearest);
        assert_eq!(created.mag_filter, wgpu::FilterMode::Linear);
    }

    #[test]
    fn drops_the_mip_filter_when_the_map_disables_mipmaps() {
        let test = make_wgpu_scene3d_state(None);
        let mut no_mip = create_test_bitmap_texture(1, 1);
        flight_texture::TextureUvTransform::texture_fields_mut(&mut no_mip)
            .sampler
            .mipmaps = false;
        let with_mip = create_test_bitmap_texture(1, 1);

        let before = get_wgpu_render_state_runtime(&test.state)
            .context
            .read()
            .unwrap()
            .sampler_cache
            .len();
        get_wgpu_material_sampler(&test.state, Some(&no_mip));
        get_wgpu_material_sampler(&test.state, Some(&with_mip));
        let after = get_wgpu_render_state_runtime(&test.state)
            .context
            .read()
            .unwrap()
            .sampler_cache
            .len();
        assert_eq!(after - before, 2);
    }

    #[test]
    fn carries_the_map_anisotropy_into_the_derived_sampler() {
        let test = make_wgpu_scene3d_state(None);
        let mut aniso = create_test_bitmap_texture(1, 1);
        flight_texture::TextureUvTransform::texture_fields_mut(&mut aniso)
            .sampler
            .anisotropy = 8.0;
        let no_aniso = create_test_bitmap_texture(1, 1);

        let before = get_wgpu_render_state_runtime(&test.state)
            .context
            .read()
            .unwrap()
            .sampler_cache
            .len();
        get_wgpu_material_sampler(&test.state, Some(&aniso));
        get_wgpu_material_sampler(&test.state, Some(&no_aniso));
        let after = get_wgpu_render_state_runtime(&test.state)
            .context
            .read()
            .unwrap()
            .sampler_cache
            .len();
        assert_eq!(after - before, 2);
    }
}

mod get_wgpu_mesh_prelude_wgsl {
    use super::*;

    #[test]
    fn adds_the_palette_binding_attributes_and_texture_load_skin_matrix_only_to_the_skinned_variant()
     {
        let rigid = get_wgpu_mesh_prelude_wgsl(false, None);
        let skinned = get_wgpu_mesh_prelude_wgsl(true, Some(make_wgpu_skinning_adapter()));

        assert!(!rigid.contains("jointTexture"));
        assert!(!rigid.contains("joints0"));
        assert!(skinned.contains("@group(1) @binding(1) var jointTexture"));
        assert!(skinned.contains("@location(4) joints0 : vec4f"));
        assert!(skinned.contains("@location(5) weights0 : vec4f"));
        assert!(skinned.contains("textureLoad(jointTexture"));
        assert!(skinned.contains("localPosition = skin * localPosition"));
    }
}

mod initialize_wgpu_mesh_pipeline {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_mesh_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut pipeline = make_pipeline(&mut test.state);
        let id = flight_entity::get_entity_id(&pipeline);
        let module = create_test_mesh_module(&test.state);
        let material_bind_group_layout = create_test_empty_layout(&test.state);
        let shadow_bind_group_layout = ensure_wgpu_shadow_sample_layout(&mut test.state);
        initialize_wgpu_mesh_pipeline(
            &mut pipeline,
            &mut test.state,
            &WgpuMeshPipelineOptions {
                blended: None,
                double_sided: true,
                extra_bind_group_layout: None,
                format: wgpu::TextureFormat::Bgra8Unorm,
                ibl_bind_group_layout: None,
                material_bind_group_layout,
                module,
                pbr_sample_bind_group_layout: None,
                shadow_bind_group_layout: Some(shadow_bind_group_layout),
                skinned: None,
                topology: None,
            },
        );
        assert!(pipeline.has_shadow_group);
        assert_eq!(flight_entity::get_entity_id(&pipeline), id);
    }
}

mod is_wgpu_material_bind_group_rebuild_needed {
    use super::*;

    fn make_cached(
        test: &WgpuScene3DTestState,
    ) -> (
        WgpuMaterialBinding,
        wgpu::Sampler,
        wgpu::TextureView,
        wgpu::TextureView,
    ) {
        let layout = create_test_material_layout(&test.state, 2);
        let buffer = create_test_uniform_buffer(&test.state, 48);
        let sampler = create_test_sampler(&test.state);
        let view0 = create_test_view(&test.state);
        let view1 = create_test_view(&test.state);
        let bind_group = build_wgpu_material_bind_group(
            &test.state,
            &layout,
            &buffer,
            &sampler,
            &[view0.clone(), view1.clone()],
        );
        let cached = WgpuMaterialBinding {
            bind_group,
            buffer,
            samplers: None,
            sampler: Some(sampler.clone()),
            views: Some(vec![view0.clone(), view1.clone()]),
        };
        return (cached, sampler, view0, view1);
    }

    #[test]
    fn is_false_when_the_sampler_and_every_resolved_view_match_the_cache() {
        let test = make_wgpu_scene3d_state(None);
        let (cached, sampler, view0, view1) = make_cached(&test);
        assert!(!is_wgpu_material_bind_group_rebuild_needed(
            &cached,
            &sampler,
            &[view0, view1]
        ));
    }

    #[test]
    fn rebuilds_when_the_primary_sampler_identity_changes() {
        let test = make_wgpu_scene3d_state(None);
        let (cached, _sampler, view0, view1) = make_cached(&test);
        let other = create_test_sampler(&test.state);
        assert!(is_wgpu_material_bind_group_rebuild_needed(
            &cached,
            &other,
            &[view0, view1]
        ));
    }

    #[test]
    fn rebuilds_when_any_resolved_view_identity_changes() {
        let test = make_wgpu_scene3d_state(None);
        let (cached, sampler, _view0, view1) = make_cached(&test);
        let other = create_test_view(&test.state);
        assert!(is_wgpu_material_bind_group_rebuild_needed(
            &cached,
            &sampler,
            &[other, view1]
        ));
    }

    #[test]
    fn rebuilds_when_the_resolved_view_count_changes_or_the_cache_has_no_views_yet() {
        let test = make_wgpu_scene3d_state(None);
        let (cached, sampler, view0, _view1) = make_cached(&test);
        assert!(is_wgpu_material_bind_group_rebuild_needed(
            &cached,
            &sampler,
            &[view0.clone()]
        ));
        let no_views = WgpuMaterialBinding {
            bind_group: cached.bind_group.clone(),
            buffer: cached.buffer.clone(),
            samplers: None,
            sampler: None,
            views: None,
        };
        assert!(is_wgpu_material_bind_group_rebuild_needed(
            &no_views,
            &sampler,
            &[view0]
        ));
    }
}

mod is_wgpu_texture_ready {
    use super::*;

    #[test]
    fn is_true_when_the_texture_declares_a_backing_even_before_that_backing_resolves() {
        assert!(!is_wgpu_texture_ready(None));
        assert!(!is_wgpu_texture_ready(
            Some(&create_test_unbacked_texture())
        ));
        assert!(is_wgpu_texture_ready(Some(&create_test_bitmap_texture(
            1, 1
        ))));
    }
}

mod resolve_wgpu_material_texture_view {
    use super::*;

    #[test]
    fn returns_the_shared_placeholder_view_for_a_map_without_an_image_source() {
        let mut test = make_wgpu_scene3d_state(None);
        let placeholder = ensure_wgpu_placeholder_texture_view(&mut test.state);
        assert_eq!(
            resolve_wgpu_material_texture_view(&mut test.state, None),
            placeholder
        );
        assert_eq!(
            resolve_wgpu_material_texture_view(
                &mut test.state,
                Some(&create_test_unbacked_texture())
            ),
            placeholder
        );
    }
}

mod splice_wgpu_color_adjustment_prelude {
    use super::*;

    #[test]
    fn widens_draw_and_injects_only_the_registered_backend_chunk() {
        let feature = make_feature();
        let source = splice_wgpu_color_adjustment_prelude(WGPU_MESH_PRELUDE_WGSL, &feature, None);
        assert!(source.contains(feature.fragment_shader_chunk));
        assert!(source.contains("flightColorScale : vec4f"));
        assert!(source.contains("flightColorBias : vec4f"));
    }

    #[test]
    fn widens_draw_to_five_vec4_fields_for_the_matrix_variant() {
        let feature = make_feature();
        let source =
            splice_wgpu_color_adjustment_prelude(WGPU_MESH_PRELUDE_WGSL, &feature, Some(true));
        assert!(source.contains(feature.matrix_fragment_shader_chunk));
        assert!(source.contains("flightColorMatrix0 : vec4f"));
        assert!(source.contains("flightColorMatrixOffset : vec4f"));
        assert!(!source.contains("flightColorScale : vec4f"));
    }
}

mod stash_wgpu_uv_transform {
    use super::*;

    #[test]
    fn stores_the_column_major_transform_for_a_bound_non_identity_texture() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut texture = create_test_bitmap_texture(1, 1);
        set_texture_uv_scale(&mut texture, 2.0, 3.0);
        set_texture_uv_offset(&mut texture, 0.5, 0.25);

        stash_wgpu_uv_transform(&mut test.state, Some(&texture));

        let stash = get_wgpu_scene3d_runtime(&mut test.state).pending_uv_transform;
        assert_eq!(
            stash.map(|value| value + 0.0),
            [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.5, 0.25, 1.0]
        );
    }

    #[test]
    fn resets_to_identity_for_a_null_texture() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut texture = create_test_bitmap_texture(1, 1);
        set_texture_uv_scale(&mut texture, 4.0, 4.0);
        stash_wgpu_uv_transform(&mut test.state, Some(&texture));

        stash_wgpu_uv_transform(&mut test.state, None);

        assert_eq!(
            get_wgpu_scene3d_runtime(&mut test.state).pending_uv_transform,
            [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
        );
    }

    #[test]
    fn resets_to_identity_for_an_identity_transform_texture() {
        let mut test = make_wgpu_scene3d_state(None);

        stash_wgpu_uv_transform(&mut test.state, Some(&create_test_bitmap_texture(1, 1)));

        assert_eq!(
            get_wgpu_scene3d_runtime(&mut test.state).pending_uv_transform,
            [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
        );
    }
}

mod wgpu_mesh_prelude_wgsl {
    use super::*;

    #[test]
    fn declares_the_shared_frame_and_draw_structs_and_the_vertex_entry() {
        assert!(WGPU_MESH_PRELUDE_WGSL.contains("struct Frame"));
        assert!(WGPU_MESH_PRELUDE_WGSL.contains("struct Draw"));
        assert!(WGPU_MESH_PRELUDE_WGSL.contains("fn vs_main"));
        assert!(!WGPU_MESH_PRELUDE_WGSL.contains("srgbToLinear"));
    }

    #[test]
    fn applies_the_uv_transform_in_the_shared_vertex_stage() {
        assert!(WGPU_MESH_PRELUDE_WGSL.contains("uvTransform : mat3x3f"));
        assert!(WGPU_MESH_PRELUDE_WGSL.contains("draw.uvTransform * vec3f(uv, 1.0)"));
    }
}

mod wgpu_per_map_material_bind_group_needs_rebuild {
    use super::*;

    fn make_cached(
        test: &WgpuScene3DTestState,
    ) -> (
        WgpuMaterialBinding,
        Vec<wgpu::Sampler>,
        Vec<wgpu::TextureView>,
    ) {
        let layout = create_test_per_map_layout(&test.state, 2);
        let buffer = create_test_uniform_buffer(&test.state, 48);
        let samplers = vec![
            create_test_sampler(&test.state),
            create_test_sampler(&test.state),
        ];
        let views = vec![create_test_view(&test.state), create_test_view(&test.state)];
        let bind_group = build_wgpu_per_map_material_bind_group(
            &test.state,
            &layout,
            &buffer,
            &samplers,
            &views,
        );
        let cached = WgpuMaterialBinding {
            bind_group,
            buffer,
            samplers: Some(samplers.clone()),
            sampler: None,
            views: Some(views.clone()),
        };
        return (cached, samplers, views);
    }

    #[test]
    fn keeps_an_unchanged_parallel_sampler_view_cache() {
        let test = make_wgpu_scene3d_state(None);
        let (cached, samplers, views) = make_cached(&test);
        assert!(!wgpu_per_map_material_bind_group_needs_rebuild(
            &cached, &samplers, &views
        ));
    }

    #[test]
    fn rebuilds_when_a_non_primary_sampler_changes() {
        let test = make_wgpu_scene3d_state(None);
        let (cached, mut samplers, views) = make_cached(&test);
        samplers[1] = create_test_sampler(&test.state);
        assert!(wgpu_per_map_material_bind_group_needs_rebuild(
            &cached, &samplers, &views
        ));
    }

    #[test]
    fn rebuilds_for_a_view_change_or_mismatched_array_shape() {
        let test = make_wgpu_scene3d_state(None);
        let (cached, samplers, mut views) = make_cached(&test);
        assert!(wgpu_per_map_material_bind_group_needs_rebuild(
            &cached,
            &samplers[..1],
            &views
        ));
        views[1] = create_test_view(&test.state);
        assert!(wgpu_per_map_material_bind_group_needs_rebuild(
            &cached, &samplers, &views
        ));
    }
}

mod write_wgpu_draw_uniform {
    use super::*;

    #[test]
    fn writes_the_draw_uniform_and_returns_the_dynamic_offset_bind_group() {
        let mut test = make_wgpu_scene3d_state(None);
        let group = write_wgpu_draw_uniform(&mut test.state, &make_test_proxy());
        assert_eq!(
            get_wgpu_scene3d_runtime(&mut test.state).pending_draw_offset,
            0
        );
        assert_eq!(
            get_wgpu_scene3d_runtime(&mut test.state).draw_bind_group,
            Some(group)
        );
    }

    #[test]
    fn folds_the_stashed_uv_transform_into_the_draw_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut texture = create_test_bitmap_texture(1, 1);
        set_texture_uv_scale(&mut texture, 2.0, 3.0);
        stash_wgpu_uv_transform(&mut test.state, Some(&texture));

        write_wgpu_draw_uniform(&mut test.state, &make_test_proxy());

        let u = read_test_draw_uniform(&test.state, 0);
        assert_eq!([u[28], u[29], u[30]], [2.0, 0.0, 0.0]);
        assert_eq!([u[32], u[33], u[34]], [0.0, 3.0, 0.0]);
    }

    // renderWgpuScene3D binds once per material then draws many meshes, so the stash must survive
    // each Draw uniform write.
    #[test]
    fn persists_the_stash_across_draws_so_a_material_shared_by_many_meshes_tiles_every_one() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut texture = create_test_bitmap_texture(1, 1);
        set_texture_uv_scale(&mut texture, 2.0, 3.0);
        stash_wgpu_uv_transform(&mut test.state, Some(&texture));

        write_wgpu_draw_uniform(&mut test.state, &make_test_proxy());
        assert_eq!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .pending_uv_transform
                .map(|value| value + 0.0),
            [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 1.0]
        );

        let second = get_wgpu_render_state_runtime(&test.state).uniform_offset;
        write_wgpu_draw_uniform(&mut test.state, &make_test_proxy());
        let u = read_test_draw_uniform(&test.state, second);
        assert_eq!([u[28], u[33]], [2.0, 3.0]);
    }

    #[test]
    fn writes_the_resolved_object_alpha_into_the_draw_params() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut proxy = make_test_proxy();
        proxy.alpha = Some(0.375);
        write_wgpu_draw_uniform(&mut test.state, &proxy);
        assert!((read_test_draw_uniform(&test.state, 0)[40] - 0.375).abs() < 1e-6);
    }

    #[test]
    fn packs_a_full_color_matrix_into_the_existing_256_byte_draw_slot() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut proxy = make_test_proxy();
        proxy.color_matrix = Some([
            1.0, 0.5, 0.0, 0.0, 0.1, 0.0, 1.0, 0.0, 0.0, 0.2, 0.0, 0.0, 1.0, 0.0, 0.3, 0.0, 0.0,
            0.0, 1.0, 0.4,
        ]);
        write_wgpu_draw_uniform(&mut test.state, &proxy);
        let u = read_test_draw_uniform(&test.state, 0);
        assert_eq!(&u[44..48], &[1.0, 0.5, 0.0, 0.0]);
        assert!((u[60] - 0.1).abs() < 1e-6);
        assert!((u[63] - 0.4).abs() < 1e-6);
    }
}

mod write_wgpu_frame_uniform {
    use super::*;

    #[test]
    fn writes_the_frame_uniform_buffer() {
        let mut test = make_wgpu_scene3d_state(None);
        write_wgpu_frame_uniform(&mut test.state, &make_test_camera(), &make_test_lights());
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn uses_distinct_cached_buffers_for_distinct_light_blocks_so_queued_draws_retain_their_data() {
        let mut test = make_wgpu_scene3d_state(None);
        let camera = make_test_camera();
        let first_lights = make_test_lights();
        let second_lights = make_test_lights();
        write_wgpu_frame_uniform(&mut test.state, &camera, &first_lights);
        let first_buffer = get_wgpu_scene3d_runtime(&mut test.state)
            .frame_buffer
            .clone();
        write_wgpu_frame_uniform(&mut test.state, &camera, &second_lights);
        let second_buffer = get_wgpu_scene3d_runtime(&mut test.state)
            .frame_buffer
            .clone();
        assert_ne!(second_buffer, first_buffer);
        write_wgpu_frame_uniform(&mut test.state, &camera, &first_lights);
        assert_eq!(
            get_wgpu_scene3d_runtime(&mut test.state).frame_buffer,
            first_buffer
        );
    }

    // Ruling 5: the binding cache holds a Weak to each block, so a dropped block's address stays
    // reserved until its entry is pruned; a later block never inherits the dropped block's binding.
    #[test]
    fn never_hands_a_dropped_blocks_binding_to_a_later_block_and_prunes_dead_entries() {
        let mut test = make_wgpu_scene3d_state(None);
        let camera = make_test_camera();
        let first_lights = make_test_lights();
        write_wgpu_frame_uniform(&mut test.state, &camera, &first_lights);
        let first_buffer = get_wgpu_scene3d_runtime(&mut test.state)
            .frame_buffer
            .clone();
        assert_eq!(Arc::strong_count(&first_lights), 1);
        assert_eq!(Arc::weak_count(&first_lights), 1);
        drop(first_lights);

        let second_lights = make_test_lights();
        write_wgpu_frame_uniform(&mut test.state, &camera, &second_lights);
        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        assert_ne!(runtime.frame_buffer, first_buffer);
        assert_eq!(runtime.frame_bindings.len(), 1);
    }

    #[test]
    fn remaps_opengl_clip_space_z_into_webgpu_ndc_depth() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut camera = flight_camera::create_camera_3d();
        camera.near = 1.0;
        camera.far = 11.0;
        let projection = flight_camera::create_orthographic_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.half_height = 1.0;
            projection.half_width = 1.0;
        }
        camera.projection = flight_camera::Projection::Orthographic(projection);
        write_wgpu_frame_uniform(&mut test.state, &camera, &make_test_lights());

        let frame = bytes_to_f32(&test.buffer_writes()[0].data);
        // With identity view, z = -near maps to NDC 0 and z = -far maps to NDC 1.
        let near_clip_z = frame[10] * -camera.near + frame[14];
        let near_clip_w = frame[11] * -camera.near + frame[15];
        let far_clip_z = frame[10] * -camera.far + frame[14];
        let far_clip_w = frame[11] * -camera.far + frame[15];
        assert!((near_clip_z / near_clip_w).abs() < 1e-5);
        assert!((far_clip_z / far_clip_w - 1.0).abs() < 1e-5);
    }
}
