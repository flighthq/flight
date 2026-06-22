//! wgpu shader — WGSL source, bind group layouts, pipeline creation, and matrix
//! helpers.

use flighthq_types::blend::BlendMode;
use flighthq_types::geometry::Matrix;
use flighthq_types::material::ColorTransform;

use crate::render_state::WgpuRenderState;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Byte size of one uniform slot in the ring buffer.
/// Layout: 3×16-byte mat3 columns + alpha + hasColorTransform + 2 pad + 2×vec4f + 4+4 quad corners.
pub const UNIFORM_BYTE_SIZE: u64 = 128;

// WGSL bitmap shader: textured quad with optional color transform. Quad corners and texture
// coordinates are supplied through the uniform slot, so vertices are generated from the builtin
// vertex index (no vertex buffer). Index pattern is [0,1,2, 0,2,3] expanded to six positions.
const BITMAP_SHADER_SRC: &str = r#"
struct Uniforms {
  matrix : mat3x3f,
  alpha : f32,
  hasColorTransform : u32,
  _pad0 : f32,
  _pad1 : f32,
  colorMultiplier : vec4f,
  colorOffset : vec4f,
  x0 : f32, y0 : f32, x1 : f32, y1 : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOut {
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let x = select(uni.x0, uni.x1, xi);
  let y = select(uni.y0, uni.y1, yi);
  let u = select(uni.u0, uni.u1, xi);
  let v = select(uni.v0, uni.v1, yi);
  let p = uni.matrix * vec3f(x, y, 1.0);
  var out : VertexOut;
  out.position = vec4f(p.x, p.y, 0.0, 1.0);
  out.uv = vec2f(u, v);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.hasColorTransform != 0u && color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = clamp(color * uni.colorMultiplier + uni.colorOffset, vec4f(0.0), vec4f(1.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color * clamp(uni.alpha, 0.0, 1.0);
}
"#;

// Stencil-write shader: shares the vertex stage but the fragment writes no color (the pipeline
// disables the color write mask). Used to stamp a mask region into the stencil buffer.
const MASK_FRAGMENT_SRC: &str = r#"
struct Uniforms {
  matrix : mat3x3f,
  alpha : f32,
  hasColorTransform : u32,
  _pad0 : f32,
  _pad1 : f32,
  colorMultiplier : vec4f,
  colorOffset : vec4f,
  x0 : f32, y0 : f32, x1 : f32, y1 : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOut {
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let x = select(uni.x0, uni.x1, xi);
  let y = select(uni.y0, uni.y1, yi);
  let u = select(uni.u0, uni.u1, xi);
  let v = select(uni.v0, uni.v1, yi);
  let p = uni.matrix * vec3f(x, y, 1.0);
  var out : VertexOut;
  out.position = vec4f(p.x, p.y, 0.0, 1.0);
  out.uv = vec2f(u, v);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  let s = textureSample(tex, smp, in.uv);
  if (s.a <= 0.0) { discard; }
  return vec4f(0.0);
}
"#;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Cached bind-group layouts for the bitmap shader.
#[derive(Debug)]
pub struct WgpuBindGroupLayouts {
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
    pub texture_bind_group_layout: wgpu::BindGroupLayout,
}

/// Stencil write / read mode for a pipeline.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum WgpuStencilMode {
    Normal,
    Masked,
    MaskWrite,
}

impl WgpuStencilMode {
    /// Stable string key for pipeline-cache identity.
    pub fn key(self) -> &'static str {
        match self {
            WgpuStencilMode::Normal => "normal",
            WgpuStencilMode::Masked => "masked",
            WgpuStencilMode::MaskWrite => "maskwrite",
        }
    }
}

/// A compiled, bindable wgpu bitmap shader.
pub struct WgpuBitmapShader {
    pub pipeline: wgpu::RenderPipeline,
    pub pipeline_layout: wgpu::PipelineLayout,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Creates and returns the bind group layouts for the bitmap shader.
pub fn create_wgpu_bind_group_layouts(device: &wgpu::Device) -> WgpuBindGroupLayouts {
    let uniform_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-uniform-bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: true,
                    min_binding_size: wgpu::BufferSize::new(UNIFORM_BYTE_SIZE),
                },
                count: None,
            }],
        });

    let texture_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-texture-bgl"),
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

    WgpuBindGroupLayouts {
        uniform_bind_group_layout,
        texture_bind_group_layout,
    }
}

