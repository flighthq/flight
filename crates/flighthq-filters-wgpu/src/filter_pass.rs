//! Core wgpu filter pass infrastructure.
//!
//! This module mirrors the TS `filterPass.ts` and provides:
//! - `WgpuFilterState` — the caller-owned per-context filter infrastructure:
//!   a uniform ring buffer (512 slots × 256 bytes), the shared bind-group
//!   layouts, the linear sampler, and a texture bind-group cache keyed by
//!   texture-view identity. The TS reference keeps this in a
//!   `WeakMap<WebGPURenderState, ...>`; Rust threads it explicitly instead.
//! - `WgpuFilterPipeline` / `WgpuDualSourcePipeline` — compiled render pipeline
//!   wrappers with per-format variant caching.
//! - `draw_wgpu_filter_pass` / `draw_wgpu_dual_source_pass` /
//!   `draw_wgpu_triple_source_pass` — the canonical fullscreen-quad draw calls
//!   used by all filter modules.
//! - `clear_wgpu_filter_target` — clears a render target to fully transparent,
//!   ending any active render pass.

use std::collections::HashMap;

use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget, get_wgpu_render_state_runtime_mut};

// Shared vertex shader: full-screen quad via vertex_index, no vertex buffer needed.
// UV convention: y=0 = texture top, y=1 = texture bottom (WebGPU top-left origin).
// NDC y=+1 (top) -> uv.y=0, NDC y=-1 (bottom) -> uv.y=1.
pub const FILTER_VERTEX_WGSL: &str = r#"
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

// 512 slots x 256 bytes = 128 KB ring buffer for filter uniforms. 256 bytes/slot
// is enough for the largest filter (convolution ~244 bytes). Separate slots per
// draw avoid writeBuffer ordering issues when multiple filters run within a
// single command encoder.
const RING_SLOTS: u64 = 512;
const RING_STRIDE: u64 = 256;

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

/// Blend mode for a `WgpuFilterPipeline`.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum WgpuBlendMode {
    /// Premultiplied-alpha compositing: `src×1 + dst×(1−srcA)`.
    Premul,
    /// Replace (opaque copy): `src×1 + dst×0`.
    Replace,
}

/// A compiled fullscreen WGSL filter pipeline (vertex + fragment).
///
/// The default `pipeline` targets the filter state's canvas format. Drawing into
/// a non-canvas-format target (an HDR `Rgba16Float` effect target) needs a
/// pipeline whose color-target format matches; `variants` caches those, compiled
/// on demand from the retained `shader_module`. wgpu resource handles are not
/// `Clone`, so the variant recompile reuses this module and the filter state's
/// shared layouts rather than capturing a device closure.
pub struct WgpuFilterPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub blend_mode: WgpuBlendMode,
    pub variants: HashMap<wgpu::TextureFormat, wgpu::RenderPipeline>,
    pub shader_module: wgpu::ShaderModule,
    // Number of texture bind groups after the shared uniform group (1, 2, or 3).
    pub source_groups: usize,
}

/// Alias — dual-source pipelines share the same type as single-source pipelines
/// but are compiled with two source texture bind groups (group 1 + group 2).
pub type WgpuDualSourcePipeline = WgpuFilterPipeline;

/// A writable view over one uniform ring-buffer slot, indexed by 4-byte element.
///
/// `set_f32` / `set_i32` write a float or int at element index `i` (byte offset
/// `i * 4`), mirroring the TS `Float32Array` / `Int32Array` aliasing pair without
/// holding two overlapping mutable slices (which Rust forbids). A given element is
/// written as either a float or an int, never both, matching each filter's struct
/// layout.
pub struct WgpuUniformSlot<'a> {
    bytes: &'a mut [u8],
}

impl<'a> WgpuUniformSlot<'a> {
    /// Wraps a mutable byte slice (one uniform slot) as a writable uniform slot.
    ///
    /// The slice is the slot's backing bytes; `set_f32` / `set_i32` write little-
    /// endian values into it by 4-byte element index. Exposed so callers that
    /// adapt their own slot convention (the effect crate's `[f32; 32]` arrays)
    /// can drive a slot directly in tests.
    pub fn from_bytes(bytes: &'a mut [u8]) -> Self {
        WgpuUniformSlot { bytes }
    }

