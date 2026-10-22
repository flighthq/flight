// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: effect passes take host-supplied wgpu resources and borrowed uniform-writer callbacks
//! Fullscreen effect passes (TS `wgpuEffectPass.ts`): the shared vertex shader, effect pipelines
//! in the three compositing blend modes, and single- and dual-source draws through a per-state
//! uniform ring buffer.

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;
use flight_render_wgpu::{
    WgpuColorLoadRecord, WgpuCommandRecord, WgpuRenderPass, WgpuRenderPassBeginRecord,
    WgpuRenderState, WgpuTextureRenderTarget, get_wgpu_active_render_pass,
    get_wgpu_render_pass_viewport, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, record_wgpu_command, suspend_wgpu_render_pass,
    write_wgpu_buffer,
};

use crate::types::*;
use crate::wgpu_effect_runtime::{
    WgpuEffectPassState, create_wgpu_effect_pipeline_layout, create_wgpu_effect_render_pipeline,
    create_wgpu_effect_shader_module, create_wgpu_effect_texture_bind_group,
    draw_wgpu_effect_fullscreen_quad, get_wgpu_effect_blend_state, get_wgpu_effect_runtime,
    set_wgpu_effect_pass_bind_group, set_wgpu_effect_pass_pipeline,
};

/// Shared vertex shader: a fullscreen quad from `vertex_index`, no vertex buffer. UV convention:
/// y = 0 is the texture top, y = 1 the bottom (WebGPU top-left origin), so NDC y = +1 maps to
/// uv.y = 0 and NDC y = -1 to uv.y = 1.
pub const EFFECT_VERTEX_WGSL: &str = r#"
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOut {
  let xi = vi == 1u || vi == 2u || vi == 4u;
  let yi = vi == 2u || vi == 4u || vi == 5u;
  var out : VertexOut;
  out.position = vec4f(select(-1.0, 1.0, xi), select(-1.0, 1.0, yi), 0.0, 1.0);
  out.uv = vec2f(select(0.0, 1.0, xi), select(1.0, 0.0, yi));
  return out;
}
"#;

// 512 slots x 256 bytes = 128 KB ring buffer for effect-pass uniforms. 256 bytes/slot is enough for
// the largest pass (convolution: ~244 bytes). Separate slots per draw avoid write ordering issues
// when several passes of the same type run within one command encoder; wrapping back to slot 0
// within a frame would need more than 512 pass applications.
const EFFECT_UNIFORM_SLOTS: u32 = 512;
const EFFECT_UNIFORM_STRIDE: u32 = 256;

/// Compiles a dual-source effect pipeline (TS `createWgpuDualSourceEffectPipeline`): source0 at
/// @group(1), source1 at @group(2). `blend` defaults to premultiplied compositing.
pub fn create_wgpu_dual_source_effect_pipeline(
    state: &mut WgpuRenderState,
    fragment_wgsl: &str,
    blend: Option<WgpuEffectBlendMode>,
) -> WgpuDualSourceEffectPipeline {
    // A pipeline entity cannot be allocated before its first `wgpu::RenderPipeline` exists, so
    // creation compiles directly; `initialize_*` recompiles into an existing value.
    return build_wgpu_effect_pipeline(state, fragment_wgsl, blend.unwrap_or_default(), 2);
}

/// Compiles a single-source effect pipeline (TS `createWgpuEffectPipeline`): the fragment half is
/// prefixed with `EFFECT_VERTEX_WGSL`. `blend` defaults to premultiplied compositing.
pub fn create_wgpu_effect_pipeline(
    state: &mut WgpuRenderState,
    fragment_wgsl: &str,
    blend: Option<WgpuEffectBlendMode>,
) -> WgpuEffectPipeline {
    return build_wgpu_effect_pipeline(state, fragment_wgsl, blend.unwrap_or_default(), 1);
}

