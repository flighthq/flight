// flight-lint: allow-file(contract-vocabulary) D17: the particle pass records native wgpu resources and takes the typed 3D pass signature
//! The 3D particle emitter pass (TS `wgpuParticleEmitter3D.ts`), the WGSL mirror of scene3d-gl's
//! particle pass: every enabled ParticleEmitter3D draws as one instanced, camera-facing billboard
//! draw, registered as a render-wgpu 3D pass that `render_wgpu_scene3d` runs after the meshes.

use std::collections::HashMap;
use std::sync::Arc;

use flight_camera::Camera3D;
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightsLike;
use flight_materials::{BLEND_MODE_ADD, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL, BLEND_MODE_SCREEN};
use flight_node::NodeRef;
use flight_node::contract::get_node_world_matrix4;
use flight_particleemitter::{PARTICLE_EMITTER_3D_KIND, ParticleEmitter3D};
use flight_render::{RenderState, prepare_scene_3d_render};
use flight_render_wgpu::{
    WgpuRenderState, WgpuScene3DPass, create_wgpu_bind_group, create_wgpu_bind_group_layout,
    create_wgpu_buffer, create_wgpu_pipeline_layout_recorded, create_wgpu_render_pipeline,
    create_wgpu_shader_module, create_wgpu_texture, draw_wgpu_render_pass_indexed,
    get_wgpu_blend_state, get_wgpu_render_state_device_resources,
    get_wgpu_render_state_native_device, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut, get_wgpu_sampler, resolve_wgpu_texture,
    set_wgpu_render_pass_bind_group, set_wgpu_render_pass_index_buffer,
    set_wgpu_render_pass_pipeline, set_wgpu_render_pass_vertex_buffer, write_wgpu_buffer,
    write_wgpu_texture,
};
use flight_texture::{
    TextureFilter, TextureUvTransform, get_texture_height, get_texture_width, has_texture_source,
};
use flight_textureatlas::TextureAtlasRotation;

use crate::types::{WgpuParticle3DInstanceBuffer, WgpuParticle3DResources};
use crate::wgpu_mesh_pipeline::DEPTH_STENCIL_FORMAT;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

// Per-instance layout (16 floats = 64 bytes), identical to scene3d-gl: [0..2] world position, [3]
// cos(rotation)*scale, [4] sin(rotation)*scale, [5..7] rgb, [8] alpha, [9..12] uvRect, [13..14]
// signed normalized quad size (a negative width marks clockwise packing, a negative height
// counterclockwise), [15] pad.
const INSTANCE_FLOATS: usize = 16;
const INSTANCE_STRIDE: u64 = (INSTANCE_FLOATS * 4) as u64;

const PARTICLE_TRANSFORM_STRIDE: usize = 4;

// Frame uniform: mat4x4f viewProjection + vec4f cameraRight + vec4f cameraUp = 96 bytes.
// HAS_TEXTURE is a pipeline override constant, not a uniform.
const FRAME_UNIFORM_BYTES: u64 = 96;

const WHITE_PIXEL: [u8; 4] = [255, 255, 255, 255];

const CORNER_ATTRIBUTES: [wgpu::VertexAttribute; 1] = [wgpu::VertexAttribute {
    shader_location: 0,
    offset: 0,
    format: wgpu::VertexFormat::Float32x2,
}];

const INSTANCE_ATTRIBUTES: [wgpu::VertexAttribute; 6] = [
    wgpu::VertexAttribute {
        shader_location: 1,
        offset: 0,
        format: wgpu::VertexFormat::Float32x3,
    },
    wgpu::VertexAttribute {
        shader_location: 2,
        offset: 12,
        format: wgpu::VertexFormat::Float32,
    },
    wgpu::VertexAttribute {
        shader_location: 3,
        offset: 16,
        format: wgpu::VertexFormat::Float32,
    },
    wgpu::VertexAttribute {
        shader_location: 4,
        offset: 20,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 5,
        offset: 36,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 6,
        offset: 52,
        format: wgpu::VertexFormat::Float32x2,
    },
];

