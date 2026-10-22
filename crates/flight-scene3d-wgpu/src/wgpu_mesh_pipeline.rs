use flight_camera::{
    get_camera_3d_position, get_camera_3d_view_projection_matrix4, Camera3D, Projection,
};
use flight_geometry::{create_matrix3, create_matrix4, create_vector3};
use flight_lighting::{
    Scene3DLightBlock, MAX_FORWARD_LIGHTS, SCENE_LIGHT_HEMISPHERE_OFFSET,
    SCENE_LIGHT_HEMISPHERE_STRIDE, SCENE_LIGHT_POINT_OFFSET, SCENE_LIGHT_POINT_STRIDE,
    SCENE_LIGHT_SPOT_OFFSET, SCENE_LIGHT_SPOT_STRIDE,
};
use flight_materials::material3d::is_material3d_blended;
use flight_materials::BLEND_MODE_NORMAL;
use flight_render_wgpu::{
    get_wgpu_blend_state, get_wgpu_render_state_device_resources,
    get_wgpu_render_state_native_device, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut, get_wgpu_sampler, resolve_wgpu_texture, WgpuRenderState,
};
use flight_texture::{
    get_texture_uv_matrix, has_texture_source, has_texture_uv_transform, TextureFilter,
    TextureVariant,
};

use crate::types::{
    WgpuColorAdjustmentMaterialFeature, WgpuMaterialBinding, WgpuMeshPipeline,
    WgpuScene3DLayouts, WgpuScene3DRenderProxy, WgpuSkinningAdapter,
};
use crate::wgpu_mesh_upload::ensure_wgpu_mesh_upload;
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

pub const INSTANCE_RECORD_FLOATS: usize = 20;
const INSTANCE_RECORD_BYTES: u64 = (INSTANCE_RECORD_FLOATS * 4) as u64;

const DEPTH_STENCIL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;
pub const SHADOW_DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;
const IBL_DUMMY_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const WHITE_PIXEL: [u8; 4] = [255, 255, 255, 255];

const FRAME_POINT_OFFSET: usize = 48;
const FRAME_SPOT_OFFSET: usize = FRAME_POINT_OFFSET + SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
const FRAME_HEMISPHERE_OFFSET: usize =
    FRAME_SPOT_OFFSET + SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
const FRAME_COUNTS_OFFSET: usize =
    FRAME_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;
const FRAME_UNIFORM_BYTES: usize = (FRAME_COUNTS_OFFSET + 4) * 4;
pub const DRAW_UNIFORM_BYTES: u64 = 256;

const SHADOW_SAMPLE_UNIFORM_BYTES: usize = 80;
const IBL_SAMPLE_UNIFORM_BYTES: usize = 16;

#[rustfmt::skip]
const IDENTITY_INSTANCE: [f32; INSTANCE_RECORD_FLOATS] = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
    1.0, 1.0, 1.0, 1.0,
];

pub struct CreateWgpuMeshPipelineOptions<'a> {
    pub blended: bool,
    pub double_sided: bool,
    pub extra_bind_group_layout: Option<&'a wgpu::BindGroupLayout>,
    pub format: wgpu::TextureFormat,
    pub ibl_bind_group_layout: Option<&'a wgpu::BindGroupLayout>,
    pub material_bind_group_layout: &'a wgpu::BindGroupLayout,
    pub module: &'a wgpu::ShaderModule,
    pub pbr_sample_bind_group_layout: Option<&'a wgpu::BindGroupLayout>,
    pub shadow_bind_group_layout: Option<&'a wgpu::BindGroupLayout>,
    pub skinned: bool,
    pub topology: Option<wgpu::PrimitiveTopology>,
}

pub fn create_wgpu_mesh_pipeline(
    state: &WgpuRenderState,
    options: &CreateWgpuMeshPipelineOptions,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let layouts = ensure_wgpu_scene3d_layouts(state);

    let (blend_mode, active_mirrored) = get_wgpu_scene3d_runtime(state, |scene| {
        let bm = if options.blended {
            Some(
                scene
                    .active_blend_mode
                    .clone()
                    .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string()),
            )
        } else {
            None
        };
        (bm, scene.active_mirrored_run)
    });

    let skinning_draw_layout: Option<wgpu::BindGroupLayout> = if options.skinned {
        get_wgpu_scene3d_runtime(state, |scene| {
            scene
                .skinning_adapter
                .as_ref()
                .map(|s| s.get_mesh_draw_layout(state))
        })
    } else {
        None
    };

    let mut bind_group_layouts: Vec<Option<&wgpu::BindGroupLayout>> = vec![
        Some(&layouts.frame_bind_group_layout),
        Some(
            skinning_draw_layout
                .as_ref()
                .unwrap_or(&layouts.draw_bind_group_layout),
        ),
        Some(options.material_bind_group_layout),
    ];
    if let Some(extra) = options.extra_bind_group_layout {
        bind_group_layouts.push(Some(extra));
    } else if let Some(pbr) = options.pbr_sample_bind_group_layout {
        bind_group_layouts.push(Some(pbr));
    } else {
        if let Some(shadow) = options.shadow_bind_group_layout {
            bind_group_layouts.push(Some(shadow));
        }
        if let Some(ibl) = options.ibl_bind_group_layout {
            bind_group_layouts.push(Some(ibl));
        }
    }

    let pipeline_layout =
        native
            .device
            .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: None,
                bind_group_layouts: &bind_group_layouts,
                immediate_size: 0,
            });

    let skinning_vertex_buffers: Option<Vec<wgpu::VertexBufferLayout<'static>>> =
        if options.skinned {
            get_wgpu_scene3d_runtime(state, |scene| {
                scene
                    .skinning_adapter
                    .as_ref()
                    .map(|s| s.vertex_buffer_layouts())
            })
        } else {
            None
        };

    let mut vertex_buffers: Vec<Option<wgpu::VertexBufferLayout<'static>>> =
        skinning_vertex_buffers
            .unwrap_or_else(vertex_buffer_layouts)
            .into_iter()
            .map(Some)
            .collect();
    vertex_buffers.push(Some(instance_buffer_layout()));

    let blend_state = blend_mode
        .as_ref()
        .map(|bm| get_wgpu_blend_state(Some(bm)));

    let pipeline =
        native
            .device
            .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: None,
                layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState {
                    module: options.module,
                    entry_point: Some("vs_main"),
                    buffers: &vertex_buffers,
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: options.module,
                    entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: options.format,
                        blend: blend_state,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: options
                        .topology
                        .unwrap_or(wgpu::PrimitiveTopology::TriangleList),
                    front_face: if active_mirrored {
                        wgpu::FrontFace::Cw
                    } else {
                        wgpu::FrontFace::Ccw
                    },
                    cull_mode: if options.double_sided {
                        None
                    } else {
                        Some(wgpu::Face::Back)
                    },
                    ..wgpu::PrimitiveState::default()
                },
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: DEPTH_STENCIL_FORMAT,
                    depth_write_enabled: Some(!options.blended),
                    depth_compare: Some(wgpu::CompareFunction::Less),
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState::default(),
                }),
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            });

    return WgpuMeshPipeline {
        has_ibl_group: options.ibl_bind_group_layout.is_some(),
        has_pbr_sample_group: options.pbr_sample_bind_group_layout.is_some(),
        has_shadow_group: options.shadow_bind_group_layout.is_some(),
        material_bind_group_layout: options.material_bind_group_layout.clone(),
        pipeline,
        skinned: options.skinned,
    };
}

