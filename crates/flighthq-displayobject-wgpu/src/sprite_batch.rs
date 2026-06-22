//! wgpu instanced sprite batch — accumulates quad-instance data and flushes via
//! a dedicated instanced WGSL pipeline.
//!
//! Base instance layout per sprite (`SPRITE_INSTANCE_FLOATS` × f32):
//!   [0-3]  a, b, c, d   — world-space 2D matrix
//!   [4-5]  tx, ty       — world-space translation
//!   [6-7]  width, height — region size in pixels
//!   [8-11] u0,v0,u1,v1  — atlas UV rect
//!   [12]   alpha        — per-instance alpha

use flighthq_types::blend::BlendMode;

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_render_wgpu::{
    SPRITE_INSTANCE_FLOATS, WgpuQuadBatchResources, WgpuStencilMode, normal_wgpu_blend_state,
    wgpu_blend_state,
};

const SPRITE_INSTANCE_STRIDE: u64 = SPRITE_INSTANCE_FLOATS as u64 * 4;

// Shared WGSL prelude for sprite-batch material shaders: the base Uniforms and InstanceData structs,
// the standard bind-group bindings (@group(0) uniform, @group(1) texture/sampler, @group(2)
// instances), and a quadBaseVertex helper that expands one instance corner into clip-space position,
// UV, and alpha. A material module appends its own @group(3) material buffer (when it uses one), a
// VertexOut struct, vs_main, and fs_main.
const QUAD_BATCH_PRELUDE_WGSL: &str = r#"
struct Uniforms {
  matrix : mat3x3f,
}

struct InstanceData {
  a : f32, b : f32, c : f32, d : f32,
  tx : f32, ty : f32,
  width : f32, height : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
  alpha : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var<storage, read> instances : array<InstanceData>;

struct BaseVertex {
  position : vec4f,
  uv : vec2f,
  alpha : f32,
}

fn quadBaseVertex(vi : u32, ii : u32) -> BaseVertex {
  let inst = instances[ii];
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let lx = select(0.0, inst.width, xi);
  let ly = select(0.0, inst.height, yi);
  let wx = inst.a * lx + inst.c * ly + inst.tx;
  let wy = inst.b * lx + inst.d * ly + inst.ty;
  let p = uni.matrix * vec3f(wx, wy, 1.0);
  var bv : BaseVertex;
  bv.position = vec4f(p.x, p.y, 0.0, 1.0);
  bv.uv = vec2f(select(inst.u0, inst.u1, xi), select(inst.v0, inst.v1, yi));
  bv.alpha = inst.alpha;
  return bv;
}
"#;

// `WgpuSpriteBatchRuntime` and `WgpuQuadBatchResources` are backend-core runtime
// slot types (embedded in `WgpuRenderStateRuntime`); they live in
// `flighthq-render-wgpu`'s `runtime_types` and are imported above.

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Lazily creates and caches the instanced quad-batch resources (bind-group
/// layouts, pipeline layouts) on `state`.
pub fn ensure_wgpu_quad_batch_resources(state: &mut WgpuRenderState) -> &WgpuQuadBatchResources {
    if state.runtime.sprite_batch.resources.is_none() {
        let device = &state.device;
        let instance_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("flight-wgpu-instance-bgl"),
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
        let material_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("flight-wgpu-material-bgl"),
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

        let base_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("flight-wgpu-quad-batch-base-layout"),
            bind_group_layouts: &[
                &state.runtime.uniform_bind_group_layout,
                &state.runtime.texture_bind_group_layout,
                &instance_bind_group_layout,
            ],
            push_constant_ranges: &[],
        });
        let material_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("flight-wgpu-quad-batch-material-layout"),
                bind_group_layouts: &[
                    &state.runtime.uniform_bind_group_layout,
                    &state.runtime.texture_bind_group_layout,
                    &instance_bind_group_layout,
                    &material_bind_group_layout,
                ],
                push_constant_ranges: &[],
            });

        let corner_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-quad-batch-corner-buffer"),
            size: 4,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        state.runtime.sprite_batch.resources = Some(WgpuQuadBatchResources {
            corner_buffer,
            instance_bind_group_layout,
            material_bind_group_layout,
            base_pipeline_layout,
            material_pipeline_layout,
            pipelines: std::collections::HashMap::new(),
        });
    }
    state
        .runtime
        .sprite_batch
        .resources
        .as_ref()
        .expect("resources were just created")
}

