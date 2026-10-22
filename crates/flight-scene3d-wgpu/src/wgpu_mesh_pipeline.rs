// flight-lint: allow-file(contract-vocabulary) D17: the shared mesh pipeline seams take and return native wgpu values
//! The shared mesh-pipeline machinery every mesh-material family routes through (TS
//! `wgpuMeshPipeline.ts`): the shared Frame/Draw layouts and uniforms, the pipeline factory and
//! cache, the per-draw tail, material bindings and texture views, the shadow/IBL sample groups and
//! the shared WGSL prelude.

use flight_camera::{Camera3D, Projection, get_camera_3d_position, get_camera_3d_view_projection_matrix4};
use flight_geometry::{create_matrix3, create_matrix4, create_vector3};
use flight_lighting::{
    MAX_DIRECTIONAL_SHADOW_PCF_RADIUS, MAX_FORWARD_LIGHTS, SCENE_LIGHT_HEMISPHERE_OFFSET,
    SCENE_LIGHT_HEMISPHERE_STRIDE, SCENE_LIGHT_POINT_OFFSET, SCENE_LIGHT_POINT_STRIDE,
    SCENE_LIGHT_SPOT_OFFSET, SCENE_LIGHT_SPOT_STRIDE, Scene3DLightBlock,
};
use flight_materials::{BLEND_MODE_NORMAL, Material3D, MaterialAlphaMode};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuColorAdjustmentMaterialFeature, WgpuNativeDevice, WgpuRenderState, WgpuSkinningAdapter,
    create_wgpu_bind_group, create_wgpu_bind_group_layout, create_wgpu_buffer,
    create_wgpu_pipeline_layout_recorded, create_wgpu_render_pipeline, create_wgpu_texture,
    draw_wgpu_render_pass, draw_wgpu_render_pass_indexed, get_wgpu_blend_state,
    get_wgpu_render_state_device_resources, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut, get_wgpu_sampler,
    record_wgpu_command, resolve_wgpu_texture, set_wgpu_render_pass_bind_group,
    set_wgpu_render_pass_index_buffer, set_wgpu_render_pass_pipeline,
    set_wgpu_render_pass_vertex_buffer, write_wgpu_buffer, write_wgpu_texture,
};
use flight_texture::{
    Texture, TextureFilter, get_texture_uv_matrix, has_texture_source, has_texture_uv_transform,
};

use crate::types::*;
use crate::wgpu_mesh_upload::ensure_wgpu_mesh_upload;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

/// One instance record: the model matrix followed by the linear RGBA tint (TS
/// `INSTANCE_RECORD_FLOATS`).
pub const INSTANCE_RECORD_FLOATS: usize = 20;

const INSTANCE_RECORD_BYTES: u64 = (INSTANCE_RECORD_FLOATS * 4) as u64;

/// The sampleable depth format of the directional shadow map and its 1x1 no-shadow dummy (TS
/// `SHADOW_DEPTH_FORMAT`).
pub const SHADOW_DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;

// The scene pass's depth-stencil format, matching render-wgpu's canvas and effect-target attachment.
pub(crate) const DEPTH_STENCIL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;

// Frame uniform float offsets of the punctual light arrays: the head block (viewProjection +
// cameraPosition + directional + ambient + view) is 48 floats, then point, spot, hemisphere, counts.
const FRAME_POINT_OFFSET: usize = 48;
const FRAME_SPOT_OFFSET: usize = FRAME_POINT_OFFSET + SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
const FRAME_HEMISPHERE_OFFSET: usize =
    FRAME_SPOT_OFFSET + SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
const FRAME_COUNTS_OFFSET: usize =
    FRAME_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;

// Frame uniform: 784 bytes / 196 floats.
const FRAME_UNIFORM_BYTES: u64 = ((FRAME_COUNTS_OFFSET + 4) * 4) as u64;

// Draw uniform: the base 176 bytes, 208 with the affine adjustment and 256 with a full matrix, all
// within one 256-byte ring slot.
const DRAW_UNIFORM_BYTES: u64 = 256;

// Shadow-sample uniform: mat4x4f light matrix + vec4f params = 80 bytes / 20 floats.
const SHADOW_SAMPLE_UNIFORM_BYTES: u64 = 80;

// IBL-sample uniform: vec4f params (enabled, intensity, maxMip) = 16 bytes.
const IBL_SAMPLE_UNIFORM_BYTES: u64 = 16;

// The 1x1 no-IBL dummy cube + LUT format; never sampled (the enabled flag gates them off).
const IBL_DUMMY_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

// Opaque-white 1x1 RGBA pixel for the shared placeholder map texture.
const WHITE_PIXEL: [u8; 4] = [255, 255, 255, 255];

// The identity record a non-instanced draw binds: identity model matrix + opaque white tint.
const IDENTITY_INSTANCE: [f32; 20] = [
    1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0,
    1.0,
];

const VERTEX_ATTRIBUTES: [wgpu::VertexAttribute; 4] = [
    wgpu::VertexAttribute {
        shader_location: 0,
        offset: 0,
        format: wgpu::VertexFormat::Float32x3,
    },
    wgpu::VertexAttribute {
        shader_location: 1,
        offset: 12,
        format: wgpu::VertexFormat::Float32x3,
    },
    wgpu::VertexAttribute {
        shader_location: 2,
        offset: 24,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 3,
        offset: 40,
        format: wgpu::VertexFormat::Float32x2,
    },
];

// The canonical interleaved 48-byte PBR vertex: position @0, normal @12, tangent @24, uv0 @40.
pub(crate) const VERTEX_BUFFER_LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
    array_stride: 48,
    step_mode: wgpu::VertexStepMode::Vertex,
    attributes: &VERTEX_ATTRIBUTES,
};

const INSTANCE_ATTRIBUTES: [wgpu::VertexAttribute; 5] = [
    wgpu::VertexAttribute {
        shader_location: 6,
        offset: 0,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 7,
        offset: 16,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 8,
        offset: 32,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 9,
        offset: 48,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 10,
        offset: 64,
        format: wgpu::VertexFormat::Float32x4,
    },
];

// One instance record per step: the model matrix columns at locations 6..9 and the tint at 10.
pub(crate) const INSTANCE_BUFFER_LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
    array_stride: INSTANCE_RECORD_BYTES,
    step_mode: wgpu::VertexStepMode::Instance,
    attributes: &INSTANCE_ATTRIBUTES,
};

/// Creates a mesh-material pipeline (TS `createWgpuMeshPipeline`).
pub fn create_wgpu_mesh_pipeline(
    state: &mut WgpuRenderState,
    options: &WgpuMeshPipelineOptions,
) -> WgpuMeshPipeline {
    return build_wgpu_mesh_pipeline(state, options, Default::default());
}

/// Builds a family's render pipeline in place (TS `initializeWgpuMeshPipeline`): lays out [shared
/// Frame, shared Draw (or the skin mesh layout), family Material] plus an optional extra, PBR-sample,
/// shadow or IBL group over the canonical vertex and instance layouts. Depth is depth24plus-stencil8
/// compare 'less', depth-write on unless blended; culling is back-face unless double-sided, and a
/// mirrored run flips the front face.
pub fn initialize_wgpu_mesh_pipeline(
    out: &mut WgpuMeshPipeline,
    state: &mut WgpuRenderState,
    options: &WgpuMeshPipelineOptions,
) {
    let runtime = std::mem::take(&mut out.runtime);
    *out = build_wgpu_mesh_pipeline(state, options, runtime);
}