pub fn begin_wgpu_mesh_draw(state: &WgpuRenderState, pipeline: &WgpuMeshPipeline) {
    {
        let rt = get_wgpu_render_state_runtime(state);
        if rt.render_pass.is_none() {
            return;
        }
    }

    get_wgpu_scene3d_runtime_mut(state, |scene| {
        scene.active_mesh_pipeline = Some(pipeline.clone());
    });

    let frame_bg = get_wgpu_scene3d_runtime(state, |scene| scene.frame_bind_group.clone());

    {
        let rt = unsafe { render_state_runtime_mut(state) };
        let pass = rt.render_pass.as_mut().unwrap();
        pass.set_pipeline(&pipeline.pipeline);
        if let Some(ref bg) = frame_bg {
            pass.set_bind_group(0, bg, &[]);
        }
    }

    if pipeline.has_pbr_sample_group {
        let bg = ensure_wgpu_pbr_sample_bind_group(state);
        let rt = unsafe { render_state_runtime_mut(state) };
        if let Some(ref mut pass) = rt.render_pass {
            pass.set_bind_group(3, &bg, &[]);
        }
    } else if pipeline.has_shadow_group {
        let bg = ensure_wgpu_shadow_sample_bind_group(state);
        let rt = unsafe { render_state_runtime_mut(state) };
        if let Some(ref mut pass) = rt.render_pass {
            pass.set_bind_group(3, &bg, &[]);
        }
    }

    if pipeline.has_ibl_group {
        let bg = ensure_wgpu_ibl_sample_bind_group(state);
        let rt = unsafe { render_state_runtime_mut(state) };
        if let Some(ref mut pass) = rt.render_pass {
            pass.set_bind_group(4, &bg, &[]);
        }
    }
}

pub fn build_wgpu_material_bind_group(
    state: &WgpuRenderState,
    layout: &wgpu::BindGroupLayout,
    buffer: &wgpu::Buffer,
    sampler: &wgpu::Sampler,
    views: &[&wgpu::TextureView],
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let mut entries: Vec<wgpu::BindGroupEntry> = vec![
        wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer.as_entire_binding(),
        },
        wgpu::BindGroupEntry {
            binding: 1,
            resource: wgpu::BindingResource::Sampler(sampler),
        },
    ];
    for (i, view) in views.iter().enumerate() {
        entries.push(wgpu::BindGroupEntry {
            binding: 2 + i as u32,
            resource: wgpu::BindingResource::TextureView(view),
        });
    }
    return native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout,
        entries: &entries,
    });
}

pub fn build_wgpu_per_map_material_bind_group(
    state: &WgpuRenderState,
    layout: &wgpu::BindGroupLayout,
    buffer: &wgpu::Buffer,
    samplers: &[&wgpu::Sampler],
    views: &[&wgpu::TextureView],
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let count = views.len();
    let mut entries: Vec<wgpu::BindGroupEntry> = vec![wgpu::BindGroupEntry {
        binding: 0,
        resource: buffer.as_entire_binding(),
    }];
    for (i, sampler) in samplers.iter().enumerate() {
        entries.push(wgpu::BindGroupEntry {
            binding: 1 + i as u32,
            resource: wgpu::BindingResource::Sampler(sampler),
        });
    }
    for (i, view) in views.iter().enumerate() {
        entries.push(wgpu::BindGroupEntry {
            binding: 1 + count as u32 + i as u32,
            resource: wgpu::BindingResource::TextureView(view),
        });
    }
    return native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout,
        entries: &entries,
    });
}

pub fn draw_wgpu_mesh_subset(
    state: &WgpuRenderState,
    proxy: &WgpuScene3DRenderProxy,
    geometry: &flight_meshgeometry::MeshGeometry,
) {
    {
        let rt = get_wgpu_render_state_runtime(state);
        if rt.render_pass.is_none() {
            return;
        }
    }

    let active_pipeline =
        get_wgpu_scene3d_runtime(state, |scene| scene.active_mesh_pipeline.clone());
    let active_pipeline = match active_pipeline {
        Some(p) => p,
        None => return,
    };

    let subset = &proxy.subset;
    if subset.index_count == 0 {
        return;
    }

    let upload_data = ensure_wgpu_mesh_upload(state, geometry, |upload| {
        (
            upload.vertex_buffer.clone(),
            upload.index_buffer.clone(),
            upload.index_format,
        )
    });

    let (vertex_buffer, index_buffer, index_format) = upload_data;

    let skin_draw_bg = if active_pipeline.skinned
        && proxy.joint_matrices.is_some()
        && proxy.normal_matrices.is_some()
    {
        let (joint, normal) = (
            proxy.joint_matrices.as_ref().unwrap(),
            proxy.normal_matrices.as_ref().unwrap(),
        );
        get_wgpu_scene3d_runtime(state, |scene| {
            scene
                .skinning_adapter
                .as_ref()
                .and_then(|s| s.get_mesh_draw_bind_group(state, joint, normal))
        })
    } else {
        None
    };

    let draw_bg = write_wgpu_draw_uniform(state, proxy);
    let pending_offset =
        get_wgpu_scene3d_runtime(state, |scene| scene.pending_draw_offset as u32);

    let bound_draw_group = skin_draw_bg.as_ref().unwrap_or(&draw_bg);

    let has_instances = proxy.instance_matrices.is_some()
        && proxy.instance_count.is_some()
        && proxy.instance_count.unwrap() > 0;
    let instance_count = if has_instances {
        proxy.instance_count.unwrap()
    } else {
        1
    };

    let instance_source = if has_instances {
        proxy.instance_matrices.as_deref()
    } else {
        None
    };
    let instance_buffer = ensure_wgpu_instance_buffer(state, instance_source, instance_count);

    let rt = unsafe { render_state_runtime_mut(state) };
    let pass = rt.render_pass.as_mut().unwrap();
    pass.set_bind_group(1, bound_draw_group, &[pending_offset]);
    pass.set_vertex_buffer(0, vertex_buffer.slice(..));
    pass.set_vertex_buffer(1, instance_buffer.slice(..));

    if index_buffer.is_none() {
        pass.draw(
            subset.index_offset..(subset.index_offset + subset.index_count),
            0..instance_count,
        );
    } else {
        pass.set_index_buffer(
            index_buffer.as_ref().unwrap().slice(..),
            index_format.unwrap_or(wgpu::IndexFormat::Uint16),
        );
        pass.draw_indexed(
            subset.index_offset..(subset.index_offset + subset.index_count),
            0,
            0..instance_count,
        );
    }
}