// The static corner quad (slot 0, per vertex) and the per-particle instance buffer (slot 1).
const VERTEX_BUFFER_LAYOUTS: [Option<wgpu::VertexBufferLayout<'static>>; 2] = [
    Some(wgpu::VertexBufferLayout {
        array_stride: 8,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &CORNER_ATTRIBUTES,
    }),
    Some(wgpu::VertexBufferLayout {
        array_stride: INSTANCE_STRIDE,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: &INSTANCE_ATTRIBUTES,
    }),
];

fn collect_particle_emitter3d_nodes(node: &NodeRef, out: &mut Vec<NodeRef>) {
    let children = {
        let guard = node.read().unwrap();
        if !guard.node_fields().enabled {
            return;
        }
        if guard.node_fields().kind == PARTICLE_EMITTER_3D_KIND {
            out.push(node.clone());
        }
        guard.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for child in &children {
            collect_particle_emitter3d_nodes(child, out);
        }
    }
}

/// Releases the cached particle GPU resources for a state (TS
/// `destroyWgpuParticleEmitter3DResources`); a no-op when none were created.
pub fn destroy_wgpu_particle_emitter3d_resources(state: &mut WgpuRenderState) {
    let scene = get_wgpu_scene3d_runtime(state);
    let Some(resources) = scene.particle_resources.take() else {
        return;
    };
    resources.corner_buffer.destroy();
    resources.index_buffer.destroy();
    resources.frame_buffer.destroy();
    scene.particle_dummy_view = None;
}