/// Sets the family's pipeline active for the bind-to-draw handoff, binds it, binds the shared Frame
/// group at group(0), and the PBR-sample or shadow group(3) and IBL group(4) its layout carries (TS
/// `beginWgpuMeshDraw`).
pub fn begin_wgpu_mesh_draw(state: &mut WgpuRenderState, pipeline: &WgpuMeshPipeline) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let scene = get_wgpu_scene3d_runtime(state);
    scene.active_mesh_pipeline = Some(pipeline.clone());
    let frame_bind_group = scene
        .frame_bind_group
        .clone()
        .expect("beginWgpuMeshDraw: writeWgpuFrameUniform runs before the pipeline is bound");
    set_wgpu_render_pass_pipeline(state, &pipeline.pipeline);
    set_wgpu_render_pass_bind_group(state, 0, &frame_bind_group, &[]);
    if pipeline.has_pbr_sample_group {
        let group = ensure_wgpu_pbr_sample_bind_group(state);
        set_wgpu_render_pass_bind_group(state, 3, &group, &[]);
    } else if pipeline.has_shadow_group {
        let group = ensure_wgpu_shadow_sample_bind_group(state);
        set_wgpu_render_pass_bind_group(state, 3, &group, &[]);
    }
    if pipeline.has_ibl_group {
        let group = ensure_wgpu_ibl_sample_bind_group(state);
        set_wgpu_render_pass_bind_group(state, 4, &group, &[]);
    }
}

/// Builds a material bind group in the shared classic/PBR entry layout: the uniform buffer at
/// binding 0, the sampler at 1, then each map view at 2 + i (TS `buildWgpuMaterialBindGroup`).
pub fn build_wgpu_material_bind_group(
    state: &WgpuRenderState,
    layout: &wgpu::BindGroupLayout,
    buffer: &wgpu::Buffer,
    sampler: &wgpu::Sampler,
    views: &[wgpu::TextureView],
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let mut entries = vec![
        wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer.as_entire_binding(),
        },
        wgpu::BindGroupEntry {
            binding: 1,
            resource: wgpu::BindingResource::Sampler(sampler),
        },
    ];
    for (index, view) in views.iter().enumerate() {
        entries.push(wgpu::BindGroupEntry {
            binding: 2 + index as u32,
            resource: wgpu::BindingResource::TextureView(view),
        });
    }
    return create_wgpu_bind_group(&native, layout, &entries);
}

fn build_wgpu_mesh_pipeline(
    state: &mut WgpuRenderState,
    options: &WgpuMeshPipelineOptions,
    runtime: flight_entity::EntityRuntimeSlot,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let layouts = ensure_wgpu_scene3d_layouts(state);
    let skinning = get_wgpu_scene3d_runtime(state).skinning_adapter;
    let skinned = options.skinned == Some(true);
    let blended = options.blended == Some(true);
    let scene = get_wgpu_scene3d_runtime(state);
    let blend_mode = if blended {
        Some(
            scene
                .active_blend_mode
                .clone()
                .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string()),
        )
    } else {
        None
    };
    let mirrored = scene.active_mirrored_run;
    let draw_layout = match (skinned, skinning) {
        (true, Some(skinning)) => (skinning.get_mesh_draw_layout)(state),
        _ => layouts.draw_bind_group_layout.clone(),
    };
    let mut bind_group_layouts = vec![
        layouts.frame_bind_group_layout.clone(),
        draw_layout,
        options.material_bind_group_layout.clone(),
    ];
    if let Some(extra) = &options.extra_bind_group_layout {
        bind_group_layouts.push(extra.clone());
    }
    if options.extra_bind_group_layout.is_none() {
        if let Some(pbr_sample) = &options.pbr_sample_bind_group_layout {
            bind_group_layouts.push(pbr_sample.clone());
        } else {
            // Group order is positional: shadow (group 3) then IBL (group 4).
            if let Some(shadow) = &options.shadow_bind_group_layout {
                bind_group_layouts.push(shadow.clone());
            }
            if let Some(ibl) = &options.ibl_bind_group_layout {
                bind_group_layouts.push(ibl.clone());
            }
        }
    }
    let layout = create_wgpu_pipeline_layout_recorded(&native, &bind_group_layouts);
    let mut buffers: Vec<Option<wgpu::VertexBufferLayout<'static>>> = Vec::new();
    match (skinned, skinning) {
        (true, Some(skinning)) => {
            for buffer in skinning.vertex_buffer_layouts {
                buffers.push(Some(buffer.clone()));
            }
        }
        _ => buffers.push(Some(VERTEX_BUFFER_LAYOUT)),
    }
    buffers.push(Some(INSTANCE_BUFFER_LAYOUT));
    let targets = [Some(wgpu::ColorTargetState {
        format: options.format,
        blend: blend_mode.map(|mode| get_wgpu_blend_state(Some(&mode))),
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let pipeline = create_wgpu_render_pipeline(
        &native,
        &wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &options.module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &buffers,
            },
            fragment: Some(wgpu::FragmentState {
                module: &options.module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &targets,
            }),
            primitive: wgpu::PrimitiveState {
                topology: options
                    .topology
                    .unwrap_or(wgpu::PrimitiveTopology::TriangleList),
                // A mirrored world matrix reverses winding; the flip is pipeline state here.
                front_face: if mirrored {
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
                depth_write_enabled: Some(!blended),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        },
    );
    return WgpuMeshPipeline {
        runtime,
        has_ibl_group: options.ibl_bind_group_layout.is_some(),
        has_pbr_sample_group: options.pbr_sample_bind_group_layout.is_some(),
        has_shadow_group: options.shadow_bind_group_layout.is_some(),
        material_bind_group_layout: options.material_bind_group_layout.clone(),
        pipeline,
        skinned,
    };
}

/// Builds a per-map material bind group: the uniform at binding 0, N samplers at 1..N, then the N
/// matching views at N+1..2N (TS `buildWgpuPerMapMaterialBindGroup`).
pub fn build_wgpu_per_map_material_bind_group(
    state: &WgpuRenderState,
    layout: &wgpu::BindGroupLayout,
    buffer: &wgpu::Buffer,
    samplers: &[wgpu::Sampler],
    views: &[wgpu::TextureView],
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let count = views.len();
    let mut entries = vec![wgpu::BindGroupEntry {
        binding: 0,
        resource: buffer.as_entire_binding(),
    }];
    for (index, sampler) in samplers.iter().take(count).enumerate() {
        entries.push(wgpu::BindGroupEntry {
            binding: 1 + index as u32,
            resource: wgpu::BindingResource::Sampler(sampler),
        });
    }
    for (index, view) in views.iter().enumerate() {
        entries.push(wgpu::BindGroupEntry {
            binding: 1 + (count + index) as u32,
            resource: wgpu::BindingResource::TextureView(view),
        });
    }
    return create_wgpu_bind_group(&native, layout, &entries);
}

/// The shared per-draw tail every family's `draw` runs (TS `drawWgpuMeshSubset`): writes the Draw
/// uniform, lazily uploads the geometry, binds the Draw group (or the skinned mesh group) at group(1),
/// the vertex, instance and index buffers, and issues the subset's draw.
pub fn draw_wgpu_mesh_subset(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let Some(active_pipeline) = get_wgpu_scene3d_runtime(state).active_mesh_pipeline.clone() else {
        return;
    };
    let subset = proxy.subset;
    if subset.index_count == 0 {
        return;
    }

    let upload = ensure_wgpu_mesh_upload(state, geometry, Some(active_pipeline.skinned));
    let skinning = get_wgpu_scene3d_runtime(state).skinning_adapter;
    // The mesh path binds the layout carrying BOTH palettes, so it must supply both; both are claimed
    // before the Draw uniform is written, because their arena bases ride in that uniform.
    let skin_draw_bind_group = match (
        active_pipeline.skinned,
        &proxy.joint_matrices,
        &proxy.normal_matrices,
        skinning,
    ) {
        (true, Some(joint_matrices), Some(normal_matrices), Some(skinning)) => {
            // The palettes are passed borrowed so their arena identity is the skeleton's storage.
            let joint_matrices = joint_matrices.read().unwrap();
            let normal_matrices = normal_matrices.read().unwrap();
            Some((skinning.get_mesh_draw_bind_group)(
                state,
                &joint_matrices,
                &normal_matrices,
            ))
        }
        _ => None,
    };
    let draw_bind_group = write_wgpu_draw_uniform(state, proxy);
    let bound_draw_group = skin_draw_bind_group.unwrap_or(draw_bind_group);
    let pending_draw_offset = get_wgpu_scene3d_runtime(state).pending_draw_offset;

    set_wgpu_render_pass_bind_group(state, 1, &bound_draw_group, &[pending_draw_offset]);
    set_wgpu_render_pass_vertex_buffer(state, 0, &upload.vertex_buffer);
    let instance_count = match (&proxy.instance_matrices, proxy.instance_count) {
        (Some(_), Some(count)) if count > 0 => count as u32,
        _ => 1,
    };
    let instance_matrices = match (&proxy.instance_matrices, proxy.instance_count) {
        (Some(matrices), Some(count)) if count > 0 => Some(matrices.as_slice()),
        _ => None,
    };
    let instance_buffer = ensure_wgpu_instance_buffer(state, instance_matrices, instance_count);
    set_wgpu_render_pass_vertex_buffer(state, 1, &instance_buffer);
    // Non-indexed geometry draws the vertex range directly; the subset then addresses vertices.
    match (&upload.index_buffer, upload.index_format) {
        (Some(index_buffer), Some(index_format)) => {
            set_wgpu_render_pass_index_buffer(state, index_buffer, index_format);
            draw_wgpu_render_pass_indexed(
                state,
                subset.index_count,
                instance_count,
                subset.index_offset,
                0,
                0,
            );
        }
        _ => {
            draw_wgpu_render_pass(
                state,
                subset.index_count,
                instance_count,
                subset.index_offset,
                0,
            );
        }
    }
}

/// Resolves the shared Frame bind group, creating it from the shared Frame layout and buffer on
/// first use (TS `ensureWgpuFrameBindGroup`).
pub fn ensure_wgpu_frame_bind_group(state: &mut WgpuRenderState) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let layouts = ensure_wgpu_scene3d_layouts(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.frame_buffer.is_none() {
        scene.frame_buffer = Some(create_wgpu_buffer(
            &native,
            FRAME_UNIFORM_BYTES,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        ));
    }
    if scene.frame_bind_group.is_none() {
        let buffer = scene.frame_buffer.clone().unwrap();
        scene.frame_bind_group = Some(create_wgpu_bind_group(
            &native,
            &layouts.frame_bind_group_layout,
            &[wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer.as_entire_binding(),
            }],
        ));
    }
    return scene.frame_bind_group.clone().unwrap();
}

/// Resolves the shared standalone IBL sample bind group (TS `ensureWgpuIblSampleBindGroup`): lazily
/// creates the IBL uniform, a trilinear sampler and 1x1 dummy cube + LUT textures, rewrites the
/// uniform every call and rebuilds the group only when the bound irradiance view changes.
pub fn ensure_wgpu_ibl_sample_bind_group(state: &mut WgpuRenderState) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    ensure_wgpu_ibl_sample_resources(state, &native);
    let layout = ensure_wgpu_ibl_sample_layout(state);
    let scene = get_wgpu_scene3d_runtime(state);
    write_wgpu_ibl_sample_uniform(scene, &native);

    let ibl = scene.ibl.clone();
    let irradiance_view = match &ibl {
        Some(ibl) => ibl.irradiance_cube_view.clone(),
        None => scene.ibl_dummy_cube_view.clone().unwrap(),
    };
    let prefiltered_view = match &ibl {
        Some(ibl) => ibl.prefiltered_cube_view.clone(),
        None => scene.ibl_dummy_cube_view.clone().unwrap(),
    };
    let brdf_view = match &ibl {
        Some(ibl) => ibl.brdf_lut_view.clone(),
        None => scene.ibl_dummy_lut_view.clone().unwrap(),
    };
    if scene.ibl_sample_bind_group.is_none()
        || scene.ibl_sample_cube_view.as_ref() != Some(&irradiance_view)
    {
        let uniform = scene.ibl_uniform_buffer.clone().unwrap();
        let sampler = scene.ibl_sampler.clone().unwrap();
        scene.ibl_sample_bind_group = Some(create_wgpu_bind_group(
            &native,
            &layout,
            &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform.as_entire_binding(),
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
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        ));
        scene.ibl_sample_cube_view = Some(irradiance_view);
    }
    return scene.ibl_sample_bind_group.clone().unwrap();
}