/// Compiles a dual-source pipeline into `out` (TS `initializeWgpuDualSourceEffectPipeline`):
/// source0 = group 1, source1 = group 2. `blend` defaults to premultiplied compositing.
pub fn initialize_wgpu_dual_source_effect_pipeline(
    out: &mut WgpuDualSourceEffectPipeline,
    state: &mut WgpuRenderState,
    fragment_wgsl: &str,
    blend: Option<WgpuEffectBlendMode>,
) {
    let built = build_wgpu_effect_pipeline(state, fragment_wgsl, blend.unwrap_or_default(), 2);
    out.pipeline = built.pipeline;
    out.blend_mode = built.blend_mode;
    out.compile_for_format = built.compile_for_format;
    out.variants = built.variants;
}

fn acquire_effect_pass_uniform_slot(state: &mut WgpuRenderState) -> u32 {
    ensure_effect_pass_state(state);
    return acquire_uniform_slot(state);
}

fn acquire_uniform_slot(state: &mut WgpuRenderState) -> u32 {
    let pass_state = get_effect_pass_state(state);
    let offset = pass_state.uniform_offset;
    pass_state.uniform_offset = (offset + pass_state.uniform_stride)
        % (pass_state.uniform_slots * pass_state.uniform_stride);
    return offset;
}

// A fullscreen effect pass is recorded beside the caller's pass rather than inside it, so the
// caller's pass steps aside; end_wgpu_effect_pass resumes it once the chain has presented.
// A missing destination means "where the enclosing pass is drawing": the view comes from that pass,
// because the state does not know which surface a frame is landing on.
pub(crate) fn begin_effect_pass(
    state: &mut WgpuRenderState,
    dest: Option<&WgpuTextureRenderTarget>,
    load_op: wgpu::LoadOp<wgpu::Color>,
) -> wgpu::RenderPass<'static> {
    if get_wgpu_render_state_runtime(state)
        .command_encoder
        .is_none()
    {
        panic!("No active command encoder — open a frame with beginWgpuRenderPass first");
    }
    let stack_depth = get_wgpu_render_state_runtime(state).pass_stack.len();
    if stack_depth > 0 {
        let mut enclosing = WgpuRenderPass {
            state: &mut *state,
            index: stack_depth - 1,
        };
        suspend_wgpu_render_pass(&mut enclosing);
    }
    let view = match dest {
        Some(dest) => dest.view.clone(),
        None => get_wgpu_active_render_pass(state)
            .expect("an effect pass without a destination draws into the open pass")
            .color_view
            .clone(),
    };
    let (width, height) = match dest {
        Some(dest) => (dest.width as f32, dest.height as f32),
        None => {
            let extent = get_wgpu_render_pass_viewport(state);
            (extent.width, extent.height)
        }
    };
    let native = get_wgpu_render_state_native_device(state);
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::BeginRenderPass(WgpuRenderPassBeginRecord {
            color: match load_op {
                wgpu::LoadOp::Clear(color) => {
                    WgpuColorLoadRecord::Clear(flight_render_wgpu::WgpuClearColorRecord {
                        a: color.a,
                        b: color.b,
                        g: color.g,
                        r: color.r,
                    })
                }
                _ => WgpuColorLoadRecord::Load,
            },
            color_view: view.clone(),
            depth_clear: None,
            stencil_clear: 0,
        });
    });
    let encoder = flight_render_wgpu::get_wgpu_render_state_runtime_mut(state)
        .command_encoder
        .as_mut()
        .expect("an effect pass records into the frame's command encoder");
    let mut pass = encoder
        .begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: load_op,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        })
        .forget_lifetime();
    pass.set_viewport(0.0, 0.0, width, height, 0.0, 1.0);
    return pass;
}