fn ensure_ibl_resources_inner(
    scene: &mut crate::types::WgpuScene3DRuntime,
    native: &flight_render_wgpu::WgpuNativeDevice,
) {
    if scene.ibl_uniform_buffer.is_none() {
        scene.ibl_uniform_buffer =
            Some(native.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("scene3d_ibl"),
                size: IBL_SAMPLE_UNIFORM_BYTES as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));
    }
    if scene.ibl_sampler.is_none() {
        scene.ibl_sampler = Some(native.device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..wgpu::SamplerDescriptor::default()
        }));
    }
    if scene.ibl_dummy_cube_view.is_none() {
        let cube_tex = native.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ibl_dummy_cube"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 6,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: IBL_DUMMY_FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        scene.ibl_dummy_cube_view = Some(cube_tex.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::Cube),
            ..wgpu::TextureViewDescriptor::default()
        }));
        scene.ibl_dummy_cube_texture = Some(cube_tex);

        let lut_tex = native.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ibl_dummy_lut"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: IBL_DUMMY_FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        scene.ibl_dummy_lut_view =
            Some(lut_tex.create_view(&wgpu::TextureViewDescriptor::default()));
        scene.ibl_dummy_lut_texture = Some(lut_tex);
    }
}

pub fn ensure_wgpu_frame_bind_group(state: &WgpuRenderState) -> wgpu::BindGroup {
    let layouts = ensure_wgpu_scene3d_layouts(state);
    let native = get_wgpu_render_state_native_device(state);

    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.frame_buffer.is_none() {
            scene.frame_buffer = Some(native.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("scene3d_frame"),
                size: FRAME_UNIFORM_BYTES as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));
        }
        if scene.frame_bind_group.is_none() {
            scene.frame_bind_group =
                Some(native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: None,
                    layout: &layouts.frame_bind_group_layout,
                    entries: &[wgpu::BindGroupEntry {
                        binding: 0,
                        resource: scene.frame_buffer.as_ref().unwrap().as_entire_binding(),
                    }],
                }));
        }
        return scene.frame_bind_group.clone().unwrap();
    });
}

pub fn ensure_wgpu_ibl_sample_bind_group(state: &WgpuRenderState) -> wgpu::BindGroup {
    let layout = ensure_wgpu_ibl_sample_layout(state);
    let native = get_wgpu_render_state_native_device(state);

    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        ensure_ibl_resources_inner(scene, &native);

        let mut u = [0.0f32; 4];
        if let Some(ref ibl) = scene.ibl {
            u[0] = 1.0;
            u[1] = ibl.intensity;
            u[2] = (ibl.prefiltered_mip_count - 1) as f32;
        }
        u[3] = 0.0;
        native.queue.write_buffer(
            scene.ibl_uniform_buffer.as_ref().unwrap(),
            0,
            f32_as_bytes(&u),
        );

        let irradiance_view = scene
            .ibl
            .as_ref()
            .map(|ibl| ibl.irradiance_cube_view.clone())
            .or_else(|| scene.ibl_dummy_cube_view.clone())
            .unwrap();
        let prefiltered_view = scene
            .ibl
            .as_ref()
            .map(|ibl| ibl.prefiltered_cube_view.clone())
            .or_else(|| scene.ibl_dummy_cube_view.clone())
            .unwrap();
        let brdf_view = scene
            .ibl
            .as_ref()
            .map(|ibl| ibl.brdf_lut_view.clone())
            .or_else(|| scene.ibl_dummy_lut_view.clone())
            .unwrap();

        let needs_rebuild = scene.ibl_sample_bind_group.is_none()
            || scene.ibl_sample_cube_view.as_ref() != Some(&irradiance_view);

        if needs_rebuild {
            scene.ibl_sample_bind_group =
                Some(native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: None,
                    layout: &layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: scene
                                .ibl_uniform_buffer
                                .as_ref()
                                .unwrap()
                                .as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::TextureView(&irradiance_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: wgpu::BindingResource::TextureView(&prefiltered_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 3,
                            resource: wgpu::BindingResource::TextureView(&brdf_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 4,
                            resource: wgpu::BindingResource::Sampler(
                                scene.ibl_sampler.as_ref().unwrap(),
                            ),
                        },
                    ],
                }));
            scene.ibl_sample_cube_view = Some(irradiance_view);
        }
        return scene.ibl_sample_bind_group.clone().unwrap();
    });
}

pub fn ensure_wgpu_ibl_sample_layout(state: &WgpuRenderState) -> wgpu::BindGroupLayout {
    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.ibl_sample_layout.is_none() {
            let native = get_wgpu_render_state_native_device(state);
            scene.ibl_sample_layout = Some(native.device.create_bind_group_layout(
                &wgpu::BindGroupLayoutDescriptor {
                    label: None,
                    entries: &[
                        wgpu::BindGroupLayoutEntry {
                            binding: 0,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Buffer {
                                ty: wgpu::BufferBindingType::Uniform,
                                has_dynamic_offset: false,
                                min_binding_size: None,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                                view_dimension: wgpu::TextureViewDimension::Cube,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 2,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                                view_dimension: wgpu::TextureViewDimension::Cube,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 3,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                                view_dimension: wgpu::TextureViewDimension::D2,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 4,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                            count: None,
                        },
                    ],
                },
            ));
        }
        return scene.ibl_sample_layout.clone().unwrap();
    });
}

fn ensure_wgpu_instance_buffer(
    state: &WgpuRenderState,
    matrices: Option<&[f32]>,
    instance_count: u32,
) -> wgpu::Buffer {
    let source = matrices.unwrap_or(&IDENTITY_INSTANCE);
    let required = (1.max(instance_count) as u64) * INSTANCE_RECORD_BYTES;

    let needs_create;
    let cursor;
    {
        let rt = unsafe { render_state_runtime_mut(state) };
        cursor = rt.mesh_instance_buffer_cursor as usize;
        if cursor >= rt.mesh_instance_buffer_pool.len() {
            rt.mesh_instance_buffer_pool.push(Default::default());
        }
        rt.mesh_instance_buffer_cursor += 1;
        let slot = &rt.mesh_instance_buffer_pool[cursor];
        needs_create = slot.buffer.is_none() || slot.capacity < required;
    }

    if needs_create {
        let old_capacity = {
            let rt = get_wgpu_render_state_runtime(state);
            rt.mesh_instance_buffer_pool[cursor].capacity
        };
        let capacity = required.max(old_capacity * 2).max(INSTANCE_RECORD_BYTES * 64);
        let native = get_wgpu_render_state_native_device(state);
        let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: capacity,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let rt = unsafe { render_state_runtime_mut(state) };
        rt.mesh_instance_buffer_pool[cursor].buffer = Some(buffer);
        rt.mesh_instance_buffer_pool[cursor].capacity = capacity;
    }

    let buffer = {
        let rt = get_wgpu_render_state_runtime(state);
        rt.mesh_instance_buffer_pool[cursor]
            .buffer
            .as_ref()
            .unwrap()
            .clone()
    };
    let native = get_wgpu_render_state_native_device(state);
    let byte_len = required.min((source.len() * 4) as u64);
    native.queue.write_buffer(
        &buffer,
        0,
        &f32_as_bytes(source)[..byte_len as usize],
    );
    return buffer;
}