/// Creates a `wgpu::PipelineLayout` from the two bind-group layouts.
pub fn create_wgpu_pipeline_layout(
    device: &wgpu::Device,
    uniform_layout: &wgpu::BindGroupLayout,
    texture_layout: &wgpu::BindGroupLayout,
) -> wgpu::PipelineLayout {
    device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-bitmap-pipeline-layout"),
        bind_group_layouts: &[uniform_layout, texture_layout],
        push_constant_ranges: &[],
    })
}

/// Returns the active `RenderPipeline`, keyed on current blend mode, stencil
/// mode, and color-attachment format. Creates and caches the pipeline on the
/// first request for a given key.
pub fn get_active_wgpu_pipeline(state: &mut WgpuRenderState) -> &wgpu::RenderPipeline {
    let stencil_mode = if state.runtime.mask_write_mode {
        WgpuStencilMode::MaskWrite
    } else if state.runtime.current_mask_depth > 0 {
        WgpuStencilMode::Masked
    } else {
        WgpuStencilMode::Normal
    };
    let blend_mode = state.runtime.current_blend_mode;
    get_wgpu_pipeline(state, blend_mode, stencil_mode)
}

/// Returns (or creates) the render pipeline for the given blend mode, stencil
/// mode, and format combination.
pub fn get_wgpu_pipeline(
    state: &mut WgpuRenderState,
    blend_mode: Option<BlendMode>,
    stencil_mode: WgpuStencilMode,
) -> &wgpu::RenderPipeline {
    // The pipeline bakes its color-attachment format, so key on the current target format too.
    let format = state.runtime.current_color_format.unwrap_or(state.format);
    let key = wgpu_pipeline_cache_key(blend_mode, stencil_mode, format);

    if !state.runtime.pipeline_cache.contains_key(&key) {
        let pipeline = create_wgpu_pipeline(
            &state.device,
            &state.runtime,
            blend_mode,
            stencil_mode,
            format,
        );
        state.runtime.pipeline_cache.insert(key.clone(), pipeline);
    }
    state
        .runtime
        .pipeline_cache
        .get(&key)
        .expect("pipeline was just inserted")
}

/// Pre-creates the most common pipelines (Normal blend, each stencil mode, the
/// default canvas format) to avoid first-draw stalls.
pub fn warm_wgpu_pipelines(state: &mut WgpuRenderState) {
    get_wgpu_pipeline(state, Some(BlendMode::Normal), WgpuStencilMode::Normal);
    get_wgpu_pipeline(state, Some(BlendMode::Normal), WgpuStencilMode::Masked);
    get_wgpu_pipeline(state, Some(BlendMode::Normal), WgpuStencilMode::MaskWrite);
}

/// Converts a 2D affine transform into a column-major mat3×3 for the WGSL
/// uniform buffer (each column padded to 16 bytes).
pub fn set_wgpu_matrix_from_transform(
    matrix_array: &mut [f32; 9],
    transform: &Matrix,
    viewport_width: u32,
    viewport_height: u32,
) {
    let iw = 2.0 / viewport_width as f32;
    let ih = 2.0 / viewport_height as f32;
    // Read all inputs into locals first so aliasing is safe.
    let a = transform.a;
    let b = transform.b;
    let c = transform.c;
    let d = transform.d;
    let tx = transform.tx;
    let ty = transform.ty;
    // col0
    matrix_array[0] = a * iw;
    matrix_array[1] = -b * ih;
    matrix_array[2] = 0.0;
    // col1
    matrix_array[3] = c * iw;
    matrix_array[4] = -d * ih;
    matrix_array[5] = 0.0;
    // col2
    matrix_array[6] = tx * iw - 1.0;
    matrix_array[7] = -ty * ih + 1.0;
    matrix_array[8] = 1.0;
}