    /// Writes `value` as a little-endian `f32` at element index `i`.
    pub fn set_f32(&mut self, i: usize, value: f32) {
        let off = i * 4;
        self.bytes[off..off + 4].copy_from_slice(&value.to_le_bytes());
    }

    /// Writes `value` as a little-endian `i32` at element index `i`.
    pub fn set_i32(&mut self, i: usize, value: i32) {
        let off = i * 4;
        self.bytes[off..off + 4].copy_from_slice(&value.to_le_bytes());
    }
}

// ---------------------------------------------------------------------------
// WgpuFilterState
// ---------------------------------------------------------------------------

/// Per-context filter infrastructure: the uniform ring buffer, shared bind-group
/// layouts, the linear sampler, and a texture bind-group cache.
///
/// Create one per `WgpuRenderState` with `create_wgpu_filter_state` and thread it
/// through the filter pass functions. Free its GPU buffer with
/// `destroy_wgpu_filter_state`.
pub struct WgpuFilterState {
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_data: Vec<u8>,
    pub uniform_offset: u64,
    pub uniform_stride: u64,
    pub uniform_slots: u64,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
    pub uniform_bind_group: wgpu::BindGroup,
    pub texture_bind_group_layout: wgpu::BindGroupLayout,
    pub texture_bind_groups: HashMap<wgpu::Id<wgpu::TextureView>, wgpu::BindGroup>,
    pub sampler: wgpu::Sampler,
    pub format: wgpu::TextureFormat,

    // Lazily-compiled reusable pipelines shared by the higher-level filters. These mirror the
    // per-state WeakMap caches in the TS reference; in Rust they live on the caller-owned filter
    // state. Each is compiled on first use by its `get_wgpu_*_shader` accessor.
    pub tint_pipeline: Option<WgpuFilterPipeline>,
    pub invert_tint_pipeline: Option<WgpuFilterPipeline>,
    pub blit_pipeline: Option<WgpuFilterPipeline>,
    pub blit_offset_pipeline: Option<WgpuFilterPipeline>,
    pub inner_clip_pipeline: Option<WgpuFilterPipeline>,
    pub box_blur_pipeline: Option<WgpuFilterPipeline>,
    pub gaussian_blur_pipeline: Option<WgpuFilterPipeline>,
    pub color_matrix_pipeline: Option<WgpuFilterPipeline>,
    pub convolution_pipeline: Option<WgpuFilterPipeline>,
    pub displacement_map_pipeline: Option<WgpuFilterPipeline>,
    pub median_pipeline: Option<WgpuFilterPipeline>,
    pub pixelate_pipeline: Option<WgpuFilterPipeline>,
    pub sharpen_pipeline: Option<WgpuFilterPipeline>,
    pub gradient_lookup_pipeline: Option<WgpuFilterPipeline>,
    pub gradient_bevel_encode_pipeline: Option<WgpuFilterPipeline>,
    pub gradient_bevel_apply_pipeline: Option<WgpuFilterPipeline>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Clears a render target to fully transparent black. Ends any active render pass.
pub fn clear_wgpu_filter_target(state: &mut WgpuRenderState, target: &WgpuRenderTarget) {
    begin_filter_pass(
        state,
        Some(target),
        wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
    );
    end_filter_pass(state);
}

/// Compiles a dual-source WGSL filter pipeline (source0 = group 1, source1 = group 2).
pub fn create_wgpu_dual_source_pipeline(
    state: &WgpuRenderState,
    filter_state: &WgpuFilterState,
    fragment_wgsl: &str,
    blend: WgpuBlendMode,
) -> WgpuDualSourcePipeline {
    build_pipeline(state, filter_state, fragment_wgsl, blend, 2)
}

/// Compiles a single-source WGSL filter pipeline.
///
/// `fragment_wgsl` is the fragment shader source; the vertex shader (a
/// fullscreen-quad via `vertex_index`) is prepended automatically.
pub fn create_wgpu_filter_pipeline(
    state: &WgpuRenderState,
    filter_state: &WgpuFilterState,
    fragment_wgsl: &str,
    blend: WgpuBlendMode,
) -> WgpuFilterPipeline {
    build_pipeline(state, filter_state, fragment_wgsl, blend, 1)
}

/// Allocates the per-context filter infrastructure for `state`: the uniform ring
/// buffer, shared bind-group layouts, the linear sampler, and an empty texture
/// bind-group cache.
pub fn create_wgpu_filter_state(state: &WgpuRenderState) -> WgpuFilterState {
    let device = &state.device;

    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-filter-uniform-ring"),
        size: RING_SLOTS * RING_STRIDE,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // minBindingSize omitted (None): the bound range size (uniform_stride) is validated at draw
    // time, so filters with structs of any size up to the stride share this one layout.
    let uniform_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-filter-uniform-bgl"),
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
        label: Some("flight-wgpu-filter-uniform-bind-group"),
        layout: &uniform_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &uniform_buffer,
                offset: 0,
                size: wgpu::BufferSize::new(RING_STRIDE),
            }),
        }],
    });

    let texture_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-filter-texture-bgl"),
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
        label: Some("flight-wgpu-filter-sampler"),
        min_filter: wgpu::FilterMode::Linear,
        mag_filter: wgpu::FilterMode::Linear,
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        ..Default::default()
    });

    WgpuFilterState {
        uniform_buffer,
        uniform_data: vec![0u8; (RING_SLOTS * RING_STRIDE) as usize],
        uniform_offset: 0,
        uniform_stride: RING_STRIDE,
        uniform_slots: RING_SLOTS,
        uniform_bind_group_layout,
        uniform_bind_group,
        texture_bind_group_layout,
        texture_bind_groups: HashMap::new(),
        sampler,
        format: state.format,

        tint_pipeline: None,
        invert_tint_pipeline: None,
        blit_pipeline: None,
        blit_offset_pipeline: None,
        inner_clip_pipeline: None,
        box_blur_pipeline: None,
        gaussian_blur_pipeline: None,
        color_matrix_pipeline: None,
        convolution_pipeline: None,
        displacement_map_pipeline: None,
        median_pipeline: None,
        pixelate_pipeline: None,
        sharpen_pipeline: None,
        gradient_lookup_pipeline: None,
        gradient_bevel_encode_pipeline: None,
        gradient_bevel_apply_pipeline: None,
    }
}