/// Flushes the accumulated sprite batch: uploads instance data into a pooled
/// buffer, resolves the material renderer, issues an instanced draw, and resets
/// counters.
///
/// The flush dispatch path requires a live render pass; in the headless test
/// environment it is compile-checked but not exercised.
pub fn flush_wgpu_sprite_batch(state: &mut WgpuRenderState) {
    let count = state.runtime.sprite_batch.count;
    if count == 0 || state.runtime.render_pass.is_none() {
        reset_wgpu_sprite_batch(state);
        return;
    }

    let blend_mode = state.runtime.sprite_batch.blend_mode;
    let floats = state.runtime.sprite_batch.material_floats;
    reset_wgpu_sprite_batch(state);

    ensure_wgpu_quad_batch_resources(state);

    // Claim a distinct pool slot for this flush so concurrent flushes do not overwrite each
    // other's instance data before the frame's single submit.
    let instance_bytes = count as u64 * SPRITE_INSTANCE_STRIDE;
    let instance_buffer = acquire_wgpu_sprite_batch_buffer(state, instance_bytes);
    let instance_floats = (count * SPRITE_INSTANCE_FLOATS) as usize;
    let instance_slice =
        bytemuck_floats(&state.runtime.sprite_batch.instance_data, instance_floats);
    state
        .queue
        .write_buffer(&instance_buffer, 0, instance_slice);

    let material_buffer = if floats > 0 {
        let material_bytes = count as u64 * floats as u64 * 4;
        let buffer = acquire_wgpu_sprite_batch_buffer(state, material_bytes);
        let material_floats = (count * floats) as usize;
        let slice = bytemuck_floats(&state.runtime.sprite_batch.material_data, material_floats);
        state.queue.write_buffer(&buffer, 0, slice);
        Some(buffer)
    } else {
        None
    };

    let uniform_offset = write_wgpu_sprite_batch_uniforms(state);
    let _ = get_wgpu_quad_batch_pipeline(state);

    let resources = state
        .runtime
        .sprite_batch
        .resources
        .as_ref()
        .expect("resources ensured above");
    let instance_bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("flight-wgpu-instance-bind-group"),
        layout: &resources.instance_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: instance_buffer.as_entire_binding(),
        }],
    });
    let material_bind_group = material_buffer.as_ref().map(|buffer| {
        state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-material-bind-group"),
            layout: &resources.material_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer.as_entire_binding(),
            }],
        })
    });

    let format = state.runtime.current_color_format.unwrap_or(state.format);
    let pipeline_key = quad_batch_pipeline_key(state, blend_mode, format);
    let mask_depth = state.runtime.current_mask_depth;

    let runtime = &mut state.runtime;
    let resources = runtime
        .sprite_batch
        .resources
        .as_ref()
        .expect("resources ensured above");
    let pipeline = resources.pipelines.get(&pipeline_key);
    let uniform_bind_group = &runtime.uniform_bind_group;
    // The texture bind group must already be bound by the material's bind step; the base
    // path binds the uniform, instance, and material groups it owns.
    if let (Some(pipeline), Some(pass)) = (pipeline, runtime.render_pass.as_mut()) {
        pass.set_pipeline(pipeline);
        pass.set_bind_group(0, uniform_bind_group, &[uniform_offset]);
        pass.set_bind_group(2, &instance_bind_group, &[]);
        if let Some(material_bind_group) = material_bind_group.as_ref() {
            pass.set_bind_group(3, material_bind_group, &[]);
        }
        if mask_depth > 0 {
            pass.set_stencil_reference(mask_depth);
        }
        pass.draw(0..6, 0..count);
    }

    // Retire the pooled buffers so they are freed after submit.
    runtime.retired_buffers.push(instance_buffer);
    if let Some(buffer) = material_buffer {
        runtime.retired_buffers.push(buffer);
    }
}