/// Resolves the shared standalone IBL sample layout (uniform, irradiance cube, prefiltered cube, BRDF
/// LUT, filtering sampler), created once per state (TS `ensureWgpuIblSampleLayout`).
pub fn ensure_wgpu_ibl_sample_layout(state: &mut WgpuRenderState) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.ibl_sample_layout.is_none() {
        scene.ibl_sample_layout = Some(create_wgpu_bind_group_layout(
            &native,
            &[
                uniform_layout_entry(0, wgpu::ShaderStages::FRAGMENT, false),
                texture_layout_entry(1, wgpu::TextureSampleType::Float { filterable: true }, wgpu::TextureViewDimension::Cube),
                texture_layout_entry(2, wgpu::TextureSampleType::Float { filterable: true }, wgpu::TextureViewDimension::Cube),
                texture_layout_entry(3, wgpu::TextureSampleType::Float { filterable: true }, wgpu::TextureViewDimension::D2),
                sampler_layout_entry(4, wgpu::SamplerBindingType::Filtering),
            ],
        ));
    }
    return scene.ibl_sample_layout.clone().unwrap();
}

// The IBL uniform, trilinear sampler and 1x1 dummy cube + LUT the IBL and PBR sample groups share,
// created lazily.
fn ensure_wgpu_ibl_sample_resources(state: &mut WgpuRenderState, native: &WgpuNativeDevice) {
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.ibl_uniform_buffer.is_none() {
        scene.ibl_uniform_buffer = Some(create_wgpu_buffer(
            native,
            IBL_SAMPLE_UNIFORM_BYTES,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        ));
    }
    if scene.ibl_sampler.is_none() {
        // Trilinear so the prefiltered cube's roughness mip chain filters.
        let descriptor = wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..wgpu::SamplerDescriptor::default()
        };
        let sampler = native.device.create_sampler(&descriptor);
        record_wgpu_sampler(native, &sampler, &descriptor);
        scene.ibl_sampler = Some(sampler);
    }
    if scene.ibl_dummy_cube_view.is_none() {
        let cube = create_wgpu_texture(
            native,
            &wgpu::TextureDescriptor {
                label: None,
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
            },
        );
        scene.ibl_dummy_cube_view = Some(cube.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::Cube),
            ..wgpu::TextureViewDescriptor::default()
        }));
        scene.ibl_dummy_cube_texture = Some(cube);
        let lut = create_wgpu_texture(
            native,
            &wgpu::TextureDescriptor {
                label: None,
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
            },
        );
        scene.ibl_dummy_lut_view = Some(lut.create_view(&wgpu::TextureViewDescriptor::default()));
        scene.ibl_dummy_lut_texture = Some(lut);
    }
}