pub fn ensure_wgpu_material_binding(
    state: &WgpuRenderState,
    key: u64,
    layout: &wgpu::BindGroupLayout,
    uniform_byte_size: u64,
    sampler: &wgpu::Sampler,
    views: &[&wgpu::TextureView],
) -> WgpuMaterialBinding {
    let existing = get_wgpu_scene3d_runtime(state, |scene| {
        scene.shaded_material_binding_cache.get(&key).cloned()
    });

    if let Some(binding) = existing {
        if !is_wgpu_material_bind_group_rebuild_needed(&binding, sampler, views) {
            return binding;
        }
        let bind_group =
            build_wgpu_material_bind_group(state, layout, &binding.buffer, sampler, views);
        let updated = WgpuMaterialBinding {
            bind_group,
            buffer: binding.buffer,
            sampler: Some(sampler.clone()),
            samplers: None,
            views: Some(views.iter().map(|v| (*v).clone()).collect()),
        };
        get_wgpu_scene3d_runtime_mut(state, |scene| {
            scene
                .shaded_material_binding_cache
                .insert(key, updated.clone());
        });
        return updated;
    }

    let native = get_wgpu_render_state_native_device(state);
    let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: uniform_byte_size,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind_group = build_wgpu_material_bind_group(state, layout, &buffer, sampler, views);
    let binding = WgpuMaterialBinding {
        bind_group,
        buffer,
        sampler: Some(sampler.clone()),
        samplers: None,
        views: Some(views.iter().map(|v| (*v).clone()).collect()),
    };
    get_wgpu_scene3d_runtime_mut(state, |scene| {
        scene
            .shaded_material_binding_cache
            .insert(key, binding.clone());
    });
    return binding;
}

pub fn ensure_wgpu_pbr_sample_bind_group(state: &WgpuRenderState) -> wgpu::BindGroup {
    let pbr_layout = ensure_wgpu_pbr_sample_layout(state);
    let native = get_wgpu_render_state_native_device(state);

    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.shadow_uniform_buffer.is_none() {
            scene.shadow_uniform_buffer =
                Some(native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("scene3d_shadow"),
                    size: SHADOW_SAMPLE_UNIFORM_BYTES as u64,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                }));
        }
        if scene.shadow_comparison_sampler.is_none() {
            scene.shadow_comparison_sampler =
                Some(native.device.create_sampler(&wgpu::SamplerDescriptor {
                    compare: Some(wgpu::CompareFunction::LessEqual),
                    ..wgpu::SamplerDescriptor::default()
                }));
        }
        if scene.shadow_dummy_view.is_none() {
            let tex = native.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("shadow_dummy"),
                size: wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: SHADOW_DEPTH_FORMAT,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            scene.shadow_dummy_view =
                Some(tex.create_view(&wgpu::TextureViewDescriptor::default()));
            scene.shadow_dummy_texture = Some(tex);
        }

        ensure_ibl_resources_inner(scene, &native);
        write_wgpu_shadow_sample_uniform_inner(scene, &native);

        let mut ibl_u = [0.0f32; 4];
        if let Some(ref ibl) = scene.ibl {
            ibl_u[0] = 1.0;
            ibl_u[1] = ibl.intensity;
            ibl_u[2] = (ibl.prefiltered_mip_count - 1) as f32;
        }
        ibl_u[3] = 0.0;
        native.queue.write_buffer(
            scene.ibl_uniform_buffer.as_ref().unwrap(),
            0,
            f32_as_bytes(&ibl_u),
        );

        let shadow_view = scene
            .shadow
            .as_ref()
            .map(|s| s.depth_view.clone())
            .or_else(|| scene.shadow_dummy_view.clone())
            .unwrap();
        let irradiance_view = scene
            .ibl
            .as_ref()
            .map(|ibl| ibl.irradiance_cube_view.clone())
            .or_else(|| scene.ibl_dummy_cube_view.clone())
            .unwrap();
        let prefiltered_view = scene
            .ibl
            .as_ref()
            .map(|ibl| ibl.prefiltered_cube_view.clone())
            .or_else(|| scene.ibl_dummy_cube_view.clone())
            .unwrap();
        let brdf_view = scene
            .ibl
            .as_ref()
            .map(|ibl| ibl.brdf_lut_view.clone())
            .or_else(|| scene.ibl_dummy_lut_view.clone())
            .unwrap();

        let needs_rebuild = scene.pbr_sample_bind_group.is_none()
            || scene.pbr_sample_shadow_view.as_ref() != Some(&shadow_view)
            || scene.pbr_sample_ibl_cube_view.as_ref() != Some(&irradiance_view);

        if needs_rebuild {
            scene.pbr_sample_bind_group =
                Some(native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: None,
                    layout: &pbr_layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: scene
                                .shadow_uniform_buffer
                                .as_ref()
                                .unwrap()
                                .as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::TextureView(&shadow_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: wgpu::BindingResource::Sampler(
                                scene.shadow_comparison_sampler.as_ref().unwrap(),
                            ),
                        },
                        wgpu::BindGroupEntry {
                            binding: 3,
                            resource: scene
                                .ibl_uniform_buffer
                                .as_ref()
                                .unwrap()
                                .as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 4,
                            resource: wgpu::BindingResource::TextureView(&irradiance_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 5,
                            resource: wgpu::BindingResource::TextureView(&prefiltered_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 6,
                            resource: wgpu::BindingResource::TextureView(&brdf_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 7,
                            resource: wgpu::BindingResource::Sampler(
                                scene.ibl_sampler.as_ref().unwrap(),
                            ),
                        },
                    ],
                }));
            scene.pbr_sample_shadow_view = Some(shadow_view);
            scene.pbr_sample_ibl_cube_view = Some(irradiance_view);
        }
        return scene.pbr_sample_bind_group.clone().unwrap();
    });
}

pub fn ensure_wgpu_pbr_sample_layout(state: &WgpuRenderState) -> wgpu::BindGroupLayout {
    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.pbr_sample_layout.is_none() {
            let native = get_wgpu_render_state_native_device(state);
            scene.pbr_sample_layout = Some(native.device.create_bind_group_layout(
                &wgpu::BindGroupLayoutDescriptor {
                    label: None,
                    entries: &[
                        wgpu::BindGroupLayoutEntry {
                            binding: 0,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Buffer {
                                ty: wgpu::BufferBindingType::Uniform,
                                has_dynamic_offset: false,
                                min_binding_size: None,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Depth,
                                view_dimension: wgpu::TextureViewDimension::D2,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 2,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 3,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Buffer {
                                ty: wgpu::BufferBindingType::Uniform,
                                has_dynamic_offset: false,
                                min_binding_size: None,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 4,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                                view_dimension: wgpu::TextureViewDimension::Cube,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 5,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                                view_dimension: wgpu::TextureViewDimension::Cube,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 6,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                                view_dimension: wgpu::TextureViewDimension::D2,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 7,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                            count: None,
                        },
                    ],
                },
            ));
        }
        return scene.pbr_sample_layout.clone().unwrap();
    });
}