/// Compiles a triple-source WGSL filter pipeline
/// (source0 = group 1, source1 = group 2, source2 = group 3).
pub fn create_wgpu_triple_source_pipeline(
    state: &WgpuRenderState,
    filter_state: &WgpuFilterState,
    fragment_wgsl: &str,
    blend: WgpuBlendMode,
) -> WgpuFilterPipeline {
    build_pipeline(state, filter_state, fragment_wgsl, blend, 3)
}

/// Frees the uniform ring buffer owned by `filter_state`. The bind-group layouts,
/// sampler, and cached bind groups are GC-style wgpu objects released on drop.
pub fn destroy_wgpu_filter_state(filter_state: &mut WgpuFilterState) {
    filter_state.uniform_buffer.destroy();
    filter_state.texture_bind_groups.clear();
}

/// Draws a full-screen pass reading from two source textures.
/// source0 = group 1, source1 = group 2.
pub fn draw_wgpu_dual_source_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source0: &WgpuRenderTarget,
    source1: &WgpuRenderTarget,
    dest: Option<&WgpuRenderTarget>,
    pipeline: &mut WgpuFilterPipeline,
    set_uniforms: impl FnOnce(&mut WgpuUniformSlot),
) {
    draw_wgpu_views_pass(
        state,
        filter_state,
        &[&source0.view, &source1.view],
        dest,
        pipeline,
        set_uniforms,
    );
}

/// Draws a full-screen pass reading from two source texture *views*.
/// source0 = group 1, source1 = group 2.
///
/// Like [`draw_wgpu_dual_source_pass`] but each source is a [`wgpu::TextureView`]
/// rather than a full [`WgpuRenderTarget`], so a caller can bind a raw G-buffer
/// view (a velocity texture) that is not a pooled render target as the second
/// source. The pass reads only the views, matching the TS recipe that wraps a
/// raw `GPUTexture` view as a minimal second source.
pub fn draw_wgpu_dual_source_views_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source0: &wgpu::TextureView,
    source1: &wgpu::TextureView,
    dest: Option<&WgpuRenderTarget>,
    pipeline: &mut WgpuFilterPipeline,
    set_uniforms: impl FnOnce(&mut WgpuUniformSlot),
) {
    draw_wgpu_views_pass(
        state,
        filter_state,
        &[source0, source1],
        dest,
        pipeline,
        set_uniforms,
    );
}