/// Claims a per-draw slot from the frame's instance-buffer pool, sizes it, uploads the instance
/// records (or the identity record) and returns the buffer to bind as the instance-step vertex
/// buffer (TS `ensureWgpuInstanceBuffer`). The slot is per draw, not per state: every instanced draw
/// records into one pass submitted once, so one shared buffer would leave every batch drawing the
/// last one's matrices.
pub fn ensure_wgpu_instance_buffer(
    state: &mut WgpuRenderState,
    matrices: Option<&[f32]>,
    instance_count: u32,
) -> wgpu::Buffer {
    let source: &[f32] = matrices.unwrap_or(&IDENTITY_INSTANCE);
    let required = u64::from(instance_count.max(1)) * INSTANCE_RECORD_BYTES;
    let native = get_wgpu_render_state_native_device(state);
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let cursor = runtime.mesh_instance_buffer_cursor as usize;
    if runtime.mesh_instance_buffer_pool.len() <= cursor {
        runtime
            .mesh_instance_buffer_pool
            .resize_with(cursor + 1, Default::default);
    }
    runtime.mesh_instance_buffer_cursor += 1;
    let slot = &mut runtime.mesh_instance_buffer_pool[cursor];
    if slot.buffer.is_none() || slot.capacity < required {
        // Grown by allocating a replacement and dropping the superseded one: destroying it here could
        // pull a buffer a prior frame's submit still references.
        let capacity = required
            .max(slot.capacity * 2)
            .max(INSTANCE_RECORD_BYTES * 64);
        slot.buffer = Some(create_wgpu_buffer(
            &native,
            capacity,
            wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        ));
        slot.capacity = capacity;
    }
    let buffer = slot.buffer.clone().unwrap();
    let bytes: &[u8] = bytemuck::cast_slice(source);
    write_wgpu_buffer(&native, &buffer, 0, &bytes[..required as usize]);
    return buffer;
}

/// Fetches or creates the per-material binding cached under `key`, rebuilding its bind group only
/// when the primary sampler or a resolved map view differs from the cached set (TS
/// `ensureWgpuMaterialBinding`). The caller writes the uniform buffer afterwards.
pub fn ensure_wgpu_material_binding(
    state: &mut WgpuRenderState,
    key: u64,
    layout: &wgpu::BindGroupLayout,
    uniform_byte_size: u64,
    sampler: &wgpu::Sampler,
    views: &[wgpu::TextureView],
) -> WgpuMaterialBinding {
    let cached = get_wgpu_scene3d_runtime(state)
        .material_bind_groups
        .get(&key)
        .cloned();
    let binding = match cached {
        None => {
            let native = get_wgpu_render_state_native_device(state);
            let buffer = create_wgpu_buffer(
                &native,
                uniform_byte_size,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            WgpuMaterialBinding {
                bind_group: build_wgpu_material_bind_group(state, layout, &buffer, sampler, views),
                buffer,
                samplers: None,
                sampler: Some(sampler.clone()),
                views: Some(views.to_vec()),
            }
        }
        Some(mut binding) => {
            if is_wgpu_material_bind_group_rebuild_needed(&binding, sampler, views) {
                binding.bind_group =
                    build_wgpu_material_bind_group(state, layout, &binding.buffer, sampler, views);
                binding.sampler = Some(sampler.clone());
                binding.views = Some(views.to_vec());
            }
            binding
        }
    };
    get_wgpu_scene3d_runtime(state)
        .material_bind_groups
        .insert(key, binding.clone());
    return binding;
}

/// Resolves the combined PBR sample bind group packing the shadow group and the IBL group into
/// group(3), since WebGPU's required minimum is four bind groups (TS
/// `ensureWgpuPbrSampleBindGroup`).
pub fn ensure_wgpu_pbr_sample_bind_group(state: &mut WgpuRenderState) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    ensure_wgpu_shadow_sample_resources(state, &native);
    ensure_wgpu_ibl_sample_resources(state, &native);
    let layout = ensure_wgpu_pbr_sample_layout(state);
    let scene = get_wgpu_scene3d_runtime(state);
    let shadow = write_wgpu_shadow_sample_uniform(scene, &native);
    write_wgpu_ibl_sample_uniform(scene, &native);

    let ibl = scene.ibl.clone();
    let shadow_view = match &shadow {
        Some(shadow) => shadow.depth_view.clone(),
        None => scene.shadow_dummy_view.clone().unwrap(),
    };
    let irradiance_view = match &ibl {
        Some(ibl) => ibl.irradiance_cube_view.clone(),
        None => scene.ibl_dummy_cube_view.clone().unwrap(),
    };
    let prefiltered_view = match &ibl {
        Some(ibl) => ibl.prefiltered_cube_view.clone(),
        None => scene.ibl_dummy_cube_view.clone().unwrap(),
    };
    let brdf_view = match &ibl {
        Some(ibl) => ibl.brdf_lut_view.clone(),
        None => scene.ibl_dummy_lut_view.clone().unwrap(),
    };
    if scene.pbr_sample_bind_group.is_none()
        || scene.pbr_sample_shadow_view.as_ref() != Some(&shadow_view)
        || scene.pbr_sample_ibl_cube_view.as_ref() != Some(&irradiance_view)
    {
        let shadow_uniform = scene.shadow_uniform_buffer.clone().unwrap();
        let comparison = scene.shadow_comparison_sampler.clone().unwrap();
        let ibl_uniform = scene.ibl_uniform_buffer.clone().unwrap();
        let ibl_sampler = scene.ibl_sampler.clone().unwrap();
        scene.pbr_sample_bind_group = Some(create_wgpu_bind_group(
            &native,
            &layout,
            &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: shadow_uniform.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&shadow_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&comparison),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: ibl_uniform.as_entire_binding(),
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
                    resource: wgpu::BindingResource::Sampler(&ibl_sampler),
                },
            ],
        ));
        scene.pbr_sample_shadow_view = Some(shadow_view);
        scene.pbr_sample_ibl_cube_view = Some(irradiance_view);
    }
    return scene.pbr_sample_bind_group.clone().unwrap();
}

/// Resolves the combined PBR sample layout (shadow uniform, depth map, comparison sampler, IBL
/// uniform, irradiance cube, prefiltered cube, BRDF LUT, filtering sampler) (TS
/// `ensureWgpuPbrSampleLayout`).
pub fn ensure_wgpu_pbr_sample_layout(state: &mut WgpuRenderState) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.pbr_sample_layout.is_none() {
        scene.pbr_sample_layout = Some(create_wgpu_bind_group_layout(
            &native,
            &[
                uniform_layout_entry(0, wgpu::ShaderStages::FRAGMENT, false),
                texture_layout_entry(1, wgpu::TextureSampleType::Depth, wgpu::TextureViewDimension::D2),
                sampler_layout_entry(2, wgpu::SamplerBindingType::Comparison),
                uniform_layout_entry(3, wgpu::ShaderStages::FRAGMENT, false),
                texture_layout_entry(4, wgpu::TextureSampleType::Float { filterable: true }, wgpu::TextureViewDimension::Cube),
                texture_layout_entry(5, wgpu::TextureSampleType::Float { filterable: true }, wgpu::TextureViewDimension::Cube),
                texture_layout_entry(6, wgpu::TextureSampleType::Float { filterable: true }, wgpu::TextureViewDimension::D2),
                sampler_layout_entry(7, wgpu::SamplerBindingType::Filtering),
            ],
        ));
    }
    return scene.pbr_sample_layout.clone().unwrap();
}