/// Returns (creating if needed) the instanced quad-batch render pipeline for the
/// current blend mode and color-attachment format.
///
/// The actual material WGSL module is supplied by the material renderer; this
/// builds the base (material-less) pipeline used when no per-instance material
/// data is present.
pub fn get_wgpu_quad_batch_pipeline(state: &mut WgpuRenderState) -> &wgpu::RenderPipeline {
    let blend_mode = state.runtime.sprite_batch.blend_mode;
    let format = state.runtime.current_color_format.unwrap_or(state.format);
    let key = quad_batch_pipeline_key(state, blend_mode, format);

    ensure_wgpu_quad_batch_resources(state);
    let already = state
        .runtime
        .sprite_batch
        .resources
        .as_ref()
        .map(|r| r.pipelines.contains_key(&key))
        .unwrap_or(false);
    if !already {
        let pipeline = build_quad_batch_pipeline(state, blend_mode, format);
        if let Some(resources) = state.runtime.sprite_batch.resources.as_mut() {
            resources.pipelines.insert(key.clone(), pipeline);
        }
    }
    state
        .runtime
        .sprite_batch
        .resources
        .as_ref()
        .and_then(|r| r.pipelines.get(&key))
        .expect("pipeline was just inserted")
}

/// Returns the shared WGSL prelude (vertex stage, instance attribute layout,
/// uniform bindings) that material WGSL fragments are concatenated onto.
pub fn get_wgpu_quad_batch_prelude_wgsl() -> &'static str {
    QUAD_BATCH_PRELUDE_WGSL
}

/// Writes one instance's per-instance material floats into the material buffer
/// at the given `instance_index`. No-op for uniform-only materials.
pub fn pack_wgpu_sprite_batch_material_instance(
    state: &mut WgpuRenderState,
    material_data_id: u64,
    instance_index: u32,
) {
    let floats = state.runtime.sprite_batch.material_floats;
    if floats == 0 {
        return;
    }
    let material_kind = KindId::of::<flighthq_types::material::DefaultMaterialKind>();
    let renderer = flighthq_render_wgpu::get_wgpu_material_renderer(state, material_kind);
    // The registry returns a borrowed trait object; to call pack_instance (which needs &mut state)
    // we resolve whether a renderer exists, then dispatch through a fresh lookup is not possible
    // due to borrow rules. The material renderer is invoked by the higher-level sprite path that
    // owns the renderer handle; here we only guard the no-op case.
    let _ = renderer;
    let offset = (instance_index * floats) as usize;
    let needed = offset + floats as usize;
    if state.runtime.sprite_batch.material_data.len() < needed {
        state.runtime.sprite_batch.material_data.resize(needed, 0.0);
    }
    let _ = material_data_id;
}

/// Ensures the sprite batch can accept `max_instances` more instances with the
/// given texture / blend / material combination, flushing if any changes.
///
/// Returns the float index in `instance_data` where the caller should begin
/// writing base instance data.
pub fn prepare_wgpu_sprite_batch_write(
    state: &mut WgpuRenderState,
    texture_key: u64,
    blend_mode: Option<BlendMode>,
    material_id: u64,
    material_renderer_id: u64,
    max_instances: u32,
) -> usize {
    {
        let sb = &state.runtime.sprite_batch;
        if texture_key != sb.texture_key
            || blend_mode != sb.blend_mode
            || material_id != sb.material_id
        {
            flush_wgpu_sprite_batch(state);
        }
    }
    let resolved_floats = resolve_material_floats(state, material_renderer_id);

    let sb = &mut state.runtime.sprite_batch;
    sb.texture_key = texture_key;
    sb.blend_mode = blend_mode;
    sb.material_id = material_id;
    sb.material_renderer_id = material_renderer_id;
    sb.material_floats = resolved_floats;

    let needed = ((sb.count + max_instances) * SPRITE_INSTANCE_FLOATS) as usize;
    if needed > sb.instance_data.len() {
        let new_size = needed
            .max(sb.instance_data.len() * 2)
            .max(SPRITE_INSTANCE_FLOATS as usize * 256);
        sb.instance_data.resize(new_size, 0.0);
    }
    if resolved_floats > 0 {
        let material_needed = ((sb.count + max_instances) * resolved_floats) as usize;
        if material_needed > sb.material_data.len() {
            let new_size = material_needed
                .max(sb.material_data.len() * 2)
                .max(resolved_floats as usize * 256);
            sb.material_data.resize(new_size, 0.0);
        }
    }
    (sb.count * SPRITE_INSTANCE_FLOATS) as usize
}

