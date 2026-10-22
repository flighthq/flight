// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over native wgpu resources and render-wgpu state
//! The 2D particle emitter renderer (TS `wgpuParticleEmitter2D.ts`): one instanced draw per emitter
//! from a per-state instance storage buffer, outside the quad batch.

use std::collections::HashMap;

use flight_particleemitter::ParticleEmitter2D;
use flight_render::{NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE, noop_renderer_data};
use flight_render_wgpu::{
    WgpuParticleResources, WgpuRenderState, get_wgpu_render_pass_viewport,
    get_wgpu_render_state_device_resources, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut, get_wgpu_sampler,
    resolve_wgpu_apply_blend_mode, resolve_wgpu_texture, retire_wgpu_buffer, write_wgpu_buffer,
};
use flight_texture::{
    TextureUvTransform, get_texture_height, get_texture_width, has_texture_source,
};
use flight_textureatlas::TextureAtlasRotation;

use crate::wgpu_quad_batch_writer::{
    flush_wgpu_quad_batch_writer, get_wgpu_mipmap_filter, is_nearest_filter, wgpu_f32_bytes,
};

// Per-instance layout in the instance buffer (14 floats = 56 bytes):
//   0: px, 1: py, 2: cosScale, 3: sinScale
//   4: r, 5: g, 6: b, 7: alpha
//   8: u0, 9: v0, 10: u1, 11: v1
//   12: signed width (< 0 clockwise), 13: signed height (< 0 counterclockwise)
const INSTANCE_FLOATS: usize = 14;
const INSTANCE_STRIDE: u32 = (INSTANCE_FLOATS * 4) as u32;

// WGSL for the particle instanced shader.
const PARTICLE_SHADER_SRC: &str = r"
struct Uniforms {
  matrix : mat3x3f,
  alpha : f32,
  hasColorScaleBias : u32,
  straightTextureAlpha : u32,
  _pad1 : f32,
  colorScale : vec4f,
  colorBias : vec4f,
  x0 : f32, y0 : f32, x1 : f32, y1 : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
}

struct InstanceData {
  px : f32, py : f32,
  cosScale : f32, sinScale : f32,
  r : f32, g : f32, b : f32, alpha : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
  width : f32, height : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var<storage, read> instances : array<InstanceData>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec4f,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vi : u32,
  @builtin(instance_index) ii : u32,
) -> VertexOut {
  let inst = instances[ii];
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let clockwise = inst.width < 0.0;
  let counterclockwise = inst.height < 0.0;
  let lx = select(0.0, abs(inst.width), xi);
  let ly = select(0.0, abs(inst.height), yi);
  // Rotate and translate in world space
  let rx = inst.cosScale * lx - inst.sinScale * ly + inst.px;
  let ry = inst.sinScale * lx + inst.cosScale * ly + inst.py;
  let p = uni.matrix * vec3f(rx, ry, 1.0);
  var u = select(inst.u0, inst.u1, xi);
  var v = select(inst.v0, inst.v1, yi);
  if (clockwise) {
    u = select(inst.u1, inst.u0, yi);
    v = select(inst.v0, inst.v1, xi);
  } else if (counterclockwise) {
    u = select(inst.u0, inst.u1, yi);
    v = select(inst.v1, inst.v0, xi);
  }
  var out : VertexOut;
  out.position = vec4f(p.x, p.y, 0.0, 1.0);
  out.uv = vec2f(u, v);
  out.color = vec4f(inst.r, inst.g, inst.b, inst.alpha);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var tex_color = textureSample(tex, smp, in.uv);
  if (uni.straightTextureAlpha != 0u) {
    tex_color = vec4f(tex_color.rgb * tex_color.a, tex_color.a);
  }
  let out_color = vec4f(tex_color.rgb * in.color.rgb, tex_color.a) * in.color.a;
  if (out_color.a <= 0.0) { discard; }
  return out_color;
}
";

/// The 2D particle emitter renderer (TS `wgpuParticleEmitter2DRenderer`): flushes the quad batch,
/// then draws the emitter immediately.
pub static WGPU_PARTICLE_EMITTER2D_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: noop_renderer_data::<WgpuRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_wgpu_particle_emitter2d,
};