pub fn ensure_wgpu_per_map_material_binding(
    state: &WgpuRenderState,
    key: u64,
    layout: &wgpu::BindGroupLayout,
    uniform_byte_size: u64,
    samplers: &[&wgpu::Sampler],
    views: &[&wgpu::TextureView],
) -> WgpuMaterialBinding {
    let existing = get_wgpu_scene3d_runtime(state, |scene| {
        scene.shaded_material_binding_cache.get(&key).cloned()
    });

    if let Some(binding) = existing {
        if !wgpu_per_map_material_bind_group_needs_rebuild(&binding, samplers, views) {
            return binding;
        }
        let bind_group = build_wgpu_per_map_material_bind_group(
            state,
            layout,
            &binding.buffer,
            samplers,
            views,
        );
        let updated = WgpuMaterialBinding {
            bind_group,
            buffer: binding.buffer,
            sampler: None,
            samplers: Some(samplers.iter().map(|s| (*s).clone()).collect()),
            views: Some(views.iter().map(|v| (*v).clone()).collect()),
        };
        get_wgpu_scene3d_runtime_mut(state, |scene| {
            scene
                .shaded_material_binding_cache
                .insert(key, updated.clone());
        });
        return updated;
    }

    let native = get_wgpu_render_state_native_device(state);
    let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: uniform_byte_size,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind_group =
        build_wgpu_per_map_material_bind_group(state, layout, &buffer, samplers, views);
    let binding = WgpuMaterialBinding {
        bind_group,
        buffer,
        sampler: None,
        samplers: Some(samplers.iter().map(|s| (*s).clone()).collect()),
        views: Some(views.iter().map(|v| (*v).clone()).collect()),
    };
    get_wgpu_scene3d_runtime_mut(state, |scene| {
        scene
            .shaded_material_binding_cache
            .insert(key, binding.clone());
    });
    return binding;
}

pub fn ensure_wgpu_placeholder_texture_view(state: &WgpuRenderState) -> wgpu::TextureView {
    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.placeholder_view.is_none() {
            let native = get_wgpu_render_state_native_device(state);
            let texture = native.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("placeholder_1x1"),
                size: wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            native.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &WHITE_PIXEL,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(4),
                    rows_per_image: None,
                },
                wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
            );
            scene.placeholder_view =
                Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
        }
        return scene.placeholder_view.clone().unwrap();
    });
}

pub fn ensure_wgpu_scene3d_layouts(state: &WgpuRenderState) -> WgpuScene3DLayouts {
    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.frame_bind_group_layout.is_none() || scene.draw_bind_group_layout.is_none() {
            let native = get_wgpu_render_state_native_device(state);
            scene.frame_bind_group_layout = Some(native.device.create_bind_group_layout(
                &wgpu::BindGroupLayoutDescriptor {
                    label: Some("scene3d_frame_layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                },
            ));
            scene.draw_bind_group_layout = Some(native.device.create_bind_group_layout(
                &wgpu::BindGroupLayoutDescriptor {
                    label: Some("scene3d_draw_layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: true,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                },
            ));
        }
        return WgpuScene3DLayouts {
            draw_bind_group_layout: scene.draw_bind_group_layout.clone().unwrap(),
            frame_bind_group_layout: scene.frame_bind_group_layout.clone().unwrap(),
        };
    });
}

pub fn ensure_wgpu_scene3d_pipeline(
    state: &WgpuRenderState,
    key: &str,
    compile: impl FnOnce(bool, bool) -> WgpuMeshPipeline,
) -> WgpuMeshPipeline {
    let (blended, blend_mode, skinned, mirrored) = get_wgpu_scene3d_runtime(state, |rt| {
        (
            rt.active_blended_run,
            if rt.active_blended_run {
                Some(
                    rt.active_blend_mode
                        .clone()
                        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string()),
                )
            } else {
                None
            },
            rt.active_skinned_run,
            rt.active_mirrored_run,
        )
    });

    let blend_label = match blend_mode {
        None => "opaque".to_string(),
        Some(ref bm) => format!("blend:{}", bm),
    };
    let variant_key = format!(
        "{}|{}|{}|{}",
        key,
        blend_label,
        if skinned { "skin" } else { "rigid" },
        if mirrored { "mirrored" } else { "direct" },
    );

    let existing =
        get_wgpu_scene3d_runtime(state, |rt| rt.pipeline_cache.get(&variant_key).cloned());
    if let Some(pipeline) = existing {
        return pipeline;
    }

    let pipeline = compile(blended, skinned);
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.pipeline_cache.insert(variant_key, pipeline.clone());
    });
    return pipeline;
}

pub fn ensure_wgpu_shadow_sample_bind_group(state: &WgpuRenderState) -> wgpu::BindGroup {
    let layout = ensure_wgpu_shadow_sample_layout(state);
    let native = get_wgpu_render_state_native_device(state);

    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.shadow_uniform_buffer.is_none() {
            scene.shadow_uniform_buffer =
                Some(native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("scene3d_shadow"),
                    size: SHADOW_SAMPLE_UNIFORM_BYTES as u64,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                }));
        }
        if scene.shadow_comparison_sampler.is_none() {
            scene.shadow_comparison_sampler =
                Some(native.device.create_sampler(&wgpu::SamplerDescriptor {
                    compare: Some(wgpu::CompareFunction::LessEqual),
                    ..wgpu::SamplerDescriptor::default()
                }));
        }
        if scene.shadow_dummy_view.is_none() {
            let tex = native.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("shadow_dummy"),
                size: wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: SHADOW_DEPTH_FORMAT,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            scene.shadow_dummy_view =
                Some(tex.create_view(&wgpu::TextureViewDescriptor::default()));
            scene.shadow_dummy_texture = Some(tex);
        }

        write_wgpu_shadow_sample_uniform_inner(scene, &native);

        let view = scene
            .shadow
            .as_ref()
            .map(|s| s.depth_view.clone())
            .or_else(|| scene.shadow_dummy_view.clone())
            .unwrap();

        let needs_rebuild = scene.shadow_sample_bind_group.is_none()
            || scene.shadow_sample_view.as_ref() != Some(&view);

        if needs_rebuild {
            scene.shadow_sample_bind_group =
                Some(native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: None,
                    layout: &layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: scene
                                .shadow_uniform_buffer
                                .as_ref()
                                .unwrap()
                                .as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::TextureView(&view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: wgpu::BindingResource::Sampler(
                                scene.shadow_comparison_sampler.as_ref().unwrap(),
                            ),
                        },
                    ],
                }));
            scene.shadow_sample_view = Some(view);
        }
        return scene.shadow_sample_bind_group.clone().unwrap();
    });
}

pub fn ensure_wgpu_shadow_sample_layout(state: &WgpuRenderState) -> wgpu::BindGroupLayout {
    return get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.shadow_sample_layout.is_none() {
            let native = get_wgpu_render_state_native_device(state);
            scene.shadow_sample_layout = Some(native.device.create_bind_group_layout(
                &wgpu::BindGroupLayoutDescriptor {
                    label: None,
                    entries: &[
                        wgpu::BindGroupLayoutEntry {
                            binding: 0,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Buffer {
                                ty: wgpu::BufferBindingType::Uniform,
                                has_dynamic_offset: false,
                                min_binding_size: None,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Depth,
                                view_dimension: wgpu::TextureViewDimension::D2,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 2,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                            count: None,
                        },
                    ],
                },
            ));
        }
        return scene.shadow_sample_layout.clone().unwrap();
    });
}

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn get_wgpu_material_sampler(
    state: &WgpuRenderState,
    texture: Option<&dyn TextureVariant>,
) -> wgpu::Sampler {
    let texture = match texture {
        Some(t) => t,
        None => return get_wgpu_render_state_device_resources(state).linear_sampler.clone(),
    };
    let sampler = &texture.texture_fields().sampler;
    let min_filter = match sampler.min_filter {
        TextureFilter::Nearest
        | TextureFilter::NearestMipmapLinear
        | TextureFilter::NearestMipmapNearest => wgpu::FilterMode::Nearest,
        _ => wgpu::FilterMode::Linear,
    };
    let mag_filter = match sampler.mag_filter {
        TextureFilter::Nearest
        | TextureFilter::NearestMipmapLinear
        | TextureFilter::NearestMipmapNearest => wgpu::FilterMode::Nearest,
        _ => wgpu::FilterMode::Linear,
    };
    let use_mips = sampler.mipmaps
        && sampler.min_filter != TextureFilter::Linear
        && sampler.min_filter != TextureFilter::Nearest;
    let mipmap_filter = if use_mips {
        match sampler.min_filter {
            TextureFilter::LinearMipmapNearest | TextureFilter::NearestMipmapNearest => {
                Some(wgpu::MipmapFilterMode::Nearest)
            }
            _ => Some(wgpu::MipmapFilterMode::Linear),
        }
    } else {
        None
    };
    return get_wgpu_sampler(
        state,
        min_filter,
        mag_filter,
        sampler.wrap_u,
        sampler.wrap_v,
        mipmap_filter,
        Some(sampler.anisotropy),
    );
}