fn build_wgpu_effect_pipeline(
    state: &mut WgpuRenderState,
    fragment_wgsl: &str,
    blend: WgpuEffectBlendMode,
    texture_groups: usize,
) -> WgpuEffectPipeline {
    ensure_effect_pass_state(state);
    let native = get_wgpu_render_state_native_device(state);
    let pass_state = get_effect_pass_state(state);
    let format = pass_state.format;
    let mut layouts = vec![&pass_state.uniform_bind_group_layout];
    for _ in 0..texture_groups {
        layouts.push(&pass_state.texture_bind_group_layout);
    }
    let shader_module =
        create_wgpu_effect_shader_module(&native, &format!("{EFFECT_VERTEX_WGSL}{fragment_wgsl}"));
    let pipeline_layout = create_wgpu_effect_pipeline_layout(&native, &layouts);
    let blend_state = get_wgpu_effect_blend_state(blend);
    let compile_native = native.clone();
    let compile_for_format: WgpuEffectPipelineCompiler =
        Arc::new(move |format: wgpu::TextureFormat| {
            return create_wgpu_effect_render_pipeline(
                &compile_native,
                &pipeline_layout,
                &shader_module,
                format,
                blend_state,
            );
        });
    let pipeline = compile_for_format(format);
    return WgpuEffectPipeline {
        runtime: EntityRuntimeSlot::default(),
        pipeline,
        blend_mode: blend,
        compile_for_format: Some(compile_for_format),
        variants: Some(HashMap::new()),
    };
}

/// Clears a render target to fully transparent (TS `clearWgpuEffectTarget`). Suspends any open
/// pass.
pub fn clear_wgpu_effect_target(state: &mut WgpuRenderState, target: &WgpuTextureRenderTarget) {
    let pass = begin_effect_pass(
        state,
        Some(target),
        wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
    );
    drop(pass);
}

/// Draws a fullscreen pass reading two source textures (TS `drawWgpuDualSourceEffectPass`):
/// source0 binds to group 1, source1 to group 2. `None` draws into the open pass's attachment.
pub fn draw_wgpu_dual_source_effect_pass(
    state: &mut WgpuRenderState,
    source0: &WgpuTextureRenderTarget,
    source1: &WgpuTextureRenderTarget,
    dest: Option<&WgpuTextureRenderTarget>,
    pipeline: &mut WgpuDualSourceEffectPipeline,
    set_uniforms: WgpuEffectUniformWriter<'_>,
) {
    ensure_effect_pass_state(state);
    let native = get_wgpu_render_state_native_device(state);
    let slot_offset = acquire_uniform_slot(state);
    write_uniform_slot(state, slot_offset, set_uniforms);
    let source0_bind_group = get_or_create_texture_bind_group(state, &native, &source0.view);
    let source1_bind_group = get_or_create_texture_bind_group(state, &native, &source1.view);
    let uniform_bind_group = get_effect_pass_state(state).uniform_bind_group.clone();
    let render_pipeline = resolve_effect_pipeline(state, pipeline, dest);

    let mut pass = begin_effect_pass(state, dest, wgpu::LoadOp::Load);
    set_wgpu_effect_pass_pipeline(&native, &mut pass, &render_pipeline);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 0, &uniform_bind_group, &[slot_offset]);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 1, &source0_bind_group, &[]);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 2, &source1_bind_group, &[]);
    draw_wgpu_effect_fullscreen_quad(&native, pass);
}

/// Draws a fullscreen effect pass reading `source` at group 1 and writing `dest` (TS
/// `drawWgpuEffectPass`); `None` draws into the open pass's attachment. `set_uniforms` writes the
/// pass's slot of the uniform ring buffer. Suspends any open pass; does not resume it.
pub fn draw_wgpu_effect_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: Option<&WgpuTextureRenderTarget>,
    pipeline: &mut WgpuEffectPipeline,
    set_uniforms: WgpuEffectUniformWriter<'_>,
) {
    ensure_effect_pass_state(state);
    let native = get_wgpu_render_state_native_device(state);
    let slot_offset = acquire_uniform_slot(state);
    write_uniform_slot(state, slot_offset, set_uniforms);
    let source_bind_group = get_or_create_texture_bind_group(state, &native, &source.view);
    let uniform_bind_group = get_effect_pass_state(state).uniform_bind_group.clone();
    let render_pipeline = resolve_effect_pipeline(state, pipeline, dest);

    let mut pass = begin_effect_pass(state, dest, wgpu::LoadOp::Load);
    set_wgpu_effect_pass_pipeline(&native, &mut pass, &render_pipeline);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 0, &uniform_bind_group, &[slot_offset]);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 1, &source_bind_group, &[]);
    draw_wgpu_effect_fullscreen_quad(&native, pass);
}