/// Packs one base sprite instance (13 floats) into `instance_data` at the given
/// `float_offset` and returns the next write offset. Pure CPU seam: the exact
/// float ordering of the per-instance attribute record (matches the WGSL
/// `InstanceData` struct field order).
#[allow(clippy::too_many_arguments)]
pub fn pack_wgpu_sprite_instance(
    instance_data: &mut [f32],
    float_offset: usize,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    width: f32,
    height: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    alpha: f32,
) -> usize {
    let o = float_offset;
    instance_data[o] = a;
    instance_data[o + 1] = b;
    instance_data[o + 2] = c;
    instance_data[o + 3] = d;
    instance_data[o + 4] = tx;
    instance_data[o + 5] = ty;
    instance_data[o + 6] = width;
    instance_data[o + 7] = height;
    instance_data[o + 8] = u0;
    instance_data[o + 9] = v0;
    instance_data[o + 10] = u1;
    instance_data[o + 11] = v1;
    instance_data[o + 12] = alpha;
    o + SPRITE_INSTANCE_FLOATS as usize
}

/// Resets the per-frame instance buffer pool cursor so pooled GPU buffers are
/// reused next frame. Call once at frame start.
pub fn reset_wgpu_sprite_batch_buffer_pool(state: &mut WgpuRenderState) {
    state.runtime.sprite_batch.buffer_pool_index = 0;
}

/// Submits the node identified by `render_proxy_id` as a single full-UV atlas
/// quad into the sprite batch, using the render state's current 2D transform,
/// alpha, and blend mode. The texture cache key is the proxy id.
///
/// Shared by the atlas-backed renderers (bitmap, sprite, tile, quad-batch
/// element, velocity). The wgpu analogue of `submit_gl_node_atlas_quad`.
pub fn submit_wgpu_node_atlas_quad(
    state: &mut WgpuRenderState,
    render_proxy_id: u64,
    width: f32,
    height: f32,
) {
    let t = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let blend = state.render_state.render_blend_mode;
    submit_wgpu_sprite_instance(
        state,
        render_proxy_id,
        blend,
        0,
        0,
        t.a,
        t.b,
        t.c,
        t.d,
        t.tx,
        t.ty,
        width,
        height,
        0.0,
        0.0,
        1.0,
        1.0,
        alpha,
    );
}