/// Draws an emitter's live particles as one instanced draw (TS `drawWgpuParticleEmitter2D`). Each
/// particle is an atlas region rotated and scaled about its position, tinted and faded per particle;
/// `world_space` particles map straight through the viewport.
pub fn draw_wgpu_particle_emitter2d(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let source = render_proxy.source.clone();
    let source = source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<ParticleEmitter2D>() else {
        return;
    };
    let data = &source.data;
    let Some(atlas) = &data.atlas else {
        return;
    };
    let atlas = atlas.read().unwrap();
    let Some(texture) = &atlas.texture else {
        return;
    };
    let texture = texture.read().unwrap();
    let particle_count = data.particle_count;
    if !has_texture_source(&*texture) || particle_count == 0 {
        return;
    }

    let resources = ensure_particle_resources(state);
    ensure_particle_instance_buffer(state, particle_count as u32);

    if let Some(apply_blend_mode) = resolve_wgpu_apply_blend_mode(state) {
        apply_blend_mode(state, render_proxy.blend_mode.as_ref());
    }
    let Some(texture_entry) = resolve_wgpu_texture(
        state,
        &*texture,
        Some(true),
        Some(SCENE2D_WORKING_COLOR_SPACE),
    ) else {
        return;
    };
    let sampler = &texture.texture_fields().sampler;
    let native = get_wgpu_render_state_native_device(state);
    let gpu_sampler = get_wgpu_sampler(
        state,
        if is_nearest_filter(sampler.min_filter) {
            wgpu::FilterMode::Nearest
        } else {
            wgpu::FilterMode::Linear
        },
        if is_nearest_filter(sampler.mag_filter) {
            wgpu::FilterMode::Nearest
        } else {
            wgpu::FilterMode::Linear
        },
        sampler.wrap_u,
        sampler.wrap_v,
        get_wgpu_mipmap_filter(sampler),
        Some(sampler.anisotropy),
    );
    let view = texture_entry.read().unwrap().view.clone();
    let texture_bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &get_wgpu_render_state_device_resources(state).texture_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&gpu_sampler),
            },
        ],
    });

    let regions = &atlas.regions;
    let num_regions = regions.len() as i32;
    let node_alpha = render_proxy.alpha;
    let iw = 1.0 / 1.max(get_texture_width(&*texture)) as f32;
    let ih = 1.0 / 1.max(get_texture_height(&*texture)) as f32;
    let (ids, alphas, colors, transforms) =
        (&data.ids, &data.alphas, &data.colors, &data.transforms);

    let runtime = get_wgpu_render_state_runtime_mut(state);
    let instance_data = runtime
        .particle_instance_data
        .as_mut()
        .expect("the particle instance data was sized above");
    let mut draw_count: u32 = 0;
    let mut base = 0;
    for i in 0..particle_count {
        let id = ids[i] as i32;
        if id < 0 || id >= num_regions {
            continue;
        }
        let region = regions[id as usize].read().unwrap();
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }

        let tt = i * 4;
        let px = transforms[tt];
        let py = transforms[tt + 1];
        let rotation = transforms[tt + 2];
        let scale = transforms[tt + 3];
        let cos_r = rotation.cos() * scale;
        let sin_r = rotation.sin() * scale;

        let ct = i * 3;
        let has_colors = colors.len() > ct + 2;
        instance_data[base] = px;
        instance_data[base + 1] = py;
        instance_data[base + 2] = cos_r;
        instance_data[base + 3] = sin_r;
        instance_data[base + 4] = if has_colors { colors[ct] } else { 1.0 };
        instance_data[base + 5] = if has_colors { colors[ct + 1] } else { 1.0 };
        instance_data[base + 6] = if has_colors { colors[ct + 2] } else { 1.0 };
        instance_data[base + 7] = node_alpha * alphas[i];
        instance_data[base + 8] = region.x * iw;
        instance_data[base + 9] = region.y * ih;
        instance_data[base + 10] = (region.x + region.width) * iw;
        instance_data[base + 11] = (region.y + region.height) * ih;
        let rotated = region.rotation != TextureAtlasRotation::None;
        let counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
        instance_data[base + 12] = if rotated && !counterclockwise {
            -region.height
        } else if rotated {
            region.height
        } else {
            region.width
        };
        instance_data[base + 13] = if rotated && counterclockwise {
            -region.width
        } else if rotated {
            region.width
        } else {
            region.height
        };
        base += INSTANCE_FLOATS;
        draw_count += 1;
    }

    if draw_count == 0 {
        return;
    }

    // Upload instance data.
    let instance_buffer = runtime.particle_instance_buffer.clone().unwrap();
    let upload_bytes = (draw_count * INSTANCE_STRIDE) as usize;
    write_wgpu_buffer(
        &native,
        &instance_buffer,
        0,
        &wgpu_f32_bytes(instance_data)[..upload_bytes],
    );

    // Write the uniform slot for this emitter (world transform → clip space; quad coords unused).
    let viewport = get_wgpu_render_pass_viewport(state);
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let uniform_offset = runtime.uniform_offset;
    let float_base = (uniform_offset >> 2) as usize;
    let t = &render_proxy.transform_2d;
    let iw2 = 2.0 / viewport.width;
    let ih2 = 2.0 / viewport.height;
    let matrix_array = &mut runtime.matrix_array;
    if data.world_space {
        // Particles are already in world (pixel) space — map directly through the viewport.
        *matrix_array = [iw2, 0.0, 0.0, 0.0, -ih2, 0.0, -1.0, 1.0, 1.0];
    } else {
        *matrix_array = [
            t.a * iw2,
            -t.b * ih2,
            0.0,
            t.c * iw2,
            -t.d * ih2,
            0.0,
            t.tx * iw2 - 1.0,
            -t.ty * ih2 + 1.0,
            1.0,
        ];
    }
    let matrix = runtime.matrix_array;
    let uniform_data = &mut runtime.uniform_data;
    uniform_data[float_base] = matrix[0];
    uniform_data[float_base + 1] = matrix[1];
    uniform_data[float_base + 2] = matrix[2];
    uniform_data[float_base + 3] = 0.0;
    uniform_data[float_base + 4] = matrix[3];
    uniform_data[float_base + 5] = matrix[4];
    uniform_data[float_base + 6] = matrix[5];
    uniform_data[float_base + 7] = 0.0;
    uniform_data[float_base + 8] = matrix[6];
    uniform_data[float_base + 9] = matrix[7];
    uniform_data[float_base + 10] = matrix[8];
    uniform_data[float_base + 11] = 0.0;
    uniform_data[float_base + 12] = 1.0; // alpha = 1 (per-instance handles alpha)
    uniform_data[float_base + 13] = f32::from_bits(0);
    uniform_data[float_base + 14] = f32::from_bits(u32::from(
        texture_entry.read().unwrap().straight_alpha == Some(true),
    ));
    for k in 15..32 {
        uniform_data[float_base + k] = 0.0;
    }
    runtime.uniform_offset += runtime.uniform_stride;

    // Create the per-frame instance bind group.
    let instance_bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &resources.instance_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: instance_buffer.as_entire_binding(),
        }],
    });

    let pipeline = get_particle_pipeline(state, &resources);
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let uniform_bind_group = runtime.uniform_bind_group.clone();
    let pass = runtime.render_pass.as_mut().unwrap();
    pass.set_pipeline(&pipeline);
    pass.set_bind_group(0, &uniform_bind_group, &[uniform_offset]);
    pass.set_bind_group(1, &texture_bind_group, &[]);
    pass.set_bind_group(2, &instance_bind_group, &[]);
    pass.draw(0..6, 0..draw_count);
}