/// Fetches or creates the per-map material binding cached under `key` (uniform, one sampler per
/// map, one view per map), rebuilding only when a sampler or view differs (TS
/// `ensureWgpuPerMapMaterialBinding`).
pub fn ensure_wgpu_per_map_material_binding(
    state: &mut WgpuRenderState,
    key: u64,
    layout: &wgpu::BindGroupLayout,
    uniform_byte_size: u64,
    samplers: &[wgpu::Sampler],
    views: &[wgpu::TextureView],
) -> WgpuMaterialBinding {
    let cached = get_wgpu_scene3d_runtime(state)
        .material_bind_groups
        .get(&key)
        .cloned();
    let binding = match cached {
        None => {
            let native = get_wgpu_render_state_native_device(state);
            let buffer = create_wgpu_buffer(
                &native,
                uniform_byte_size,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            WgpuMaterialBinding {
                bind_group: build_wgpu_per_map_material_bind_group(
                    state, layout, &buffer, samplers, views,
                ),
                buffer,
                samplers: Some(samplers.to_vec()),
                sampler: None,
                views: Some(views.to_vec()),
            }
        }
        Some(mut binding) => {
            if wgpu_per_map_material_bind_group_needs_rebuild(&binding, samplers, views) {
                binding.bind_group = build_wgpu_per_map_material_bind_group(
                    state,
                    layout,
                    &binding.buffer,
                    samplers,
                    views,
                );
                binding.samplers = Some(samplers.to_vec());
                binding.views = Some(views.to_vec());
            }
            binding
        }
    };
    get_wgpu_scene3d_runtime(state)
        .material_bind_groups
        .insert(key, binding.clone());
    return binding;
}

/// The one-time opaque-white 1x1 RGBA view bound to a family's map slots in the untextured path (TS
/// `ensureWgpuPlaceholderTextureView`).
pub fn ensure_wgpu_placeholder_texture_view(state: &mut WgpuRenderState) -> wgpu::TextureView {
    let native = get_wgpu_render_state_native_device(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if let Some(view) = &scene.placeholder_view {
        return view.clone();
    }
    let texture = create_wgpu_texture(
        &native,
        &wgpu::TextureDescriptor {
            label: None,
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
        },
    );
    write_wgpu_texture(
        &native,
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
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    scene.placeholder_view = Some(view.clone());
    return view;
}

/// Resolves the shared group(0) Frame and group(1) dynamic-offset Draw layouts, created once per
/// state (TS `ensureWgpuScene3DLayouts`).
pub fn ensure_wgpu_scene3d_layouts(state: &mut WgpuRenderState) -> WgpuScene3DLayouts {
    let native = get_wgpu_render_state_native_device(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.frame_bind_group_layout.is_none() || scene.draw_bind_group_layout.is_none() {
        let both = wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT;
        scene.frame_bind_group_layout = Some(create_wgpu_bind_group_layout(
            &native,
            &[uniform_layout_entry(0, both, false)],
        ));
        scene.draw_bind_group_layout = Some(create_wgpu_bind_group_layout(
            &native,
            &[uniform_layout_entry(0, both, true)],
        ));
    }
    return WgpuScene3DLayouts {
        draw_bind_group_layout: scene.draw_bind_group_layout.clone().unwrap(),
        frame_bind_group_layout: scene.frame_bind_group_layout.clone().unwrap(),
    };
}

/// Resolves a compiled pipeline for a string cache key, compiling it through `compile(state,
/// blended, skinned)` on first use (TS `ensureWgpuScene3DPipeline`). The key is suffixed with the
/// blend equation, skinning and mirroring so immutable state variants compile at most once.
pub fn ensure_wgpu_scene3d_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    compile: &mut dyn FnMut(&mut WgpuRenderState, bool, bool) -> WgpuMeshPipeline,
) -> WgpuMeshPipeline {
    let runtime = get_wgpu_scene3d_runtime(state);
    let blended = runtime.active_blended_run;
    let blend_mode = if blended {
        Some(
            runtime
                .active_blend_mode
                .clone()
                .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string()),
        )
    } else {
        None
    };
    let skinned = runtime.active_skinned_run;
    // Mirroring joins blend and skin in the cache identity because WebGPU fixes frontFace at
    // pipeline creation.
    let mirrored = runtime.active_mirrored_run;
    let variant_key = format!(
        "{}|{}|{}|{}",
        key,
        match &blend_mode {
            None => "opaque".to_string(),
            Some(mode) => format!("blend:{}", mode),
        },
        if skinned { "skin" } else { "rigid" },
        if mirrored { "mirrored" } else { "direct" },
    );
    if let Some(pipeline) = runtime.pipeline_cache.get(&variant_key) {
        return pipeline.clone();
    }
    let pipeline = compile(state, blended, skinned);
    get_wgpu_scene3d_runtime(state)
        .pipeline_cache
        .insert(variant_key, pipeline.clone());
    return pipeline;
}

/// Resolves the shared group(3) shadow-sample bind group (TS `ensureWgpuShadowSampleBindGroup`):
/// lazily creates the shadow uniform, the 'less-equal' comparison sampler and a 1x1 dummy depth
/// texture, rewrites the uniform every call and rebuilds the group only when the bound depth view
/// changes.
pub fn ensure_wgpu_shadow_sample_bind_group(state: &mut WgpuRenderState) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    ensure_wgpu_shadow_sample_resources(state, &native);
    let layout = ensure_wgpu_shadow_sample_layout(state);
    let scene = get_wgpu_scene3d_runtime(state);
    let shadow = write_wgpu_shadow_sample_uniform(scene, &native);
    let view = match &shadow {
        Some(shadow) => shadow.depth_view.clone(),
        None => scene.shadow_dummy_view.clone().unwrap(),
    };
    if scene.shadow_sample_bind_group.is_none() || scene.shadow_sample_view.as_ref() != Some(&view)
    {
        let uniform = scene.shadow_uniform_buffer.clone().unwrap();
        let comparison = scene.shadow_comparison_sampler.clone().unwrap();
        scene.shadow_sample_bind_group = Some(create_wgpu_bind_group(
            &native,
            &layout,
            &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&comparison),
                },
            ],
        ));
        scene.shadow_sample_view = Some(view);
    }
    return scene.shadow_sample_bind_group.clone().unwrap();
}

/// Resolves the shared group(3) shadow-sample layout (uniform, depth texture, comparison sampler),
/// created once per state (TS `ensureWgpuShadowSampleLayout`).
pub fn ensure_wgpu_shadow_sample_layout(state: &mut WgpuRenderState) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.shadow_sample_layout.is_none() {
        scene.shadow_sample_layout = Some(create_wgpu_bind_group_layout(
            &native,
            &[
                uniform_layout_entry(0, wgpu::ShaderStages::FRAGMENT, false),
                texture_layout_entry(1, wgpu::TextureSampleType::Depth, wgpu::TextureViewDimension::D2),
                sampler_layout_entry(2, wgpu::SamplerBindingType::Comparison),
            ],
        ));
    }
    return scene.shadow_sample_layout.clone().unwrap();
}

// The shadow uniform, comparison sampler and 1x1 dummy depth texture the shadow and PBR sample
// groups share, created lazily.
fn ensure_wgpu_shadow_sample_resources(state: &mut WgpuRenderState, native: &WgpuNativeDevice) {
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.shadow_uniform_buffer.is_none() {
        scene.shadow_uniform_buffer = Some(create_wgpu_buffer(
            native,
            SHADOW_SAMPLE_UNIFORM_BYTES,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        ));
    }
    if scene.shadow_comparison_sampler.is_none() {
        let descriptor = wgpu::SamplerDescriptor {
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..wgpu::SamplerDescriptor::default()
        };
        let sampler = native.device.create_sampler(&descriptor);
        record_wgpu_sampler(native, &sampler, &descriptor);
        scene.shadow_comparison_sampler = Some(sampler);
    }
    if scene.shadow_dummy_view.is_none() {
        let texture = create_wgpu_texture(
            native,
            &wgpu::TextureDescriptor {
                label: None,
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
            },
        );
        scene.shadow_dummy_view = Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
        scene.shadow_dummy_texture = Some(texture);
    }
}