/// Writes the standard uniform slot (matrix + alpha + color transform + quad
/// corners) into the ring buffer at the current offset and advances the offset.
///
/// Returns the byte offset of the slot just written for use as the dynamic
/// offset in `set_bind_group`.
#[allow(clippy::too_many_arguments)]
pub fn write_wgpu_quad_uniforms(
    state: &mut WgpuRenderState,
    alpha: f32,
    transform: &Matrix,
    color_transform: Option<&ColorTransform>,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) -> u32 {
    let (vw, vh) = current_wgpu_viewport(state);
    let runtime = &mut state.runtime;
    let byte_offset = runtime.uniform_offset;
    let float_base = (byte_offset >> 2) as usize;

    set_wgpu_matrix_from_transform(&mut runtime.matrix_array, transform, vw, vh);
    write_wgpu_matrix_columns(runtime, float_base);

    let d = &mut runtime.uniform_data;
    d[float_base + 12] = alpha;
    runtime.uniform_data_u32[float_base + 13] = if color_transform.is_some() { 1 } else { 0 };
    let d = &mut runtime.uniform_data;
    d[float_base + 14] = 0.0;
    d[float_base + 15] = 0.0;
    d[float_base + 16] = color_transform.map(|c| c.red_multiplier).unwrap_or(1.0);
    d[float_base + 17] = color_transform.map(|c| c.green_multiplier).unwrap_or(1.0);
    d[float_base + 18] = color_transform.map(|c| c.blue_multiplier).unwrap_or(1.0);
    d[float_base + 19] = color_transform.map(|c| c.alpha_multiplier).unwrap_or(1.0);
    d[float_base + 20] = color_transform.map(|c| c.red_offset).unwrap_or(0.0) / 255.0;
    d[float_base + 21] = color_transform.map(|c| c.green_offset).unwrap_or(0.0) / 255.0;
    d[float_base + 22] = color_transform.map(|c| c.blue_offset).unwrap_or(0.0) / 255.0;
    d[float_base + 23] = color_transform.map(|c| c.alpha_offset).unwrap_or(0.0) / 255.0;
    d[float_base + 24] = x0;
    d[float_base + 25] = y0;
    d[float_base + 26] = x1;
    d[float_base + 27] = y1;
    d[float_base + 28] = u0;
    d[float_base + 29] = v0;
    d[float_base + 30] = u1;
    d[float_base + 31] = v1;

    runtime.uniform_offset += runtime.uniform_stride;
    byte_offset as u32
}

/// Writes a matrix-only uniform slot (no color transform).
#[allow(clippy::too_many_arguments)]
pub fn write_wgpu_matrix_only_uniforms(
    state: &mut WgpuRenderState,
    alpha: f32,
    transform: &Matrix,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) -> u32 {
    let (vw, vh) = current_wgpu_viewport(state);
    let runtime = &mut state.runtime;
    let byte_offset = runtime.uniform_offset;
    let float_base = (byte_offset >> 2) as usize;

    set_wgpu_matrix_from_transform(&mut runtime.matrix_array, transform, vw, vh);
    write_wgpu_matrix_columns(runtime, float_base);

    let d = &mut runtime.uniform_data;
    d[float_base + 12] = alpha;
    runtime.uniform_data_u32[float_base + 13] = 0;
    let d = &mut runtime.uniform_data;
    for i in 14..16 {
        d[float_base + i] = 0.0;
    }
    d[float_base + 16] = 1.0;
    d[float_base + 17] = 1.0;
    d[float_base + 18] = 1.0;
    d[float_base + 19] = 1.0;
    for i in 20..24 {
        d[float_base + i] = 0.0;
    }
    d[float_base + 24] = x0;
    d[float_base + 25] = y0;
    d[float_base + 26] = x1;
    d[float_base + 27] = y1;
    d[float_base + 28] = u0;
    d[float_base + 29] = v0;
    d[float_base + 30] = u1;
    d[float_base + 31] = v1;

    runtime.uniform_offset += runtime.uniform_stride;
    byte_offset as u32
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

pub(crate) fn wgpu_pipeline_cache_key(
    blend_mode: Option<BlendMode>,
    stencil_mode: WgpuStencilMode,
    format: wgpu::TextureFormat,
) -> String {
    let blend = match blend_mode {
        Some(mode) => format!("{mode:?}"),
        None => "null".to_string(),
    };
    format!("{}-{}-{:?}", blend, stencil_mode.key(), format)
}

/// Builds the `wgpu::StencilFaceState` for a stencil mode (shared by the bitmap
/// and solid-fill pipelines so both gate on the same mask stencil).
pub fn build_wgpu_stencil_face_state(stencil_mode: WgpuStencilMode) -> wgpu::StencilFaceState {
    match stencil_mode {
        WgpuStencilMode::MaskWrite => wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Always,
            pass_op: wgpu::StencilOperation::Replace,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
        },
        WgpuStencilMode::Masked => wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Equal,
            pass_op: wgpu::StencilOperation::Keep,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
        },
        WgpuStencilMode::Normal => wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Always,
            pass_op: wgpu::StencilOperation::Keep,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
        },
    }
}