fn ensure_particle_instance_buffer(state: &mut WgpuRenderState, count: u32) {
    let needed = count * INSTANCE_STRIDE;
    let runtime = get_wgpu_render_state_runtime(state);
    if runtime.particle_instance_capacity >= needed && runtime.particle_instance_buffer.is_some() {
        return;
    }

    // Defer the old buffer's destruction: another emitter earlier this frame may have recorded a
    // draw referencing it, and the frame's submit is deferred to submit_wgpu_frame.
    if let Some(buffer) = runtime.particle_instance_buffer.clone() {
        retire_wgpu_buffer(state, buffer);
    }
    let new_capacity =
        needed.max(get_wgpu_render_state_runtime(state).particle_instance_capacity * 2);
    let buffer = get_wgpu_render_state_native_device(state)
        .device
        .create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: new_capacity.max(INSTANCE_STRIDE) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
    let runtime = get_wgpu_render_state_runtime_mut(state);
    runtime.particle_instance_buffer = Some(buffer);
    runtime.particle_instance_capacity = new_capacity;
    runtime.particle_instance_data = Some(vec![0.0; (new_capacity / 4) as usize]);
}

fn ensure_particle_resources(state: &WgpuRenderState) -> WgpuParticleResources {
    let context = get_wgpu_render_state_runtime(state).context.clone();
    if let Some(existing) = &context.read().unwrap().particle_resources {
        return existing.clone();
    }

    let native = get_wgpu_render_state_native_device(state);
    let device_resources = get_wgpu_render_state_device_resources(state);
    let instance_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: None,
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
    let pipeline_layout = native
        .device
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[
                Some(&device_resources.uniform_bind_group_layout),
                Some(&device_resources.texture_bind_group_layout),
                Some(&instance_bind_group_layout),
            ],
            immediate_size: 0,
        });
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(PARTICLE_SHADER_SRC.into()),
        });
    let resources = WgpuParticleResources {
        instance_bind_group_layout,
        module,
        pipeline_layout,
        pipelines: HashMap::new(),
    };
    context.write().unwrap().particle_resources = Some(resources.clone());
    return resources;
}