fn draw_particle_emitter3d_node(state: &mut WgpuRenderState, node: &NodeRef) {
    let world_matrix =
        get_node_world_matrix4(node, &mut state.render_runtime_mut().node_revisions);
    let guard = node.read().unwrap();
    let Some(emitter) = guard.as_any().downcast_ref::<ParticleEmitter3D>() else {
        return;
    };
    let data = &emitter.data;
    let particle_count = data.particle_count;
    if particle_count == 0 {
        return;
    }

    let atlas = data.atlas.as_ref().map(|atlas| atlas.read().unwrap());
    let atlas_texture = atlas.as_ref().and_then(|atlas| atlas.texture.clone());
    let texture_guard = atlas_texture.as_ref().map(|texture| texture.read().unwrap());
    let texture_entry = match &texture_guard {
        Some(texture) if has_texture_source(&**texture) => {
            resolve_wgpu_texture(state, &**texture, Some(false), None)
        }
        _ => None,
    };
    let has_atlas = texture_entry.is_some();
    let regions = if has_atlas {
        atlas.as_ref().map(|atlas| atlas.regions.clone())
    } else {
        None
    };
    let num_regions = regions.as_ref().map_or(0, |regions| regions.len());
    let (iw, ih) = match (&texture_guard, has_atlas) {
        (Some(texture), true) => (
            1.0 / 1.max(get_texture_width(&**texture)) as f32,
            1.0 / 1.max(get_texture_height(&**texture)) as f32,
        ),
        _ => (0.0, 0.0),
    };

    let wm = world_matrix.m;
    // World-space particles are already baked into world coordinates at spawn.
    let world_space = data.world_space;

    let mut instance_data = std::mem::take(
        &mut get_wgpu_scene3d_runtime(state)
            .particle_resources
            .as_mut()
            .unwrap()
            .instance_data,
    );
    let needed = particle_count * INSTANCE_FLOATS;
    if instance_data.len() < needed {
        let grown = needed.max(instance_data.len() * 2);
        instance_data.resize(grown, 0.0);
    }
    let mut base = 0;
    let mut draw_count = 0_u32;

    for i in 0..particle_count {
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        let lx = data.transforms[tt];
        let ly = data.transforms[tt + 1];
        let rotation = data.transforms[tt + 2];
        let scale = data.transforms[tt + 3];
        let lz = data.positions_z[i];

        let wx = if world_space { lx } else { wm[0] * lx + wm[4] * ly + wm[8] * lz + wm[12] };
        let wy = if world_space { ly } else { wm[1] * lx + wm[5] * ly + wm[9] * lz + wm[13] };
        let wz = if world_space { lz } else { wm[2] * lx + wm[6] * ly + wm[10] * lz + wm[14] };

        let cos_r = rotation.cos() * scale;
        let sin_r = rotation.sin() * scale;

        let ct = i * 3;
        let has_colors = data.colors.len() > ct + 2;
        let r = if has_colors { data.colors[ct] } else { 1.0 };
        let g = if has_colors { data.colors[ct + 1] } else { 1.0 };
        let b = if has_colors { data.colors[ct + 2] } else { 1.0 };

        let mut u0 = 0.0;
        let mut v0 = 0.0;
        let mut u1 = 1.0;
        let mut v1 = 1.0;
        let mut region_w = 1.0;
        let mut region_h = 1.0;
        let mut rotated = false;
        let mut counterclockwise = false;

        if let Some(regions) = &regions {
            let id = data.ids[i] as usize;
            if id >= num_regions {
                continue;
            }
            let region = regions[id].read().unwrap();
            if region.width <= 0.0 || region.height <= 0.0 {
                continue;
            }
            u0 = region.x * iw;
            v0 = region.y * ih;
            u1 = (region.x + region.width) * iw;
            v1 = (region.y + region.height) * ih;
            rotated = region.rotation != TextureAtlasRotation::None;
            counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
            region_w = if rotated { region.height } else { region.width };
            region_h = if rotated { region.width } else { region.height };
        }

        instance_data[base] = wx;
        instance_data[base + 1] = wy;
        instance_data[base + 2] = wz;
        instance_data[base + 3] = cos_r;
        instance_data[base + 4] = sin_r;
        instance_data[base + 5] = r;
        instance_data[base + 6] = g;
        instance_data[base + 7] = b;
        instance_data[base + 8] = data.alphas[i];
        instance_data[base + 9] = u0;
        instance_data[base + 10] = v0;
        instance_data[base + 11] = u1;
        instance_data[base + 12] = v1;
        // The region's pixel size sets the billboard aspect ratio, not its world size: normalize so
        // the larger axis is 1.
        let max_dim = if region_w >= region_h { region_w } else { region_h };
        instance_data[base + 13] =
            (if rotated && !counterclockwise { -region_w } else { region_w }) / max_dim;
        instance_data[base + 14] =
            (if rotated && counterclockwise { -region_h } else { region_h }) / max_dim;
        instance_data[base + 15] = 0.0;
        base += INSTANCE_FLOATS;
        draw_count += 1;
    }

    if draw_count == 0 {
        restore_instance_data(state, instance_data);
        return;
    }

    let emitter_key = get_entity_id(&*guard);
    let instance_buffer = ensure_particle3d_instance_buffer(state, emitter_key, draw_count);
    let native = get_wgpu_render_state_native_device(state);
    write_wgpu_buffer(
        &native,
        &instance_buffer,
        0,
        bytemuck::cast_slice(&instance_data[..draw_count as usize * INSTANCE_FLOATS]),
    );
    restore_instance_data(state, instance_data);

    // The group(1) texture + sampler: the atlas view for the textured pipeline, a 1x1 white dummy
    // (never sampled) for the untextured one.
    let texture_view = match &texture_entry {
        Some(entry) => entry.read().unwrap().view.clone(),
        None => ensure_dummy_texture_view(state),
    };
    let sampler = match &texture_guard {
        Some(texture) => {
            let sampler = &texture.texture_fields().sampler;
            get_wgpu_sampler(
                state,
                filter_mode(sampler.min_filter),
                filter_mode(sampler.mag_filter),
                sampler.wrap_u,
                sampler.wrap_v,
                mipmap_filter(sampler.mipmaps, sampler.min_filter),
                Some(sampler.anisotropy),
            )
        }
        None => get_wgpu_render_state_device_resources(state).linear_sampler,
    };
    let resources = get_wgpu_scene3d_runtime(state)
        .particle_resources
        .clone()
        .unwrap();
    let texture_bind_group = create_wgpu_bind_group(
        &native,
        &resources.texture_layout,
        &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&texture_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    );

    let blend_mode = emitter.blend_mode.clone();
    drop(texture_guard);
    drop(atlas);
    drop(guard);
    let pipeline = ensure_particle3d_pipeline(state, &resources, blend_mode.as_deref(), has_atlas);
    set_wgpu_render_pass_pipeline(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 0, &resources.frame_bind_group, &[]);
    set_wgpu_render_pass_bind_group(state, 1, &texture_bind_group, &[]);
    set_wgpu_render_pass_vertex_buffer(state, 0, &resources.corner_buffer);
    set_wgpu_render_pass_vertex_buffer(state, 1, &instance_buffer);
    set_wgpu_render_pass_index_buffer(state, &resources.index_buffer, wgpu::IndexFormat::Uint16);
    draw_wgpu_render_pass_indexed(state, 6, draw_count, 0, 0, 0);
}