fn ensure_effect_pass_state(state: &mut WgpuRenderState) {
    if get_wgpu_effect_runtime(state).pass_state.is_some() {
        return;
    }
    let native = get_wgpu_render_state_native_device(state);
    let format = state.format;
    let device = &native.device;
    let uniform_stride =
        EFFECT_UNIFORM_STRIDE.max(device.limits().min_uniform_buffer_offset_alignment);
    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: (EFFECT_UNIFORM_SLOTS * uniform_stride) as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    // minBindingSize omitted (0): the bound range (one stride) is validated at draw time instead of
    // statically, so passes with structs larger than any fixed minimum share this one layout.
    let uniform_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: true,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
    let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &uniform_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &uniform_buffer,
                offset: 0,
                size: std::num::NonZeroU64::new(uniform_stride as u64),
            }),
        }],
    });
    let texture_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[
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
        });
    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        min_filter: wgpu::FilterMode::Linear,
        mag_filter: wgpu::FilterMode::Linear,
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        ..wgpu::SamplerDescriptor::default()
    });
    get_wgpu_effect_runtime(state).pass_state = Some(WgpuEffectPassState {
        uniform_buffer,
        uniform_data: vec![0.0; (EFFECT_UNIFORM_SLOTS * uniform_stride / 4) as usize],
        uniform_offset: 0,
        uniform_stride,
        uniform_slots: EFFECT_UNIFORM_SLOTS,
        uniform_bind_group_layout,
        uniform_bind_group,
        texture_bind_group_layout,
        texture_bind_groups: HashMap::new(),
        sampler,
        format,
    });
}

pub(crate) fn get_effect_pass_state(state: &mut WgpuRenderState) -> &mut WgpuEffectPassState {
    ensure_effect_pass_state(state);
    return get_wgpu_effect_runtime(state)
        .pass_state
        .as_mut()
        .expect("the effect-pass state exists once ensured");
}

pub(crate) fn get_or_create_texture_bind_group(
    state: &mut WgpuRenderState,
    native: &flight_render_wgpu::WgpuNativeDevice,
    view: &wgpu::TextureView,
) -> wgpu::BindGroup {
    let pass_state = get_effect_pass_state(state);
    if let Some(bind_group) = pass_state.texture_bind_groups.get(view) {
        return bind_group.clone();
    }
    // The source's WeakMap lets a dead view's bind group go; a strong map would keep every view a
    // resized target ever had, so the cache is dropped wholesale once it grows past any plausible
    // working set (it is only a cache: a miss rebuilds the bind group).
    if pass_state.texture_bind_groups.len() >= 256 {
        pass_state.texture_bind_groups.clear();
    }
    let bind_group = create_wgpu_effect_texture_bind_group(
        native,
        &pass_state.texture_bind_group_layout,
        view,
        &pass_state.sampler,
    );
    pass_state
        .texture_bind_groups
        .insert(view.clone(), bind_group.clone());
    return bind_group;
}

/// The string the source uses for a blend mode (D9e).
// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS WgpuEffectBlendMode string union; TS exports no get_/parse_ free functions
pub fn get_wgpu_effect_blend_mode_string(value: WgpuEffectBlendMode) -> &'static str {
    return match value {
        WgpuEffectBlendMode::Erase => "erase",
        WgpuEffectBlendMode::Premul => "premul",
        WgpuEffectBlendMode::Replace => "replace",
    };
}