/// Draws a full-screen filter pass: reads from `source` (group 1), writes to `dest`.
///
/// `set_uniforms` is called with `f32` and `i32` views into the current
/// ring-buffer slot. `dest = None` targets the canvas surface. Blend is
/// premultiplied-alpha compositing unless the pipeline was built with `Replace`.
/// Ends any active render pass; does not restore it.
pub fn draw_wgpu_filter_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: Option<&WgpuRenderTarget>,
    pipeline: &mut WgpuFilterPipeline,
    set_uniforms: impl FnOnce(&mut WgpuUniformSlot),
) {
    draw_wgpu_views_pass(
        state,
        filter_state,
        &[&source.view],
        dest,
        pipeline,
        set_uniforms,
    );
}

/// Draws a full-screen pass reading from three source textures.
/// source0 = group 1, source1 = group 2, source2 = group 3.
pub fn draw_wgpu_triple_source_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source0: &WgpuRenderTarget,
    source1: &WgpuRenderTarget,
    source2: &WgpuRenderTarget,
    dest: Option<&WgpuRenderTarget>,
    pipeline: &mut WgpuFilterPipeline,
    set_uniforms: impl FnOnce(&mut WgpuUniformSlot),
) {
    draw_wgpu_views_pass(
        state,
        filter_state,
        &[&source0.view, &source1.view, &source2.view],
        dest,
        pipeline,
        set_uniforms,
    );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Draws a fullscreen filter pass binding `source_views` to texture groups 1.. in order, with the
// shared uniform group at group 0. The backbone for all the public draw functions and the
// gradient filters (which bind a transient gradient ramp view among the source views).
//
// `dest = None` targets the canvas view; otherwise the target's view and format are used.
pub(crate) fn draw_wgpu_views_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source_views: &[&wgpu::TextureView],
    dest: Option<&WgpuRenderTarget>,
    pipeline: &mut WgpuFilterPipeline,
    set_uniforms: impl FnOnce(&mut WgpuUniformSlot),
) {
    let slot_offset = acquire_uniform_slot(filter_state);
    write_uniform_slot(state, filter_state, slot_offset, set_uniforms);

    let mut ids: Vec<wgpu::Id<wgpu::TextureView>> = Vec::with_capacity(source_views.len());
    for view in source_views {
        ensure_texture_bind_group(state, filter_state, view);
        ids.push(view.global_id());
    }

    resolve_filter_variant(state, filter_state, pipeline, dest);
    let target_format = dest.map(|d| d.format).unwrap_or(filter_state.format);
    begin_filter_pass(state, dest, wgpu::LoadOp::Load);
    let pipeline_handle = pipeline_for_format(pipeline, filter_state.format, target_format);
    if let Some(pass) = get_wgpu_render_state_runtime_mut(state)
        .render_pass
        .as_mut()
    {
        pass.set_pipeline(pipeline_handle);
        pass.set_bind_group(0, &filter_state.uniform_bind_group, &[slot_offset as u32]);
        for (i, id) in ids.iter().enumerate() {
            pass.set_bind_group((i + 1) as u32, &filter_state.texture_bind_groups[id], &[]);
        }
        pass.draw(0..6, 0..1);
    }
    end_filter_pass(state);
}

// Premultiplied-alpha compositing blend state, matching WebGL's ONE + ONE_MINUS_SRC_ALPHA.
fn premul_blend() -> wgpu::BlendState {
    wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
    }
}

// Opaque / replace blend: writes the filter result directly without compositing.
fn replace_blend() -> wgpu::BlendState {
    wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::Zero,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::Zero,
            operation: wgpu::BlendOperation::Add,
        },
    }
}

fn blend_state_for(mode: WgpuBlendMode) -> wgpu::BlendState {
    match mode {
        WgpuBlendMode::Premul => premul_blend(),
        WgpuBlendMode::Replace => replace_blend(),
    }
}