/// Draws every enabled ParticleEmitter3D under `scene` into the open pass, one instanced indexed
/// draw per emitter (TS `drawWgpuScene3DParticleEmitter3Ds`), the 3D pass the registry runs.
pub fn draw_wgpu_scene3d_particle_emitter3_ds(
    state: &mut WgpuRenderState,
    scene: &NodeRef,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
) {
    let mut emitters = Vec::new();
    collect_particle_emitter3d_nodes(scene, &mut emitters);
    if emitters.is_empty() {
        return;
    }
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let view_projection = prepare_scene_3d_render(state, scene, camera, lights, None)
        .view_projection
        .m;
    let resources = ensure_particle3d_resources(state);

    // The frame uniform: view-projection plus the camera right/up axes from the view matrix rows,
    // written once for every emitter this call.
    let mut f = [0.0_f32; (FRAME_UNIFORM_BYTES / 4) as usize];
    f[..16].copy_from_slice(&view_projection);
    let vm = camera.view.read().unwrap().m;
    f[16] = vm[0];
    f[17] = vm[4];
    f[18] = vm[8];
    f[20] = vm[1];
    f[21] = vm[5];
    f[22] = vm[9];
    let native = get_wgpu_render_state_native_device(state);
    write_wgpu_buffer(&native, &resources.frame_buffer, 0, bytemuck::cast_slice(&f));

    for emitter in &emitters {
        draw_particle_emitter3d_node(state, emitter);
    }
}