fn create_wgpu_pipeline(
    device: &wgpu::Device,
    runtime: &crate::render_state::WgpuRenderStateRuntime,
    blend_mode: Option<BlendMode>,
    stencil_mode: WgpuStencilMode,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let blend = blend_mode
        .and_then(wgpu_blend_state)
        .unwrap_or_else(normal_wgpu_blend_state);
    let is_mask_write = stencil_mode == WgpuStencilMode::MaskWrite;
    let stencil_face = build_wgpu_stencil_face_state(stencil_mode);

    let shader_src = if is_mask_write {
        MASK_FRAGMENT_SRC
    } else {
        BITMAP_SHADER_SRC
    };
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-bitmap-shader"),
        source: wgpu::ShaderSource::Wgsl(shader_src.into()),
    });
    let layout = create_wgpu_pipeline_layout(
        device,
        &runtime.uniform_bind_group_layout,
        &runtime.texture_bind_group_layout,
    );

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-wgpu-bitmap-pipeline"),
        layout: Some(&layout),
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
                blend: if is_mask_write { None } else { Some(blend) },
                write_mask: if is_mask_write {
                    wgpu::ColorWrites::empty()
                } else {
                    wgpu::ColorWrites::ALL
                },
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
            stencil: wgpu::StencilState {
                front: stencil_face,
                back: stencil_face,
                read_mask: 0xff,
                write_mask: if is_mask_write { 0xff } else { 0x00 },
            },
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

// Resolves the active viewport (off-screen render target if present, otherwise the surface).
fn current_wgpu_viewport(state: &WgpuRenderState) -> (u32, u32) {
    match state.runtime.render_target_viewport {
        Some(vp) => (vp.width.max(1), vp.height.max(1)),
        None => (state.surface_width.max(1), state.surface_height.max(1)),
    }
}

/// Maps a `BlendMode` to a `wgpu::BlendState`. Returns `None` for modes that have no
/// fixed-function blend equivalent (they fall back to normal blending at the call site).
pub(crate) fn wgpu_blend_state(blend_mode: BlendMode) -> Option<wgpu::BlendState> {
    match blend_mode {
        BlendMode::Add => Some(wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
        }),
        BlendMode::Layer | BlendMode::Normal => Some(normal_wgpu_blend_state()),
        _ => None,
    }
}