// Compiles a filter pipeline whose pipeline layout has `source_groups` texture bind groups
// after the shared uniform group. The default `pipeline` targets the filter state's canvas
// format; additional variants are compiled on demand by `resolve_filter_variant`.
fn build_pipeline(
    state: &WgpuRenderState,
    filter_state: &WgpuFilterState,
    fragment_wgsl: &str,
    blend: WgpuBlendMode,
    source_groups: usize,
) -> WgpuFilterPipeline {
    let code = format!("{FILTER_VERTEX_WGSL}{fragment_wgsl}");
    let shader_module = state
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("flight-wgpu-filter-shader"),
            source: wgpu::ShaderSource::Wgsl(code.into()),
        });

    let pipeline = compile_filter_pipeline(
        &state.device,
        filter_state,
        &shader_module,
        blend,
        source_groups,
        filter_state.format,
    );

    WgpuFilterPipeline {
        pipeline,
        blend_mode: blend,
        variants: HashMap::new(),
        shader_module,
        source_groups,
    }
}

// Compiles a single render pipeline variant for `format`. The pipeline layout is the shared
// uniform group followed by `source_groups` copies of the shared texture bind-group layout.
fn compile_filter_pipeline(
    device: &wgpu::Device,
    filter_state: &WgpuFilterState,
    shader_module: &wgpu::ShaderModule,
    blend: WgpuBlendMode,
    source_groups: usize,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let mut bind_group_layouts: Vec<&wgpu::BindGroupLayout> = Vec::with_capacity(source_groups + 1);
    bind_group_layouts.push(&filter_state.uniform_bind_group_layout);
    for _ in 0..source_groups {
        bind_group_layouts.push(&filter_state.texture_bind_group_layout);
    }
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-filter-pipeline-layout"),
        bind_group_layouts: &bind_group_layouts,
        push_constant_ranges: &[],
    });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-wgpu-filter-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: shader_module,
            entry_point: "vs_main",
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[],
        },
        fragment: Some(wgpu::FragmentState {
            module: shader_module,
            entry_point: "fs_main",
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(blend_state_for(blend)),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

// Ensures `pipeline.variants` holds a variant for the destination's color format, compiling one
// on demand. A None dest or a dest already in the canvas format needs no variant (the default
// `pipeline` matches). This lets a filter built for the canvas format draw into an HDR
// (rgba16float) effect target without an attachment-format mismatch.
fn resolve_filter_variant(
    state: &WgpuRenderState,
    filter_state: &WgpuFilterState,
    pipeline: &mut WgpuFilterPipeline,
    dest: Option<&WgpuRenderTarget>,
) {
    let canvas_format = filter_state.format;
    let target_format = dest.map(|d| d.format).unwrap_or(canvas_format);
    if target_format == canvas_format || pipeline.variants.contains_key(&target_format) {
        return;
    }
    let variant = compile_filter_pipeline(
        &state.device,
        filter_state,
        &pipeline.shader_module,
        pipeline.blend_mode,
        pipeline.source_groups,
        target_format,
    );
    pipeline.variants.insert(target_format, variant);
}

// Returns the pipeline handle matching `target_format`: the default pipeline when the target is
// the canvas format, otherwise the cached variant. `resolve_filter_variant` must have run first.
fn pipeline_for_format<'p>(
    pipeline: &'p WgpuFilterPipeline,
    canvas_format: wgpu::TextureFormat,
    target_format: wgpu::TextureFormat,
) -> &'p wgpu::RenderPipeline {
    if target_format == canvas_format {
        &pipeline.pipeline
    } else {
        &pipeline.variants[&target_format]
    }
}

// Acquires the next ring-buffer slot offset, wrapping back to 0 after the last slot.
fn acquire_uniform_slot(filter_state: &mut WgpuFilterState) -> u64 {
    let offset = filter_state.uniform_offset;
    filter_state.uniform_offset = (offset + filter_state.uniform_stride)
        % (filter_state.uniform_slots * filter_state.uniform_stride);
    offset
}

// Fills the current ring-buffer slot via the caller's `set_uniforms` closure (given f32 and i32
// views aliasing the same bytes) then uploads exactly that slot to the GPU buffer.
fn write_uniform_slot(
    state: &WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    slot_offset: u64,
    set_uniforms: impl FnOnce(&mut WgpuUniformSlot),
) {
    let start = slot_offset as usize;
    let len = filter_state.uniform_stride as usize;
    let bytes = &mut filter_state.uniform_data[start..start + len];

    // Zero the slot before the caller fills it, so unwritten fields (padding, optional fields)
    // upload as zero rather than stale bytes from a previous occupant of this ring slot.
    bytes.fill(0);
    {
        let mut slot = WgpuUniformSlot { bytes: &mut *bytes };
        set_uniforms(&mut slot);
    }

    state
        .queue
        .write_buffer(&filter_state.uniform_buffer, slot_offset, bytes);
}