/// Selects the one sampler a material bind group uses from its primary map's sampler descriptor
/// (wrap, filters, a mip filter when the map requests a mip chain, anisotropy); a missing primary
/// map falls back to the shared linear clamp sampler (TS `getWgpuMaterialSampler`).
pub fn get_wgpu_material_sampler(state: &WgpuRenderState, texture: Option<&Texture>) -> wgpu::Sampler {
    let Some(texture) = texture else {
        return get_wgpu_render_state_device_resources(state).linear_sampler;
    };
    let sampler = &flight_texture::TextureUvTransform::texture_fields(texture).sampler;
    let min_filter = if is_nearest_filter(sampler.min_filter) {
        wgpu::FilterMode::Nearest
    } else {
        wgpu::FilterMode::Linear
    };
    let mag_filter = if is_nearest_filter(sampler.mag_filter) {
        wgpu::FilterMode::Nearest
    } else {
        wgpu::FilterMode::Linear
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

/// The shared vertex prelude, extended with the skinning adapter's HAS_SKIN variant for a skinned
/// pipeline (TS `getWgpuMeshPreludeWgsl`).
pub fn get_wgpu_mesh_prelude_wgsl(
    skinned: bool,
    skinning: Option<&WgpuSkinningAdapter>,
) -> String {
    return match (skinned, skinning) {
        (true, Some(skinning)) => (skinning.extend_mesh_prelude)(WGPU_MESH_PRELUDE_WGSL),
        _ => WGPU_MESH_PRELUDE_WGSL.to_string(),
    };
}

fn is_nearest_filter(filter: TextureFilter) -> bool {
    return matches!(
        filter,
        TextureFilter::Nearest
            | TextureFilter::NearestMipmapLinear
            | TextureFilter::NearestMipmapNearest
    );
}

/// Whether a cached material binding must rebuild because the primary sampler or a resolved view no
/// longer matches what it was built from (TS `isWgpuMaterialBindGroupRebuildNeeded`).
pub fn is_wgpu_material_bind_group_rebuild_needed(
    binding: &WgpuMaterialBinding,
    sampler: &wgpu::Sampler,
    views: &[wgpu::TextureView],
) -> bool {
    if binding.sampler.as_ref() != Some(sampler) {
        return true;
    }
    let Some(cached) = &binding.views else {
        return true;
    };
    if cached.len() != views.len() {
        return true;
    }
    for (index, view) in views.iter().enumerate() {
        if cached[index] != *view {
            return true;
        }
    }
    return false;
}

// Whether a draw's fragment alpha is coverage the compositor should honor: only alphaMode 'blend'.
fn is_wgpu_mesh_alpha_coverage(material: &dyn Material3D) -> bool {
    return material.material3d_fields().alpha_mode == MaterialAlphaMode::Blend;
}

/// Whether a material map declares a backing (TS `isWgpuTextureReady`).
pub fn is_wgpu_texture_ready(texture: Option<&Texture>) -> bool {
    return texture.is_some_and(|texture| has_texture_source(texture));
}

fn record_wgpu_sampler(
    native: &WgpuNativeDevice,
    sampler: &wgpu::Sampler,
    descriptor: &wgpu::SamplerDescriptor<'_>,
) {
    record_wgpu_command(native, || {
        return flight_render_wgpu::WgpuCommandRecord::CreateSampler(
            flight_render_wgpu::WgpuSamplerRecord {
                address_mode_u: descriptor.address_mode_u,
                address_mode_v: descriptor.address_mode_v,
                anisotropy_clamp: descriptor.anisotropy_clamp,
                mag_filter: descriptor.mag_filter,
                min_filter: descriptor.min_filter,
                mipmap_filter: descriptor.mipmap_filter,
                sampler: sampler.clone(),
            },
        );
    });
}

// Writes the column-major identity mat3 into a uv-transform stash, the untiled default.
fn reset_wgpu_uv_transform_stash(out: &mut [f32; 9]) {
    *out = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
}

/// The view a family binds into a material map slot: the uploaded view when the texture resolves,
/// otherwise the shared 1x1 white placeholder (TS `resolveWgpuMaterialTextureView`).
pub fn resolve_wgpu_material_texture_view(
    state: &mut WgpuRenderState,
    texture: Option<&Texture>,
) -> wgpu::TextureView {
    if let Some(texture) = texture
        && let Some(entry) = resolve_wgpu_texture(state, texture, None, None)
    {
        return entry.read().unwrap().view.clone();
    }
    return ensure_wgpu_placeholder_texture_view(state);
}

fn sampler_layout_entry(binding: u32, kind: wgpu::SamplerBindingType) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(kind),
        count: None,
    };
}

/// Splices the registered color-adjustment chunk and its affine or full-matrix vectors into a
/// promoted Draw uniform (TS `spliceWgpuColorAdjustmentPrelude`).
pub fn splice_wgpu_color_adjustment_prelude(
    source: &str,
    feature: &WgpuColorAdjustmentMaterialFeature,
    matrix: Option<bool>,
) -> String {
    let matrix = matrix.unwrap_or(false);
    let fields = if matrix {
        "  flightColorMatrix0 : vec4f,\n  flightColorMatrix1 : vec4f,\n  flightColorMatrix2 : vec4f,\n  flightColorMatrix3 : vec4f,\n  flightColorMatrixOffset : vec4f,"
    } else {
        "  flightColorScale : vec4f,\n  flightColorBias : vec4f,"
    };
    let chunk = if matrix {
        feature.matrix_fragment_shader_chunk
    } else {
        feature.fragment_shader_chunk
    };
    let anchor = "  params : vec4f,          // x = resolved object alpha, y = alpha-is-coverage flag";
    return format!(
        "{}{}",
        chunk,
        source.replacen(anchor, &format!("{}\n{}", anchor, fields), 1)
    );
}

/// Stashes a material's primary-texture uv transform for the next Draw uniform write (TS
/// `stashWgpuUvTransform`); a missing, unbacked or identity texture leaves the stash at identity.
pub fn stash_wgpu_uv_transform(state: &mut WgpuRenderState, texture: Option<&Texture>) {
    let out = &mut get_wgpu_scene3d_runtime(state).pending_uv_transform;
    let Some(texture) = texture else {
        reset_wgpu_uv_transform_stash(out);
        return;
    };
    if !has_texture_source(texture) || !has_texture_uv_transform(texture) {
        reset_wgpu_uv_transform_stash(out);
        return;
    }
    let mut matrix = create_matrix3();
    get_texture_uv_matrix(&mut matrix, texture);
    out.copy_from_slice(&matrix.m);
}

fn texture_layout_entry(
    binding: u32,
    sample_type: wgpu::TextureSampleType,
    view_dimension: wgpu::TextureViewDimension,
) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type,
            view_dimension,
            multisampled: false,
        },
        count: None,
    };
}

fn uniform_layout_entry(
    binding: u32,
    visibility: wgpu::ShaderStages,
    has_dynamic_offset: bool,
) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset,
            min_binding_size: None,
        },
        count: None,
    };
}

/// Whether a cached per-map binding must rebuild because a sampler or view differs (TS
/// `wgpuPerMapMaterialBindGroupNeedsRebuild`).
pub fn wgpu_per_map_material_bind_group_needs_rebuild(
    binding: &WgpuMaterialBinding,
    samplers: &[wgpu::Sampler],
    views: &[wgpu::TextureView],
) -> bool {
    if samplers.len() != views.len() {
        return true;
    }
    let (Some(cached_samplers), Some(cached_views)) = (&binding.samplers, &binding.views) else {
        return true;
    };
    if cached_samplers.len() != samplers.len() || cached_views.len() != views.len() {
        return true;
    }
    for index in 0..views.len() {
        if cached_samplers[index] != samplers[index] || cached_views[index] != views[index] {
            return true;
        }
    }
    return false;
}