/// The effect-pass resources for this state, for recipes that bind a custom texture (a gradient
/// ramp, a LUT, a displacement map) at group 2 or 3 (TS `getWgpuEffectPassState`).
pub fn get_wgpu_effect_pass_state(state: &mut WgpuRenderState) -> WgpuEffectPassStateView {
    ensure_effect_pass_state(state);
    let pass_state = get_effect_pass_state(state);
    return WgpuEffectPassStateView {
        uniform_bind_group: pass_state.uniform_bind_group.clone(),
        texture_bind_group_layout: pass_state.texture_bind_group_layout.clone(),
        uniform_bind_group_layout: pass_state.uniform_bind_group_layout.clone(),
        sampler: pass_state.sampler.clone(),
        acquire_slot: acquire_effect_pass_uniform_slot,
        write_slot: write_effect_pass_uniform_slot,
        begin_pass: begin_effect_pass,
    };
}

/// The string table's inverse (D9e).
// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS WgpuEffectBlendMode string union; TS exports no get_/parse_ free functions
pub fn parse_wgpu_effect_blend_mode(value: &str) -> Option<WgpuEffectBlendMode> {
    return match value {
        "erase" => Some(WgpuEffectBlendMode::Erase),
        "premul" => Some(WgpuEffectBlendMode::Premul),
        "replace" => Some(WgpuEffectBlendMode::Replace),
        _ => None,
    };
}

// Returns the render pipeline whose color target format matches `dest` (the canvas format when
// drawing into the open pass), compiling and caching a per-format variant on demand.
fn resolve_effect_pipeline(
    state: &mut WgpuRenderState,
    pipeline: &mut WgpuEffectPipeline,
    dest: Option<&WgpuTextureRenderTarget>,
) -> wgpu::RenderPipeline {
    let canvas_format = get_effect_pass_state(state).format;
    let target_format = dest.map(|dest| dest.format).unwrap_or(canvas_format);
    let (Some(compile_for_format), Some(variants)) =
        (&pipeline.compile_for_format, &mut pipeline.variants)
    else {
        return pipeline.pipeline.clone();
    };
    if target_format == canvas_format {
        return pipeline.pipeline.clone();
    }
    if let Some(variant) = variants.get(&target_format) {
        return variant.clone();
    }
    let variant = compile_for_format(target_format);
    variants.insert(target_format, variant.clone());
    return variant;
}

fn write_effect_pass_uniform_slot(
    state: &mut WgpuRenderState,
    slot_offset: u32,
    set_uniforms: &mut dyn FnMut(&mut [f32], &mut [i32]),
) {
    ensure_effect_pass_state(state);
    write_uniform_slot(state, slot_offset, set_uniforms);
}

// Hands the writer a float view and an int view of the slot. Safe Rust cannot alias the two, so
// the int view starts as the slot's bit pattern and every element the writer changed through it
// is folded back: a recipe writes each element through exactly one view, so the merged slot is the
// bytes the source's shared-buffer views would hold.
pub(crate) fn write_uniform_slot(
    state: &mut WgpuRenderState,
    slot_offset: u32,
    set_uniforms: &mut dyn FnMut(&mut [f32], &mut [i32]),
) {
    let native = get_wgpu_render_state_native_device(state);
    let pass_state = get_effect_pass_state(state);
    let start = (slot_offset / 4) as usize;
    let end = start + (pass_state.uniform_stride / 4) as usize;
    let slot = &mut pass_state.uniform_data[start..end];
    let original: Vec<i32> = slot.iter().map(|value| value.to_bits() as i32).collect();
    let mut ints = original.clone();
    set_uniforms(slot, &mut ints);
    for index in 0..ints.len() {
        if ints[index] != original[index] {
            slot[index] = f32::from_bits(ints[index] as u32);
        }
    }
    // Host byte order, validated on little-endian only (see explain_wgpu_uniform_endianness).
    let mut bytes = Vec::with_capacity(slot.len() * 4);
    for value in slot.iter() {
        bytes.extend_from_slice(&value.to_ne_bytes());
    }
    let buffer = pass_state.uniform_buffer.clone();
    write_wgpu_buffer(&native, &buffer, slot_offset as u64, &bytes);
}