pub fn get_wgpu_mesh_prelude_wgsl(
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    if skinned {
        if let Some(adapter) = skinning {
            return adapter.extend_mesh_prelude(WGPU_MESH_PRELUDE_WGSL);
        }
    }
    return WGPU_MESH_PRELUDE_WGSL.to_string();
}

fn instance_buffer_layout() -> wgpu::VertexBufferLayout<'static> {
    return wgpu::VertexBufferLayout {
        array_stride: INSTANCE_RECORD_BYTES,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: &[
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 0,
                shader_location: 6,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 16,
                shader_location: 7,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 32,
                shader_location: 8,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 48,
                shader_location: 9,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 64,
                shader_location: 10,
            },
        ],
    };
}

pub fn is_wgpu_material_bind_group_rebuild_needed(
    binding: &WgpuMaterialBinding,
    sampler: &wgpu::Sampler,
    views: &[&wgpu::TextureView],
) -> bool {
    if binding.sampler.as_ref() != Some(sampler) {
        return true;
    }
    let cached = match &binding.views {
        Some(v) => v,
        None => return true,
    };
    if cached.len() != views.len() {
        return true;
    }
    for i in 0..views.len() {
        if &cached[i] != views[i] {
            return true;
        }
    }
    return false;
}

pub fn is_wgpu_texture_ready(texture: Option<&dyn TextureVariant>) -> bool {
    match texture {
        Some(t) => has_texture_source(t),
        None => false,
    }
}

// SAFETY: The TS source treats render state as freely mutable through shared references.
// The render pass, uniform ring, and instance buffer pool are single-threaded mutation
// targets that the trait surface exposes only via &WgpuRenderState.
#[allow(invalid_reference_casting)]
unsafe fn render_state_runtime_mut(state: &WgpuRenderState) -> &mut flight_render_wgpu::WgpuRenderStateRuntime {
    unsafe {
        let ptr = state as *const WgpuRenderState as *mut WgpuRenderState;
        return get_wgpu_render_state_runtime_mut(&mut *ptr);
    }
}

fn reset_wgpu_uv_transform_stash(out: &mut Vec<f32>) {
    if out.len() < 9 {
        out.resize(9, 0.0);
    }
    out[0] = 1.0;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = 0.0;
    out[4] = 1.0;
    out[5] = 0.0;
    out[6] = 0.0;
    out[7] = 0.0;
    out[8] = 1.0;
}

pub fn resolve_wgpu_material_texture_view(
    state: &WgpuRenderState,
    texture: Option<&dyn TextureVariant>,
) -> wgpu::TextureView {
    if let Some(tex) = texture {
        // SAFETY: resolve_wgpu_texture requires &mut but the trait surface only exposes &.
        #[allow(invalid_reference_casting)]
        let state_mut = unsafe { &mut *(state as *const WgpuRenderState as *mut WgpuRenderState) };
        let resolved = resolve_wgpu_texture(state_mut, tex, None, None);
        if let Some(entry) = resolved {
            let entry_lock = entry.read().unwrap();
            return entry_lock.view.clone();
        }
    }
    return ensure_wgpu_placeholder_texture_view(state);
}

pub fn splice_wgpu_color_adjustment_prelude(
    source: &str,
    feature: &WgpuColorAdjustmentMaterialFeature,
    matrix: bool,
) -> String {
    let fields = if matrix {
        "  flightColorMatrix0 : vec4f,\n  flightColorMatrix1 : vec4f,\n  flightColorMatrix2 : vec4f,\n  flightColorMatrix3 : vec4f,\n  flightColorMatrixOffset : vec4f,"
    } else {
        "  flightColorScale : vec4f,\n  flightColorBias : vec4f,"
    };
    let chunk = if matrix {
        &feature.matrix_fragment_shader_chunk
    } else {
        &feature.fragment_shader_chunk
    };
    let replaced = source.replace(
        "  params : vec4f,          // x = resolved object alpha, y = alpha-is-coverage flag",
        &format!(
            "  params : vec4f,          // x = resolved object alpha, y = alpha-is-coverage flag\n{}",
            fields
        ),
    );
    return format!("{}{}", chunk, replaced);
}

pub fn stash_wgpu_uv_transform(state: &WgpuRenderState, texture: Option<&dyn TextureVariant>) {
    get_wgpu_scene3d_runtime_mut(state, |scene| {
        let out = &mut scene.pending_uv_transform;
        match texture {
            None => {
                reset_wgpu_uv_transform_stash(out);
            }
            Some(tex) => {
                if !has_texture_uv_transform(tex) {
                    reset_wgpu_uv_transform_stash(out);
                    return;
                }
                let mut scratch = create_matrix3();
                get_texture_uv_matrix(&mut scratch, tex);
                let m = &scratch.m;
                if out.len() < 9 {
                    out.resize(9, 0.0);
                }
                for i in 0..9 {
                    out[i] = m[i];
                }
            }
        }
    });
}

fn vertex_buffer_layouts() -> Vec<wgpu::VertexBufferLayout<'static>> {
    return vec![wgpu::VertexBufferLayout {
        array_stride: 48,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x3,
                offset: 0,
                shader_location: 0,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x3,
                offset: 12,
                shader_location: 1,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 24,
                shader_location: 2,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x2,
                offset: 40,
                shader_location: 3,
            },
        ],
    }];
}

pub fn wgpu_per_map_material_bind_group_needs_rebuild(
    binding: &WgpuMaterialBinding,
    samplers: &[&wgpu::Sampler],
    views: &[&wgpu::TextureView],
) -> bool {
    let cached_samplers = match &binding.samplers {
        Some(s) => s,
        None => return true,
    };
    let cached_views = match &binding.views {
        Some(v) => v,
        None => return true,
    };
    if cached_samplers.len() != samplers.len() || cached_views.len() != views.len() {
        return true;
    }
    for i in 0..views.len() {
        if &cached_samplers[i] != samplers[i] || &cached_views[i] != views[i] {
            return true;
        }
    }
    return false;
}