// A 1x1 opaque-white texture bound to the untextured variant's unused slot, cached per state.
fn ensure_dummy_texture_view(state: &mut WgpuRenderState) -> wgpu::TextureView {
    if let Some(view) = &get_wgpu_scene3d_runtime(state).particle_dummy_view {
        return view.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
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
        texture.as_image_copy(),
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
    get_wgpu_scene3d_runtime(state).particle_dummy_view = Some(view.clone());
    return view;
}

fn ensure_particle3d_instance_buffer(
    state: &mut WgpuRenderState,
    emitter_key: u64,
    count: u32,
) -> wgpu::Buffer {
    let native = get_wgpu_render_state_native_device(state);
    let resources = get_wgpu_scene3d_runtime(state)
        .particle_resources
        .as_mut()
        .unwrap();
    let entry = resources.instance_buffers.get(&emitter_key);
    if let Some(entry) = entry
        && entry.capacity >= count
    {
        return entry.buffer.clone();
    }
    let previous_capacity = match entry {
        Some(entry) => {
            entry.buffer.destroy();
            entry.capacity * 2
        }
        None => 8,
    };
    let capacity = count.max(previous_capacity);
    let buffer = create_wgpu_buffer(
        &native,
        u64::from(capacity) * INSTANCE_STRIDE,
        wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
    );
    resources.instance_buffers.insert(
        emitter_key,
        WgpuParticle3DInstanceBuffer {
            buffer: buffer.clone(),
            capacity,
        },
    );
    return buffer;
}

// Resolves the pipeline for a (blend mode, textured) variant once per variant and color format;
// HAS_TEXTURE is a pipeline override constant. Depth test on, depth write off.
fn ensure_particle3d_pipeline(
    state: &mut WgpuRenderState,
    resources: &WgpuParticle3DResources,
    mode: Option<&str>,
    has_texture: bool,
) -> wgpu::RenderPipeline {
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let key = format!(
        "{:?}|{}|{}",
        format,
        mode.unwrap_or("normal"),
        if has_texture { "t" } else { "u" }
    );
    if let Some(pipeline) = get_wgpu_scene3d_runtime(state)
        .particle_resources
        .as_ref()
        .unwrap()
        .pipelines
        .get(&key)
    {
        return pipeline.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let constants = [("HAS_TEXTURE", if has_texture { 1.0 } else { 0.0 })];
    let targets = [Some(wgpu::ColorTargetState {
        format,
        blend: Some(wgpu_particle_blend_state(mode)),
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let pipeline = create_wgpu_render_pipeline(
        &native,
        &wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&resources.pipeline_layout),
            vertex: wgpu::VertexState {
                module: &resources.module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &VERTEX_BUFFER_LAYOUTS,
            },
            fragment: Some(wgpu::FragmentState {
                module: &resources.module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions {
                    constants: &constants,
                    ..wgpu::PipelineCompilationOptions::default()
                },
                targets: &targets,
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                ..wgpu::PrimitiveState::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH_STENCIL_FORMAT,
                depth_write_enabled: Some(false),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        },
    );
    get_wgpu_scene3d_runtime(state)
        .particle_resources
        .as_mut()
        .unwrap()
        .pipelines
        .insert(key, pipeline.clone());
    return pipeline;
}

fn ensure_particle3d_resources(state: &mut WgpuRenderState) -> WgpuParticle3DResources {
    if let Some(resources) = &get_wgpu_scene3d_runtime(state).particle_resources {
        return resources.clone();
    }
    let native = get_wgpu_render_state_native_device(state);

    let corner_buffer = create_wgpu_buffer(
        &native,
        8 * 4,
        wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
    );
    let corners: [f32; 8] = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
    write_wgpu_buffer(&native, &corner_buffer, 0, bytemuck::cast_slice(&corners));

    let index_buffer = create_wgpu_buffer(
        &native,
        6 * 2,
        wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
    );
    let indices: [u16; 6] = [0, 1, 2, 0, 2, 3];
    write_wgpu_buffer(&native, &index_buffer, 0, bytemuck::cast_slice(&indices));

    let frame_layout = create_wgpu_bind_group_layout(
        &native,
        &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    );
    let texture_layout = create_wgpu_bind_group_layout(
        &native,
        &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            },
        ],
    );
    let pipeline_layout = create_wgpu_pipeline_layout_recorded(
        &native,
        &[frame_layout.clone(), texture_layout.clone()],
    );
    let frame_buffer = create_wgpu_buffer(
        &native,
        FRAME_UNIFORM_BYTES,
        wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    );
    let frame_bind_group = create_wgpu_bind_group(
        &native,
        &frame_layout,
        &[wgpu::BindGroupEntry {
            binding: 0,
            resource: frame_buffer.as_entire_binding(),
        }],
    );
    let resources = WgpuParticle3DResources {
        corner_buffer,
        frame_bind_group,
        frame_buffer,
        frame_layout,
        index_buffer,
        instance_buffers: HashMap::new(),
        instance_data: Vec::new(),
        module: create_wgpu_shader_module(&native, PARTICLE_3D_WGSL),
        pipeline_layout,
        pipelines: HashMap::new(),
        texture_layout,
    };
    get_wgpu_scene3d_runtime(state).particle_resources = Some(resources.clone());
    return resources;
}

fn filter_mode(filter: TextureFilter) -> wgpu::FilterMode {
    return match filter {
        TextureFilter::Nearest
        | TextureFilter::NearestMipmapLinear
        | TextureFilter::NearestMipmapNearest => wgpu::FilterMode::Nearest,
        _ => wgpu::FilterMode::Linear,
    };
}

// TS: `mipmaps && minFilter.includes('mipmap')`, then the filter's trailing component.
fn mipmap_filter(mipmaps: bool, min_filter: TextureFilter) -> Option<wgpu::MipmapFilterMode> {
    if !mipmaps {
        return None;
    }
    return match min_filter {
        TextureFilter::LinearMipmapNearest | TextureFilter::NearestMipmapNearest => {
            Some(wgpu::MipmapFilterMode::Nearest)
        }
        TextureFilter::LinearMipmapLinear | TextureFilter::NearestMipmapLinear => {
            Some(wgpu::MipmapFilterMode::Linear)
        }
        TextureFilter::Linear | TextureFilter::Nearest => None,
    };
}

/// Appends the particle draw to the 3D passes `render_wgpu_scene3d` runs (TS
/// `registerWgpuParticleEmitter3DPass`); idempotent.
pub fn register_wgpu_particle_emitter3d_pass(state: &mut WgpuRenderState) {
    let pass: WgpuScene3DPass = draw_wgpu_scene3d_particle_emitter3_ds;
    let registries = &mut get_wgpu_render_state_runtime_mut(state).registries;
    let mut passes = match &registries.passes {
        Some(passes) => {
            if passes.iter().any(|entry| std::ptr::fn_addr_eq(*entry, pass)) {
                return;
            }
            (**passes).clone()
        }
        None => Vec::new(),
    };
    passes.push(pass);
    registries.passes = Some(Arc::new(passes));
}

fn restore_instance_data(state: &mut WgpuRenderState, instance_data: Vec<f32>) {
    if let Some(resources) = get_wgpu_scene3d_runtime(state).particle_resources.as_mut() {
        resources.instance_data = instance_data;
    }
}

// The particle blend modes use lowercase spellings; translate to the canonical BlendMode family so
// particles and surface meshes share render-wgpu's one blend-state table.
fn wgpu_particle_blend_state(mode: Option<&str>) -> wgpu::BlendState {
    let blend_mode = match mode {
        Some("add") => BLEND_MODE_ADD,
        Some("multiply") => BLEND_MODE_MULTIPLY,
        Some("screen") => BLEND_MODE_SCREEN,
        _ => BLEND_MODE_NORMAL,
    };
    return get_wgpu_blend_state(Some(&blend_mode.to_string()));
}

// The WGSL mirror of scene3d-gl's particle shaders: a camera-facing billboard whose textured variant
// premultiplies after the sampled color decodes.
const PARTICLE_3D_WGSL: &str = r#"
override HAS_TEXTURE : f32 = 0.0;

struct Frame {
  viewProjection : mat4x4f,
  cameraRight : vec4f,
  cameraUp : vec4f,
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var particleTexture : texture_2d<f32>;
@group(1) @binding(1) var particleSampler : sampler;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec4f,
};

@vertex fn vs_main(
  @location(0) corner : vec2f,
  @location(1) pos : vec3f,
  @location(2) cosScale : f32,
  @location(3) sinScale : f32,
  @location(4) color : vec4f,
  @location(5) uvRect : vec4f,
  @location(6) size : vec2f,
) -> VertexOutput {
  var out : VertexOutput;
  let clockwise = size.x < 0.0;
  let counterclockwise = size.y < 0.0;
  let lx = (corner.x - 0.5) * abs(size.x);
  let ly = (corner.y - 0.5) * abs(size.y);
  let rx = cosScale * lx - sinScale * ly;
  let ry = sinScale * lx + cosScale * ly;
  let worldPos = pos + frame.cameraRight.xyz * rx + frame.cameraUp.xyz * ry;
  out.clipPosition = frame.viewProjection * vec4f(worldPos, 1.0);
  var u = select(uvRect.x, uvRect.z, corner.x > 0.5);
  var v = select(uvRect.y, uvRect.w, corner.y > 0.5);
  if (clockwise) {
    u = select(uvRect.z, uvRect.x, corner.y > 0.5);
    v = select(uvRect.y, uvRect.w, corner.x > 0.5);
  } else if (counterclockwise) {
    u = select(uvRect.x, uvRect.z, corner.y > 0.5);
    v = select(uvRect.w, uvRect.y, corner.x > 0.5);
  }
  out.uv = vec2f(u, v);
  out.color = color;
  return out;
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var rgba : vec4f;
  if (HAS_TEXTURE > 0.5) {
    let tex = textureSample(particleTexture, particleSampler, in.uv);
    let alpha = tex.a * in.color.a;
    rgba = vec4f(tex.rgb * in.color.rgb * alpha, alpha);
  } else {
    let alpha = in.color.a;
    rgba = vec4f(in.color.rgb * alpha, alpha);
  }
  if (rgba.a <= 0.0) { discard; }
  return rgba;
}
"#;