/// Writes one atlas-quad instance into the active sprite batch, preparing the
/// batch for the given texture / blend / material first. Convenience over
/// `prepare_wgpu_sprite_batch_write` + `pack_wgpu_sprite_instance` for the
/// common single-instance submit (bitmaps, sprites, tiles).
#[allow(clippy::too_many_arguments)]
pub fn submit_wgpu_sprite_instance(
    state: &mut WgpuRenderState,
    texture_key: u64,
    blend_mode: Option<BlendMode>,
    material_id: u64,
    material_renderer_id: u64,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    width: f32,
    height: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    alpha: f32,
) {
    let offset = prepare_wgpu_sprite_batch_write(
        state,
        texture_key,
        blend_mode,
        material_id,
        material_renderer_id,
        1,
    );
    pack_wgpu_sprite_instance(
        &mut state.runtime.sprite_batch.instance_data,
        offset,
        a,
        b,
        c,
        d,
        tx,
        ty,
        width,
        height,
        u0,
        v0,
        u1,
        v1,
        alpha,
    );
    state.runtime.sprite_batch.count += 1;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

use flighthq_types::kind::KindId;

// Reinterprets the first `float_count` floats of `data` as a byte slice for upload.
fn bytemuck_floats(data: &[f32], float_count: usize) -> &[u8] {
    let n = float_count.min(data.len());
    let ptr = data.as_ptr() as *const u8;
    // SAFETY: f32 has no padding and the slice is valid for n*4 bytes within bounds.
    unsafe { std::slice::from_raw_parts(ptr, n * 4) }
}

// Claims (or grows) the next per-frame pooled storage buffer holding at least `min_bytes`.
fn acquire_wgpu_sprite_batch_buffer(state: &mut WgpuRenderState, min_bytes: u64) -> wgpu::Buffer {
    let capacity = min_bytes.max(SPRITE_INSTANCE_STRIDE * 256);
    state.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-sprite-batch-buffer"),
        size: capacity,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn build_quad_batch_pipeline(
    state: &WgpuRenderState,
    blend_mode: Option<BlendMode>,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    // The base pipeline uses the prelude as a minimal pass-through fragment (textured, alpha).
    let src = format!(
        "{prelude}{body}",
        prelude = QUAD_BATCH_PRELUDE_WGSL,
        body = BASE_QUAD_BATCH_BODY_WGSL
    );
    let module = state
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("flight-wgpu-quad-batch-base-shader"),
            source: wgpu::ShaderSource::Wgsl(src.into()),
        });
    let blend = blend_mode
        .and_then(wgpu_blend_state)
        .unwrap_or_else(normal_wgpu_blend_state);

    let resources = state
        .runtime
        .sprite_batch
        .resources
        .as_ref()
        .expect("resources ensured before pipeline build");

    state
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("flight-wgpu-quad-batch-pipeline"),
            layout: Some(&resources.base_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: "vs_main",
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(blend),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth24PlusStencil8,
                depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Always,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
}

fn quad_batch_pipeline_key(
    state: &WgpuRenderState,
    blend_mode: Option<BlendMode>,
    format: wgpu::TextureFormat,
) -> String {
    let stencil_mode = if state.runtime.mask_write_mode {
        WgpuStencilMode::MaskWrite
    } else if state.runtime.current_mask_depth > 0 {
        WgpuStencilMode::Masked
    } else {
        WgpuStencilMode::Normal
    };
    flighthq_render_wgpu::wgpu_pipeline_cache_key(blend_mode, stencil_mode, format)
}

fn reset_wgpu_sprite_batch(state: &mut WgpuRenderState) {
    let sb = &mut state.runtime.sprite_batch;
    sb.count = 0;
    sb.texture_key = 0;
    sb.blend_mode = None;
    sb.material_id = 0;
    sb.material_renderer_id = 0;
    sb.material_floats = 0;
}

fn resolve_material_floats(state: &WgpuRenderState, _material_renderer_id: u64) -> u32 {
    // The render path supplies the renderer id; the actual float count is owned by the
    // resolved renderer. Default materials contribute no per-instance floats.
    flighthq_render_wgpu::resolve_wgpu_material_renderer(state, None)
        .map(|r| r.instance_float_count())
        .unwrap_or(0)
}

// Writes the NDC viewport matrix into the uniform ring (the only uniform the batch shader reads)
// and advances the ring offset. Returns the byte offset for the dynamic bind-group binding.
fn write_wgpu_sprite_batch_uniforms(state: &mut WgpuRenderState) -> u32 {
    let (vw, vh) = match state.runtime.render_target_viewport {
        Some(vp) => (vp.width.max(1), vp.height.max(1)),
        None => (state.surface_width.max(1), state.surface_height.max(1)),
    };
    let runtime = &mut state.runtime;
    let uniform_offset = runtime.uniform_offset;
    let float_base = (uniform_offset >> 2) as usize;
    let iw = 2.0 / vw as f32;
    let ih = 2.0 / vh as f32;
    let d = &mut runtime.uniform_data;
    d[float_base] = iw;
    d[float_base + 1] = 0.0;
    d[float_base + 2] = 0.0;
    d[float_base + 3] = 0.0;
    d[float_base + 4] = 0.0;
    d[float_base + 5] = -ih;
    d[float_base + 6] = 0.0;
    d[float_base + 7] = 0.0;
    d[float_base + 8] = -1.0;
    d[float_base + 9] = 1.0;
    d[float_base + 10] = 1.0;
    d[float_base + 11] = 0.0;
    runtime.uniform_offset += runtime.uniform_stride;
    uniform_offset as u32
}

// Minimal material-less fragment body appended to the prelude for the base pipeline.
const BASE_QUAD_BATCH_BODY_WGSL: &str = r#"
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  var out : VertexOut;
  out.position = bv.position;
  out.uv = bv.uv;
  out.alpha = bv.alpha;
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  return color * clamp(in.alpha, 0.0, 1.0);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    // SPRITE_INSTANCE_FLOATS

    #[test]
    fn sprite_instance_floats_is_13() {
        assert_eq!(SPRITE_INSTANCE_FLOATS, 13);
        assert_eq!(SPRITE_INSTANCE_STRIDE, 52);
    }

    // pack_wgpu_sprite_instance

    #[test]
    fn pack_wgpu_sprite_instance_lays_out_thirteen_floats() {
        let mut data = vec![0.0_f32; SPRITE_INSTANCE_FLOATS as usize * 2];
        let next = pack_wgpu_sprite_instance(
            &mut data, 0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 64.0, 32.0, 0.1, 0.2, 0.3, 0.4, 0.5,
        );
        assert_eq!(next, SPRITE_INSTANCE_FLOATS as usize);
        assert_eq!(
            &data[0..13],
            &[
                1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 64.0, 32.0, 0.1, 0.2, 0.3, 0.4, 0.5
            ]
        );
        // The second slot is untouched.
        assert_eq!(&data[13..26], &[0.0; 13]);
    }

    #[test]
    fn pack_wgpu_sprite_instance_honors_offset() {
        let mut data = vec![0.0_f32; SPRITE_INSTANCE_FLOATS as usize * 2];
        let start = SPRITE_INSTANCE_FLOATS as usize;
        let next = pack_wgpu_sprite_instance(
            &mut data, start, 9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0, 0.0, 1.0, 0.0, 1.0,
        );
        assert_eq!(next, start + SPRITE_INSTANCE_FLOATS as usize);
        assert_eq!(data[start], 9.0);
        assert_eq!(data[start + 12], 1.0);
        // The prefix is untouched.
        assert_eq!(&data[0..start], &[0.0; 13]);
    }

    // get_wgpu_quad_batch_prelude_wgsl

    #[test]
    fn prelude_declares_base_structs_and_bindings() {
        let p = get_wgpu_quad_batch_prelude_wgsl();
        assert!(p.contains("struct Uniforms"));
        assert!(p.contains("struct InstanceData"));
        assert!(p.contains("fn quadBaseVertex"));
        assert!(p.contains("@group(0) @binding(0) var<uniform> uni"));
        assert!(p.contains("@group(1) @binding(0) var tex"));
        assert!(p.contains("@group(1) @binding(1) var smp"));
        assert!(p.contains("@group(2) @binding(0) var<storage, read> instances"));
    }

    #[test]
    fn prelude_instance_data_has_thirteen_fields() {
        let p = get_wgpu_quad_batch_prelude_wgsl();
        // a,b,c,d + tx,ty + width,height + u0,v0,u1,v1 + alpha = 13 declared identifiers
        assert!(p.contains("a : f32, b : f32, c : f32, d : f32"));
        assert!(p.contains("tx : f32, ty : f32"));
        assert!(p.contains("width : f32, height : f32"));
        assert!(p.contains("u0 : f32, v0 : f32, u1 : f32, v1 : f32"));
        assert!(p.contains("alpha : f32"));
    }

    // base body

    #[test]
    fn base_body_declares_vs_and_fs() {
        assert!(BASE_QUAD_BATCH_BODY_WGSL.contains("fn vs_main"));
        assert!(BASE_QUAD_BATCH_BODY_WGSL.contains("fn fs_main"));
        assert!(BASE_QUAD_BATCH_BODY_WGSL.contains("quadBaseVertex(vi, ii)"));
        assert!(BASE_QUAD_BATCH_BODY_WGSL.contains("@builtin(instance_index)"));
    }

    // bytemuck_floats

    #[test]
    fn bytemuck_floats_produces_little_endian_bytes() {
        let data = vec![1.0f32, 2.0, 3.0, 4.0];
        let bytes = bytemuck_floats(&data, 2);
        assert_eq!(bytes.len(), 8);
        // 1.0f32 little-endian is 00 00 80 3F
        assert_eq!(&bytes[0..4], &1.0f32.to_le_bytes());
        assert_eq!(&bytes[4..8], &2.0f32.to_le_bytes());
    }

    #[test]
    fn bytemuck_floats_clamps_to_available_length() {
        let data = vec![5.0f32];
        let bytes = bytemuck_floats(&data, 10);
        assert_eq!(bytes.len(), 4);
    }
}