pub fn write_wgpu_draw_uniform(
    state: &WgpuRenderState,
    proxy: &WgpuScene3DRenderProxy,
) -> wgpu::BindGroup {
    let layouts = ensure_wgpu_scene3d_layouts(state);
    let native = get_wgpu_render_state_native_device(state);

    let draw_bg = get_wgpu_scene3d_runtime_mut(state, |scene| {
        if scene.draw_bind_group.is_none() {
            let rt = get_wgpu_render_state_runtime(state);
            scene.draw_bind_group =
                Some(native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: None,
                    layout: &layouts.draw_bind_group_layout,
                    entries: &[wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                            buffer: &rt.uniform_buffer,
                            offset: 0,
                            size: std::num::NonZero::new(DRAW_UNIFORM_BYTES),
                        }),
                    }],
                }));
        }
        return scene.draw_bind_group.clone().unwrap();
    });

    let rt = unsafe { render_state_runtime_mut(state) };
    let offset = rt.uniform_offset;
    let float_offset = (offset / 4) as usize;

    let world = &proxy.world_matrix.m;
    for i in 0..16 {
        rt.uniform_data[float_offset + i] = world[i];
    }

    let n = &proxy.normal_matrix.m;
    rt.uniform_data[float_offset + 16] = n[0];
    rt.uniform_data[float_offset + 17] = n[1];
    rt.uniform_data[float_offset + 18] = n[2];
    rt.uniform_data[float_offset + 19] = 0.0;
    rt.uniform_data[float_offset + 20] = n[3];
    rt.uniform_data[float_offset + 21] = n[4];
    rt.uniform_data[float_offset + 22] = n[5];
    rt.uniform_data[float_offset + 23] = 0.0;
    rt.uniform_data[float_offset + 24] = n[6];
    rt.uniform_data[float_offset + 25] = n[7];
    rt.uniform_data[float_offset + 26] = n[8];
    rt.uniform_data[float_offset + 27] = 0.0;

    let uv = get_wgpu_scene3d_runtime(state, |scene| scene.pending_uv_transform.clone());
    let rt = unsafe { render_state_runtime_mut(state) };
    if uv.len() >= 9 {
        rt.uniform_data[float_offset + 28] = uv[0];
        rt.uniform_data[float_offset + 29] = uv[1];
        rt.uniform_data[float_offset + 30] = uv[2];
        rt.uniform_data[float_offset + 31] = 0.0;
        rt.uniform_data[float_offset + 32] = uv[3];
        rt.uniform_data[float_offset + 33] = uv[4];
        rt.uniform_data[float_offset + 34] = uv[5];
        rt.uniform_data[float_offset + 35] = 0.0;
        rt.uniform_data[float_offset + 36] = uv[6];
        rt.uniform_data[float_offset + 37] = uv[7];
        rt.uniform_data[float_offset + 38] = uv[8];
        rt.uniform_data[float_offset + 39] = 0.0;
    } else {
        rt.uniform_data[float_offset + 28] = 1.0;
        rt.uniform_data[float_offset + 29] = 0.0;
        rt.uniform_data[float_offset + 30] = 0.0;
        rt.uniform_data[float_offset + 31] = 0.0;
        rt.uniform_data[float_offset + 32] = 0.0;
        rt.uniform_data[float_offset + 33] = 1.0;
        rt.uniform_data[float_offset + 34] = 0.0;
        rt.uniform_data[float_offset + 35] = 0.0;
        rt.uniform_data[float_offset + 36] = 0.0;
        rt.uniform_data[float_offset + 37] = 0.0;
        rt.uniform_data[float_offset + 38] = 1.0;
        rt.uniform_data[float_offset + 39] = 0.0;
    }

    rt.uniform_data[float_offset + 40] = proxy.alpha.unwrap_or(1.0);
    rt.uniform_data[float_offset + 41] = if proxy
        .material
        .as_ref()
        .map(|m| {
            let guard = m.read().unwrap();
            is_material3d_blended(&*guard)
        })
        .unwrap_or(false)
    {
        1.0
    } else {
        0.0
    };

    let (skin_base, skin_normal_base) = get_wgpu_scene3d_runtime_mut(state, |scene| {
        let sb = scene.pending_skin_palette_base;
        let snb = scene.pending_skin_normal_palette_base;
        scene.pending_skin_palette_base = 0;
        scene.pending_skin_normal_palette_base = 0;
        (sb, snb)
    });

    let rt = unsafe { render_state_runtime_mut(state) };
    rt.uniform_data[float_offset + 42] = skin_base as f32;
    rt.uniform_data[float_offset + 43] = skin_normal_base as f32;

    if let Some(ref cm) = proxy.color_matrix {
        for row in 0..4 {
            let source_idx = row * 5;
            let target = float_offset + 44 + row * 4;
            rt.uniform_data[target] = cm[source_idx];
            rt.uniform_data[target + 1] = cm[source_idx + 1];
            rt.uniform_data[target + 2] = cm[source_idx + 2];
            rt.uniform_data[target + 3] = cm[source_idx + 3];
            rt.uniform_data[float_offset + 60 + row] = cm[source_idx + 4];
        }
    } else if let Some(ref csb) = proxy.color_scale_bias {
        rt.uniform_data[float_offset + 44] = csb.red_scale;
        rt.uniform_data[float_offset + 45] = csb.green_scale;
        rt.uniform_data[float_offset + 46] = csb.blue_scale;
        rt.uniform_data[float_offset + 47] = csb.alpha_scale;
        rt.uniform_data[float_offset + 48] = csb.red_bias;
        rt.uniform_data[float_offset + 49] = csb.green_bias;
        rt.uniform_data[float_offset + 50] = csb.blue_bias;
        rt.uniform_data[float_offset + 51] = csb.alpha_bias;
    }

    get_wgpu_scene3d_runtime_mut(state, |scene| {
        scene.pending_draw_offset = offset as u64;
    });
    let rt = unsafe { render_state_runtime_mut(state) };
    rt.uniform_offset += rt.uniform_stride;

    return draw_bg;
}