/// Ring-allocates a Draw slot from the state's uniform ring, writes the Draw uniform (world, normal
/// matrix, uv transform, params, the skin arena bases and the optional color adjustment), records
/// the slot offset and returns the shared dynamic-offset Draw bind group (TS `writeWgpuDrawUniform`).
pub fn write_wgpu_draw_uniform(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let layouts = ensure_wgpu_scene3d_layouts(state);
    if get_wgpu_scene3d_runtime(state).draw_bind_group.is_none() {
        let uniform_buffer = get_wgpu_render_state_runtime(state).uniform_buffer.clone();
        let bind_group = create_wgpu_bind_group(
            &native,
            &layouts.draw_bind_group_layout,
            &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer: &uniform_buffer,
                    offset: 0,
                    size: wgpu::BufferSize::new(DRAW_UNIFORM_BYTES),
                }),
            }],
        );
        get_wgpu_scene3d_runtime(state).draw_bind_group = Some(bind_group);
    }

    let alpha_is_coverage = is_wgpu_mesh_alpha_coverage(&*proxy.material.read().unwrap());
    let scene = get_wgpu_scene3d_runtime(state);
    let uv = scene.pending_uv_transform;
    let skin_palette_base = scene.pending_skin_palette_base;
    let skin_normal_palette_base = scene.pending_skin_normal_palette_base;
    // Consuming the arena bases and clearing them is what stops a rigid draw that follows a skinned
    // one from inheriting a base.
    scene.pending_skin_palette_base = 0;
    scene.pending_skin_normal_palette_base = 0;
    let draw_bind_group = scene.draw_bind_group.clone().unwrap();

    let state_runtime = get_wgpu_render_state_runtime_mut(state);
    let offset = state_runtime.uniform_offset;
    let base = (offset / 4) as usize;
    let u = &mut state_runtime.uniform_data;
    let world = &proxy.world_matrix.m;
    u[base..base + 16].copy_from_slice(world);
    // mat3x3f normal matrix: three vec3 columns each padded to vec4 -> floats 16..27.
    let n = &proxy.normal_matrix.m;
    u[base + 16] = n[0];
    u[base + 17] = n[1];
    u[base + 18] = n[2];
    u[base + 19] = 0.0;
    u[base + 20] = n[3];
    u[base + 21] = n[4];
    u[base + 22] = n[5];
    u[base + 23] = 0.0;
    u[base + 24] = n[6];
    u[base + 25] = n[7];
    u[base + 26] = n[8];
    u[base + 27] = 0.0;
    // mat3x3f uv transform (persistent stash, column-major) -> floats 28..39.
    u[base + 28] = uv[0];
    u[base + 29] = uv[1];
    u[base + 30] = uv[2];
    u[base + 31] = 0.0;
    u[base + 32] = uv[3];
    u[base + 33] = uv[4];
    u[base + 34] = uv[5];
    u[base + 35] = 0.0;
    u[base + 36] = uv[6];
    u[base + 37] = uv[7];
    u[base + 38] = uv[8];
    u[base + 39] = 0.0;
    u[base + 40] = proxy.alpha.unwrap_or(1.0);
    // y = whether this draw's fragment alpha is coverage (only alphaMode 'blend').
    u[base + 41] = if alpha_is_coverage { 1.0 } else { 0.0 };
    u[base + 42] = skin_palette_base as f32;
    u[base + 43] = skin_normal_palette_base as f32;

    // The registered adjustment feature reuses the 256-byte Draw slot.
    if let Some(color_matrix) = &proxy.color_matrix {
        for row in 0..4 {
            let source = row * 5;
            let target = base + 44 + row * 4;
            u[target] = color_matrix[source];
            u[target + 1] = color_matrix[source + 1];
            u[target + 2] = color_matrix[source + 2];
            u[target + 3] = color_matrix[source + 3];
            u[base + 60 + row] = color_matrix[source + 4];
        }
    } else if let Some(color_scale_bias) = &proxy.color_scale_bias {
        u[base + 44] = color_scale_bias.red_scale;
        u[base + 45] = color_scale_bias.green_scale;
        u[base + 46] = color_scale_bias.blue_scale;
        u[base + 47] = color_scale_bias.alpha_scale;
        u[base + 48] = color_scale_bias.red_bias;
        u[base + 49] = color_scale_bias.green_bias;
        u[base + 50] = color_scale_bias.blue_bias;
        u[base + 51] = color_scale_bias.alpha_bias;
    }

    state_runtime.uniform_offset += state_runtime.uniform_stride;
    get_wgpu_scene3d_runtime(state).pending_draw_offset = offset;
    return draw_bind_group;
}

/// Writes the per-light-block Frame uniform (WebGPU-depth view-projection, camera position, the
/// directional and ambient lanes, the view matrix and the punctual light arrays) and makes its
/// binding the current Frame alias (TS `writeWgpuFrameUniform`). Distinct light blocks keep distinct
/// buffers until submit, so a later bind cannot rewrite an earlier draw's frame.
pub fn write_wgpu_frame_uniform(
    state: &mut WgpuRenderState,
    camera: &Camera3D,
    lights: &Scene3DLightBlock,
) {
    let native = get_wgpu_render_state_native_device(state);
    let layouts = ensure_wgpu_scene3d_layouts(state);
    // The light block's identity is its packed data allocation (TS: the block object itself).
    let key = lights.data.as_ptr() as usize;
    let scene = get_wgpu_scene3d_runtime(state);
    let binding = match scene.frame_bindings.get(&key) {
        Some(binding) => binding.clone(),
        None => {
            let buffer = create_wgpu_buffer(
                &native,
                FRAME_UNIFORM_BYTES,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            let bind_group = create_wgpu_bind_group(
                &native,
                &layouts.frame_bind_group_layout,
                &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer.as_entire_binding(),
                }],
            );
            let binding = WgpuScene3DFrameBinding { bind_group, buffer };
            scene.frame_bindings.insert(key, binding.clone());
            binding
        }
    };
    scene.frame_buffer = Some(binding.buffer.clone());
    scene.frame_bind_group = Some(binding.bind_group.clone());

    let mut f = vec![0.0_f32; (FRAME_UNIFORM_BYTES / 4) as usize];
    let aspect = match &camera.projection {
        Projection::Perspective(value) => value.read().unwrap().aspect,
        _ => 1.0,
    };
    let mut view_projection = create_matrix4();
    get_camera_3d_view_projection_matrix4(
        &mut view_projection,
        camera,
        if aspect != 0.0 { aspect } else { 1.0 },
    );
    // Camera projections use OpenGL's [-1, 1] NDC z; WebGPU clips z to [0, 1], so left-multiply by
    // the depth correction z' = 0.5z + 0.5w (replacing the z row in column-major storage).
    let source = view_projection.m;
    let mut vp = source;
    vp[2] = 0.5 * (source[2] + source[3]);
    vp[6] = 0.5 * (source[6] + source[7]);
    vp[10] = 0.5 * (source[10] + source[11]);
    vp[14] = 0.5 * (source[14] + source[15]);
    f[..16].copy_from_slice(&vp);

    let mut position = create_vector3(0.0, 0.0, 0.0);
    get_camera_3d_position(&mut position, camera);
    f[16] = position.x;
    f[17] = position.y;
    f[18] = position.z;
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

    // The camera view matrix (floats 32..47), used by matcap.
    let view = camera.view.read().unwrap();
    f[32..48].copy_from_slice(&view.m);

    let point_floats = SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
    f[FRAME_POINT_OFFSET..FRAME_POINT_OFFSET + point_floats]
        .copy_from_slice(&data[SCENE_LIGHT_POINT_OFFSET..SCENE_LIGHT_POINT_OFFSET + point_floats]);
    let spot_floats = SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
    f[FRAME_SPOT_OFFSET..FRAME_SPOT_OFFSET + spot_floats]
        .copy_from_slice(&data[SCENE_LIGHT_SPOT_OFFSET..SCENE_LIGHT_SPOT_OFFSET + spot_floats]);
    let hemisphere_floats = SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;
    f[FRAME_HEMISPHERE_OFFSET..FRAME_HEMISPHERE_OFFSET + hemisphere_floats].copy_from_slice(
        &data[SCENE_LIGHT_HEMISPHERE_OFFSET..SCENE_LIGHT_HEMISPHERE_OFFSET + hemisphere_floats],
    );
    f[FRAME_COUNTS_OFFSET] = lights.point_count as f32;
    f[FRAME_COUNTS_OFFSET + 1] = lights.spot_count as f32;
    f[FRAME_COUNTS_OFFSET + 2] = lights.hemisphere_count as f32;
    f[FRAME_COUNTS_OFFSET + 3] = 0.0;

    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&f));
}