// The particle pipeline for the current target's color format, built and cached on demand.
fn get_particle_pipeline(
    state: &WgpuRenderState,
    resources: &WgpuParticleResources,
) -> wgpu::RenderPipeline {
    let runtime = get_wgpu_render_state_runtime(state);
    let format = runtime.current_color_format.unwrap_or(state.format);
    let context = runtime.context.clone();
    if let Some(existing) = context
        .read()
        .unwrap()
        .particle_resources
        .as_ref()
        .and_then(|resources| resources.pipelines.get(&format))
    {
        return existing.clone();
    }

    let premultiplied = wgpu::BlendComponent {
        src_factor: wgpu::BlendFactor::One,
        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
        operation: wgpu::BlendOperation::Add,
    };
    let stencil_face = wgpu::StencilFaceState {
        compare: wgpu::CompareFunction::Always,
        fail_op: wgpu::StencilOperation::Keep,
        depth_fail_op: wgpu::StencilOperation::Keep,
        pass_op: wgpu::StencilOperation::Keep,
    };
    let pipeline = get_wgpu_render_state_native_device(state)
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&resources.pipeline_layout),
            vertex: wgpu::VertexState {
                module: &resources.module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &resources.module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState {
                        color: premultiplied,
                        alpha: premultiplied,
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth24PlusStencil8,
                depth_write_enabled: Some(false),
                depth_compare: Some(wgpu::CompareFunction::Always),
                stencil: wgpu::StencilState {
                    front: stencil_face,
                    back: stencil_face,
                    read_mask: 0xff,
                    write_mask: 0x00,
                },
                bias: wgpu::DepthBiasState::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..wgpu::PrimitiveState::default()
            },
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

    context
        .write()
        .unwrap()
        .particle_resources
        .get_or_insert_with(|| resources.clone())
        .pipelines
        .insert(format, pipeline.clone());
    return pipeline;
}

// The emitter renderer's submit: flush the batch, then draw immediately.
fn submit_wgpu_particle_emitter2d(
    state: &mut WgpuRenderState,
    node: &RenderProxy2D<WgpuRenderState>,
) {
    flush_wgpu_quad_batch_writer(state);
    draw_wgpu_particle_emitter2d(state, node);
}