pub fn write_wgpu_frame_uniform(
    state: &WgpuRenderState,
    camera: &Camera3D,
    lights: &Scene3DLightBlock,
) {
    ensure_wgpu_frame_bind_group(state);

    let mut f = vec![0.0f32; FRAME_UNIFORM_BYTES / 4];

    let aspect = match &camera.projection {
        Projection::Perspective(p) => p.read().unwrap().aspect,
        _ => 1.0,
    };
    let effective_aspect = if aspect != 0.0 { aspect } else { 1.0 };

    let mut scratch_vp = create_matrix4();
    get_camera_3d_view_projection_matrix4(&mut scratch_vp, camera, effective_aspect);

    let source_vp = &scratch_vp.m;
    let mut webgpu_vp = [0.0f32; 16];
    webgpu_vp.copy_from_slice(source_vp);
    webgpu_vp[2] = 0.5 * (source_vp[2] + source_vp[3]);
    webgpu_vp[6] = 0.5 * (source_vp[6] + source_vp[7]);
    webgpu_vp[10] = 0.5 * (source_vp[10] + source_vp[11]);
    webgpu_vp[14] = 0.5 * (source_vp[14] + source_vp[15]);

    for i in 0..16 {
        f[i] = webgpu_vp[i];
    }

    let mut cam_pos = create_vector3(0.0, 0.0, 0.0);
    get_camera_3d_position(&mut cam_pos, camera);
    f[16] = cam_pos.x;
    f[17] = cam_pos.y;
    f[18] = cam_pos.z;
    f[19] = 0.0;

    let data = &lights.data;
    f[20] = data[0];
    f[21] = data[1];
    f[22] = data[2];
    f[23] = lights.directional_count as f32;
    f[24] = data[4];
    f[25] = data[5];
    f[26] = data[6];
    f[27] = 0.0;
    f[28] = data[8];
    f[29] = data[9];
    f[30] = data[10];
    f[31] = lights.ambient_count as f32;

    let view = camera.view.read().unwrap();
    let view_m = &view.m;
    for i in 0..16 {
        f[32 + i] = view_m[i];
    }

    let point_floats = SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
    for i in 0..point_floats {
        f[FRAME_POINT_OFFSET + i] = data[SCENE_LIGHT_POINT_OFFSET + i];
    }

    let spot_floats = SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
    for i in 0..spot_floats {
        f[FRAME_SPOT_OFFSET + i] = data[SCENE_LIGHT_SPOT_OFFSET + i];
    }

    let hemisphere_floats = SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;
    for i in 0..hemisphere_floats {
        f[FRAME_HEMISPHERE_OFFSET + i] = data[SCENE_LIGHT_HEMISPHERE_OFFSET + i];
    }

    f[FRAME_COUNTS_OFFSET] = lights.point_count as f32;
    f[FRAME_COUNTS_OFFSET + 1] = lights.spot_count as f32;
    f[FRAME_COUNTS_OFFSET + 2] = lights.hemisphere_count as f32;
    f[FRAME_COUNTS_OFFSET + 3] = 0.0;

    let native = get_wgpu_render_state_native_device(state);
    get_wgpu_scene3d_runtime(state, |scene| {
        if let Some(ref buffer) = scene.frame_buffer {
            native.queue.write_buffer(buffer, 0, f32_as_bytes(&f));
        }
    });
}

fn write_wgpu_shadow_sample_uniform_inner(
    scene: &mut crate::types::WgpuScene3DRuntime,
    native: &flight_render_wgpu::WgpuNativeDevice,
) {
    let mut values = [0.0f32; 20];
    if let Some(ref shadow) = scene.shadow {
        let m = &shadow.matrix.m;
        for i in 0..16 {
            values[i] = m[i];
        }
        values[16] = if shadow.enabled { 1.0 } else { 0.0 };
        values[17] = shadow.pcf_radius;
        values[18] = shadow.shadow_bias;
        values[19] = shadow.normal_bias_world;
    } else {
        values[0] = 1.0;
        values[5] = 1.0;
        values[10] = 1.0;
        values[15] = 1.0;
    }
    native.queue.write_buffer(
        scene.shadow_uniform_buffer.as_ref().unwrap(),
        0,
        f32_as_bytes(&values),
    );
}

pub const WGPU_MESH_PRELUDE_WGSL: &str = r#"
const PI : f32 = 3.14159265359;
const MAX_FORWARD_LIGHTS : u32 = 4u;

struct Frame {
  viewProjection : mat4x4f,
  cameraPosition : vec4f,
  lightDirection : vec4f,
  directionalRadiance : vec4f,
  ambientRadiance : vec4f,
  view : mat4x4f,
  pointLights : array<vec4f, 8>,
  spotLights : array<vec4f, 16>,
  hemisphereLights : array<vec4f, 12>,
  punctualCounts : vec4f,
};

struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,
  params : vec4f,          // x = resolved object alpha, y = alpha-is-coverage flag
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> draw : Draw;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) worldTangent : vec4f,
  @location(3) uv : vec2f,
  @location(4) @interpolate(flat) objectAlpha : f32,
  @location(5) @interpolate(flat) instanceColor : vec4f,
};

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) tangent : vec4f,
  @location(3) uv : vec2f,
  @location(6) instanceModel0 : vec4f,
  @location(7) instanceModel1 : vec4f,
  @location(8) instanceModel2 : vec4f,
  @location(9) instanceModel3 : vec4f,
  @location(10) instanceTint : vec4f,
) -> VertexOutput {
  var out : VertexOutput;
  var localPosition = vec4f(position, 1.0);
  var localNormal = normal;
  var localTangent = tangent.xyz;
  let instanceModel = mat4x4f(instanceModel0, instanceModel1, instanceModel2, instanceModel3);
  let instanceBasis = mat3x3f(instanceModel[0].xyz, instanceModel[1].xyz, instanceModel[2].xyz);
  localPosition = instanceModel * localPosition;
  localNormal = instanceBasis * localNormal;
  localTangent = instanceBasis * localTangent;
  let world = draw.world * localPosition;
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * localNormal;
  let tangentHandedness = tangent.w * select(1.0, -1.0, determinant(draw.normalMatrix) < 0.0);
  out.worldTangent = vec4f(draw.normalMatrix * localTangent, tangentHandedness);
  out.uv = (draw.uvTransform * vec3f(uv, 1.0)).xy;
  out.objectAlpha = draw.params.x;
  out.instanceColor = instanceTint;
  return out;
}

"#;

pub const WGPU_DIRECTIONAL_SHADOW_WGSL: &str = concat!(
    "const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS : i32 = ",
    "2",
    r#";

struct Shadow {
  matrix : mat4x4f,
  params : vec4f,
};

@group(3) @binding(0) var<uniform> shadow : Shadow;
@group(3) @binding(1) var shadowMap : texture_depth_2d;
@group(3) @binding(2) var shadowSampler : sampler_comparison;

fn compareDirectionalShadow(uv : vec2f, depthRef : f32) -> f32 {
  return textureSampleCompareLevel(shadowMap, shadowSampler, uv, depthRef);
}

fn sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f) -> f32 {
  if (shadow.params.x < 0.5) {
    return 1.0;
  }
  let biasedWorldPos = worldPos + geometricNormal * shadow.params.w;
  let clip = shadow.matrix * vec4f(biasedWorldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
  let depthRef = ndc.z * 0.5 + 0.5 - shadow.params.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || depthRef > 1.0) {
    return 1.0;
  }
  let radius = clamp(i32(shadow.params.y), 0, MAX_DIRECTIONAL_SHADOW_PCF_RADIUS);
  let texel = 1.0 / vec2f(textureDimensions(shadowMap, 0));
  if (radius == 0) {
    return compareDirectionalShadow(uv, depthRef);
  }

  var sum = 0.0;
  if (radius == 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      for (var y = -1; y <= 1; y = y + 1) {
        let offset = vec2f(f32(x), f32(y)) * texel;
        sum = sum + compareDirectionalShadow(uv + offset, depthRef);
      }
    }
    return sum / 9.0;
  }
  for (var x = -MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x <= MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x = x + 1) {
    for (var y = -MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; y <= MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; y = y + 1) {
      let offset = vec2f(f32(x), f32(y)) * texel;
      sum = sum + compareDirectionalShadow(uv + offset, depthRef);
    }
  }
  let diameter = f32(MAX_DIRECTIONAL_SHADOW_PCF_RADIUS * 2 + 1);
  return sum / (diameter * diameter);
}
"#,
);