// Writes the IBL sample uniform: x = enabled, y = intensity, z = max mip (roughness 1.0).
fn write_wgpu_ibl_sample_uniform(scene: &mut WgpuScene3DRuntime, native: &WgpuNativeDevice) {
    let values = match &scene.ibl {
        Some(ibl) => [1.0, ibl.intensity, ibl.prefiltered_mip_count as f32 - 1.0, 0.0],
        None => [0.0, 1.0, 0.0, 0.0],
    };
    write_wgpu_buffer(
        native,
        scene.ibl_uniform_buffer.as_ref().unwrap(),
        0,
        bytemuck::cast_slice(&values),
    );
}

// Writes the one shadow uniform shared by the combined PBR sample group and the standalone shadow
// group: the light matrix, then {enabled, pcfRadius, shadowBias, normalBiasWorld}.
fn write_wgpu_shadow_sample_uniform(
    scene: &mut WgpuScene3DRuntime,
    native: &WgpuNativeDevice,
) -> Option<WgpuScene3DShadow> {
    let shadow = scene.shadow.clone();
    let mut values = [0.0_f32; 20];
    match &shadow {
        Some(shadow) => {
            values[..16].copy_from_slice(&shadow.matrix.m);
            values[16] = if shadow.enabled { 1.0 } else { 0.0 };
            values[17] = shadow.pcf_radius;
            values[18] = shadow.shadow_bias;
            values[19] = shadow.normal_bias_world;
        }
        None => {
            values[0] = 1.0;
            values[5] = 1.0;
            values[10] = 1.0;
            values[15] = 1.0;
        }
    }
    write_wgpu_buffer(
        native,
        scene.shadow_uniform_buffer.as_ref().unwrap(),
        0,
        bytemuck::cast_slice(&values),
    );
    return shadow;
}

const _: () = assert!(MAX_DIRECTIONAL_SHADOW_PCF_RADIUS == 2);

/// The shared WGSL prelude every family module prepends after its const-flag block: the Frame and
/// Draw structs and bindings, the vertex output and `vs_main` (TS `WGPU_MESH_PRELUDE_WGSL`).
pub const WGPU_MESH_PRELUDE_WGSL: &str = r#"
const PI : f32 = 3.14159265359;
const MAX_FORWARD_LIGHTS : u32 = 4u;

struct Frame {
  viewProjection : mat4x4f,
  cameraPosition : vec4f,
  lightDirection : vec4f,       // xyz = directional light travel direction; w = directionalCount
  directionalRadiance : vec4f,  // rgb = linear premultiplied radiance
  ambientRadiance : vec4f,      // rgb = linear premultiplied radiance; w = ambientCount
  view : mat4x4f,               // camera view matrix; rotates world normals into view space (matcap)
  // Punctual light arrays — layout mirrors Scene3DLightBlock.data (packScene3DLightBlock).
  //   point[i]      = pointLights[i*2+0]={pos.xyz,range}, [i*2+1]={radiance.rgb,invSqrRange}
  //   spot[i]       = spotLights[i*4+0..1] as point, [i*4+2]={dir.xyz,_}, [i*4+3]={cosInner,cosOuter,_,_}
  //   hemisphere[i] = hemisphereLights[i*3+0]={sky.rgb,_}, [i*3+1]={ground.rgb,_}, [i*3+2]={up.xyz,_}
  pointLights : array<vec4f, 8>,       // MAX_FORWARD_LIGHTS * 2
  spotLights : array<vec4f, 16>,       // MAX_FORWARD_LIGHTS * 4
  hemisphereLights : array<vec4f, 12>, // MAX_FORWARD_LIGHTS * 3
  punctualCounts : vec4f,              // x = pointCount, y = spotCount, z = hemisphereCount
};

struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,   // KHR_texture_transform of the material's primary map (identity when unused)
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
  // The instance transform carries the normal and tangent as well as the position: an instance rotated
  // by its own matrix must light by its ROTATED surface basis, or every instance in a batch shades as
  // though it were still in the batch's bind orientation. Identity for a non-instanced draw (which binds
  // the identity instance record), so this costs those nothing and changes nothing about them. Mirrors
  // scene-gl's mat3(instanceModel) in the HAS_INSTANCES branch of every family.
  let instanceBasis = mat3x3f(instanceModel[0].xyz, instanceModel[1].xyz, instanceModel[2].xyz);
  localPosition = instanceModel * localPosition;
  localNormal = instanceBasis * localNormal;
  localTangent = instanceBasis * localTangent;
  let world = draw.world * localPosition;
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * localNormal;
  // tangent.w is HANDEDNESS, and a model transform that mirrors reverses it: the fragment stage rebuilds
  // the bitangent as w * cross(N, T), so a mirrored instance shades with a flipped frame unless w flips
  // too. normalMatrix is the inverse transpose of the model's upper 3x3, so its determinant is 1/det and
  // carries the same sign. Compared rather than sign()-ed: sign() yields 0 for a singular matrix, and a
  // zero w collapses the bitangent entirely, which is worse than keeping the original hand.
  let tangentHandedness = tangent.w * select(1.0, -1.0, determinant(draw.normalMatrix) < 0.0);
  out.worldTangent = vec4f(draw.normalMatrix * localTangent, tangentHandedness);
  // Apply the material's KHR_texture_transform to the uv. draw.uvTransform is identity for an untiled
  // material (writeWgpuDrawUniform's default), so this is a no-op there — applied unconditionally rather
  // than behind a pipeline const because this vs_main is shared by every family (classic/unlit/toon/
  // matcap/debug/wireframe) and a const would have to thread through all of them; a per-vertex mat3
  // multiply is negligible. The scene-gl mirror gates the equivalent branch via its #ifdef variant.
  out.uv = (draw.uvTransform * vec3f(uv, 1.0)).xy;
  out.objectAlpha = draw.params.x;
  out.instanceColor = instanceTint;
  return out;
}

"#;

/// The directional-shadow PCF sampling shared by the PBR, classic and toon modules (TS
/// `WGPU_DIRECTIONAL_SHADOW_WGSL`); the radius cap is `MAX_DIRECTIONAL_SHADOW_PCF_RADIUS`.
pub const WGPU_DIRECTIONAL_SHADOW_WGSL: &str = r#"
const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS : i32 = 2;

struct Shadow {
  matrix : mat4x4f,
  params : vec4f,
};

@group(3) @binding(0) var<uniform> shadow : Shadow;
@group(3) @binding(1) var shadowMap : texture_depth_2d;
@group(3) @binding(2) var shadowSampler : sampler_comparison;

// Directional shadow factor at a world position. The compile-time radius cap bounds fragment cost;
// radius 0 and 1 take dedicated one-tap and 3x3 paths, while radius 2 takes the bounded 5x5 path.
// Outside the frustum / disabled = lit.
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
"#;