// Ensures a texture bind group for `view` exists in the cache, keyed by view identity.
fn ensure_texture_bind_group(
    state: &WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    view: &wgpu::TextureView,
) {
    let id = view.global_id();
    if filter_state.texture_bind_groups.contains_key(&id) {
        return;
    }
    let bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("flight-wgpu-filter-texture-bind-group"),
        layout: &filter_state.texture_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&filter_state.sampler),
            },
        ],
    });
    filter_state.texture_bind_groups.insert(id, bind_group);
}

// Begins a filter render pass into `dest` (or the canvas view when None) with the given load op.
// Ends any active render pass first. The pass is stored on the runtime with a forgotten lifetime;
// the command encoder is kept alive for the frame, so this is sound within the frame's scope.
//
// # Panics
// Panics if no command encoder is active — a programmer error: `render_wgpu_background` must run
// first to open the frame's command encoder.
pub(crate) fn begin_filter_pass(
    state: &mut WgpuRenderState,
    dest: Option<&WgpuRenderTarget>,
    load_op: wgpu::LoadOp<wgpu::Color>,
) {
    let surface_width = state.surface_width;
    let surface_height = state.surface_height;
    let runtime = get_wgpu_render_state_runtime_mut(state);

    if let Some(pass) = runtime.render_pass.take() {
        drop(pass);
    }
    assert!(
        runtime.command_encoder.is_some(),
        "No active command encoder — call render_wgpu_background first"
    );

    // Resolve the color view and viewport. A None dest targets the canvas view.
    let (width, height) = match dest {
        Some(target) => (target.width, target.height),
        None => match runtime.render_target_viewport {
            Some(vp) => (vp.width, vp.height),
            None => (surface_width, surface_height),
        },
    };

    // The dest view is borrowed for the begin; the canvas view is taken from the runtime and
    // restored after, since the runtime holds it by value while the encoder borrows mutably.
    let canvas_view = if dest.is_none() {
        runtime.canvas_texture_view.take()
    } else {
        None
    };
    let color_view: &wgpu::TextureView = match dest {
        Some(target) => &target.view,
        None => canvas_view
            .as_ref()
            .expect("No canvas texture view — call render_wgpu_background first"),
    };

    let encoder = runtime
        .command_encoder
        .as_mut()
        .expect("command encoder checked above");
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("flight-wgpu-filter-pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: color_view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: load_op,
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
    });
    pass.set_viewport(0.0, 0.0, width as f32, height as f32, 0.0, 1.0);
    runtime.render_pass = Some(pass.forget_lifetime());
    // Restore the canvas view only when it was taken (dest is None). For a
    // dest-targeted pass `canvas_view` is None and the slot was never touched, so
    // writing it here would clobber a live canvas view set by render_wgpu_background
    // — breaking a later present pass (dest = None) that depends on it. This matters
    // for the effects pipeline, which runs dest-targeted intermediate passes and
    // then a dest=None present in the same frame.
    if dest.is_none() {
        runtime.canvas_texture_view = canvas_view;
    }
}