pub(crate) fn normal_wgpu_blend_state() -> wgpu::BlendState {
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

// Writes the padded mat3x3 columns (12 floats: 3 columns × 4 floats each) from matrix_array.
fn write_wgpu_matrix_columns(
    runtime: &mut crate::render_state::WgpuRenderStateRuntime,
    float_base: usize,
) {
    let m = runtime.matrix_array;
    let d = &mut runtime.uniform_data;
    d[float_base] = m[0];
    d[float_base + 1] = m[1];
    d[float_base + 2] = m[2];
    d[float_base + 3] = 0.0;
    d[float_base + 4] = m[3];
    d[float_base + 5] = m[4];
    d[float_base + 6] = m[5];
    d[float_base + 7] = 0.0;
    d[float_base + 8] = m[6];
    d[float_base + 9] = m[7];
    d[float_base + 10] = m[8];
    d[float_base + 11] = 0.0;
}

#[cfg(test)]
mod tests {
    use super::*;

    // UNIFORM_BYTE_SIZE

    #[test]
    fn uniform_byte_size_is_128() {
        assert_eq!(UNIFORM_BYTE_SIZE, 128);
    }

    // bitmap shader source

    #[test]
    fn bitmap_shader_src_declares_stages_and_uniforms() {
        assert!(BITMAP_SHADER_SRC.contains("@vertex"));
        assert!(BITMAP_SHADER_SRC.contains("@fragment"));
        assert!(BITMAP_SHADER_SRC.contains("fn vs_main"));
        assert!(BITMAP_SHADER_SRC.contains("fn fs_main"));
        assert!(BITMAP_SHADER_SRC.contains("var<uniform> uni : Uniforms"));
        assert!(BITMAP_SHADER_SRC.contains("matrix : mat3x3f"));
        assert!(BITMAP_SHADER_SRC.contains("hasColorTransform : u32"));
        assert!(BITMAP_SHADER_SRC.contains("var tex : texture_2d<f32>"));
        assert!(BITMAP_SHADER_SRC.contains("var smp : sampler"));
    }

    #[test]
    fn mask_fragment_src_writes_no_color() {
        assert!(MASK_FRAGMENT_SRC.contains("return vec4f(0.0)"));
        assert!(MASK_FRAGMENT_SRC.contains("fn fs_main"));
    }

    // wgpu_pipeline_cache_key

    #[test]
    fn wgpu_pipeline_cache_key_distinguishes_stencil_modes() {
        let normal = wgpu_pipeline_cache_key(
            None,
            WgpuStencilMode::Normal,
            wgpu::TextureFormat::Bgra8Unorm,
        );
        let maskwrite = wgpu_pipeline_cache_key(
            None,
            WgpuStencilMode::MaskWrite,
            wgpu::TextureFormat::Bgra8Unorm,
        );
        assert_ne!(normal, maskwrite);
        assert!(normal.contains("null"));
        assert!(normal.contains("normal"));
        assert!(maskwrite.contains("maskwrite"));
    }

    #[test]
    fn wgpu_pipeline_cache_key_distinguishes_blend_modes() {
        let add = wgpu_pipeline_cache_key(
            Some(BlendMode::Add),
            WgpuStencilMode::Normal,
            wgpu::TextureFormat::Bgra8Unorm,
        );
        let normal = wgpu_pipeline_cache_key(
            Some(BlendMode::Normal),
            WgpuStencilMode::Normal,
            wgpu::TextureFormat::Bgra8Unorm,
        );
        assert_ne!(add, normal);
    }

    #[test]
    fn wgpu_pipeline_cache_key_distinguishes_formats() {
        let bgra = wgpu_pipeline_cache_key(
            None,
            WgpuStencilMode::Normal,
            wgpu::TextureFormat::Bgra8Unorm,
        );
        let hdr = wgpu_pipeline_cache_key(
            None,
            WgpuStencilMode::Normal,
            wgpu::TextureFormat::Rgba16Float,
        );
        assert_ne!(bgra, hdr);
    }

    // build_wgpu_stencil_face_state

    #[test]
    fn build_wgpu_stencil_face_state_maskwrite_replaces() {
        let face = build_wgpu_stencil_face_state(WgpuStencilMode::MaskWrite);
        assert_eq!(face.compare, wgpu::CompareFunction::Always);
        assert_eq!(face.pass_op, wgpu::StencilOperation::Replace);
    }

    #[test]
    fn build_wgpu_stencil_face_state_masked_compares_equal() {
        let face = build_wgpu_stencil_face_state(WgpuStencilMode::Masked);
        assert_eq!(face.compare, wgpu::CompareFunction::Equal);
        assert_eq!(face.pass_op, wgpu::StencilOperation::Keep);
    }

    #[test]
    fn build_wgpu_stencil_face_state_normal_keeps() {
        let face = build_wgpu_stencil_face_state(WgpuStencilMode::Normal);
        assert_eq!(face.compare, wgpu::CompareFunction::Always);
        assert_eq!(face.pass_op, wgpu::StencilOperation::Keep);
    }

    // set_wgpu_matrix_from_transform

    #[test]
    fn set_wgpu_matrix_from_transform_builds_clip_space_identity() {
        let mut m = [0.0f32; 9];
        let t = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        };
        set_wgpu_matrix_from_transform(&mut m, &t, 2, 2);
        assert!((m[0] - 1.0).abs() < 1e-5);
        assert!((m[4] - -1.0).abs() < 1e-5);
        assert!((m[6] - -1.0).abs() < 1e-5);
        assert!((m[7] - 1.0).abs() < 1e-5);
        assert!((m[8] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn set_wgpu_matrix_from_transform_scales_by_viewport() {
        let mut m = [0.0f32; 9];
        let t = Matrix {
            a: 2.0,
            b: 0.0,
            c: 0.0,
            d: 2.0,
            tx: 100.0,
            ty: 50.0,
        };
        set_wgpu_matrix_from_transform(&mut m, &t, 400, 300);
        assert!((m[0] - 2.0 * (2.0 / 400.0)).abs() < 1e-6);
        assert!((m[3] - 0.0).abs() < 1e-6);
        assert!((m[6] - (100.0 * (2.0 / 400.0) - 1.0)).abs() < 1e-6);
    }

    // wgpu_blend_state

    #[test]
    fn wgpu_blend_state_add_uses_one_one() {
        let blend = wgpu_blend_state(BlendMode::Add).expect("add has a blend state");
        assert_eq!(blend.color.src_factor, wgpu::BlendFactor::One);
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::One);
        assert_eq!(blend.color.operation, wgpu::BlendOperation::Add);
    }

    #[test]
    fn wgpu_blend_state_normal_is_premultiplied_over() {
        let blend = wgpu_blend_state(BlendMode::Normal).expect("normal has a blend state");
        assert_eq!(blend.color.src_factor, wgpu::BlendFactor::One);
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::OneMinusSrcAlpha);
    }

    #[test]
    fn wgpu_blend_state_unsupported_modes_return_none() {
        assert!(wgpu_blend_state(BlendMode::Multiply).is_none());
        assert!(wgpu_blend_state(BlendMode::Screen).is_none());
        assert!(wgpu_blend_state(BlendMode::Shader).is_none());
    }
}