// Ends the active filter render pass, if any.
pub(crate) fn end_filter_pass(state: &mut WgpuRenderState) {
    let runtime = get_wgpu_render_state_runtime_mut(state);
    if let Some(pass) = runtime.render_pass.take() {
        drop(pass);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // WgpuUniformSlot::from_bytes

    #[test]
    fn uniform_slot_from_bytes_writes_floats_and_ints_by_element_index() {
        let mut bytes = [0u8; 32];
        {
            let mut slot = WgpuUniformSlot::from_bytes(&mut bytes);
            slot.set_f32(0, 1.5);
            slot.set_i32(1, 7);
        }
        let f0 = f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let i1 = i32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        assert_eq!(f0, 1.5);
        assert_eq!(i1, 7);
    }

    // draw_wgpu_dual_source_views_pass

    #[test]
    fn draw_wgpu_dual_source_views_pass_binds_two_views_without_panicking() {
        // GPU-guarded: a real device is needed to compile a pipeline and encode a
        // pass. Without a command encoder open the pass begin would panic, so this
        // asserts the symbol composes; the rendered output is covered by the
        // effect-level functional/bloom checks.
        let Some(state) = try_create_filter_test_state() else {
            return;
        };
        let mut state = state;
        let mut filter_state = create_wgpu_filter_state(&state);
        // Source and dest must be distinct textures: a texture cannot be sampled
        // (RESOURCE) and a color target (COLOR_TARGET) in the same pass. Two views
        // from the source target satisfy the dual-source layout; a separate target
        // receives the write.
        let source =
            flighthq_render_wgpu::render_target::create_wgpu_render_target(&state, 8, 8, None);
        let dest =
            flighthq_render_wgpu::render_target::create_wgpu_render_target(&state, 8, 8, None);
        let v0 = source
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let v1 = source
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut pipeline = create_wgpu_dual_source_pipeline(
            &state,
            &filter_state,
            DUAL_TEST_WGSL,
            WgpuBlendMode::Replace,
        );
        // Open a command encoder so begin_filter_pass has one (mirrors a frame).
        flighthq_render_wgpu::background::render_wgpu_background(&mut state);
        draw_wgpu_dual_source_views_pass(
            &mut state,
            &mut filter_state,
            &v0,
            &v1,
            Some(&dest),
            &mut pipeline,
            |u| u.set_f32(0, 1.0),
        );
        flighthq_render_wgpu::background::submit_wgpu_render_pass(&mut state);
        flighthq_render_wgpu::render_target::destroy_wgpu_render_target(&mut state, source);
        flighthq_render_wgpu::render_target::destroy_wgpu_render_target(&mut state, dest);
        destroy_wgpu_filter_state(&mut filter_state);
    }

    fn try_create_filter_test_state() -> Option<WgpuRenderState> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::None,
            force_fallback_adapter: false,
            compatible_surface: None,
        }))
        .or_else(|| {
            pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::None,
                force_fallback_adapter: true,
                compatible_surface: None,
            }))
        })?;
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("flight-filters-wgpu-test-device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::default(),
            },
            None,
        ))
        .ok()?;
        let format = wgpu::TextureFormat::Rgba8Unorm;
        let options = flighthq_render_wgpu::render_state::WgpuRenderOptions {
            format: Some(format),
            ..Default::default()
        };
        Some(
            flighthq_render_wgpu::render_state::create_wgpu_render_state(
                device, queue, format, 16, 16, &options,
            ),
        )
    }

    const DUAL_TEST_WGSL: &str = r#"
@group(1) @binding(0) var t0 : texture_2d<f32>;
@group(1) @binding(1) var s0 : sampler;
@group(2) @binding(0) var t1 : texture_2d<f32>;
@group(2) @binding(1) var s1 : sampler;
@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(t0, s0, uv, 0.0) + textureSampleLevel(t1, s1, uv, 0.0);
}"#;

    // FILTER_VERTEX_WGSL

    #[test]
    fn filter_vertex_wgsl_declares_vertex_entry_point_and_uv_output() {
        assert!(FILTER_VERTEX_WGSL.contains("@vertex"));
        assert!(FILTER_VERTEX_WGSL.contains("fn vs_main"));
        assert!(FILTER_VERTEX_WGSL.contains("@location(0) uv : vec2f"));
        assert!(FILTER_VERTEX_WGSL.contains("@builtin(vertex_index)"));
    }

    // blend_state_for

    #[test]
    fn blend_state_for_premul_uses_one_minus_src_alpha() {
        let b = blend_state_for(WgpuBlendMode::Premul);
        assert_eq!(b.color.src_factor, wgpu::BlendFactor::One);
        assert_eq!(b.color.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
        assert_eq!(b.alpha.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
        assert_eq!(b.color.operation, wgpu::BlendOperation::Add);
    }

    #[test]
    fn blend_state_for_replace_uses_zero_dst() {
        let b = blend_state_for(WgpuBlendMode::Replace);
        assert_eq!(b.color.src_factor, wgpu::BlendFactor::One);
        assert_eq!(b.color.dst_factor, wgpu::BlendFactor::Zero);
        assert_eq!(b.alpha.dst_factor, wgpu::BlendFactor::Zero);
    }
}
