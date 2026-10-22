// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! The 2D bitmap shader, blend states, bind-group layouts, pipeline cache and per-draw uniform ring
//! writes (TS `wgpuShader.ts`). The WGSL is the source text verbatim.

use std::num::NonZeroU64;

use flight_geometry::Matrix;
use flight_materials::{
    BLEND_MODE_ADD, BLEND_MODE_DARKEN, BLEND_MODE_LIGHTEN, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL,
    BLEND_MODE_SCREEN, BlendMode, ColorScaleBias,
};

use crate::types::*;
use crate::wgpu_command_observer::{
    WgpuCommandRecord, WgpuRenderPipelineRecord, record_wgpu_command,
};
use crate::wgpu_render_pass::get_wgpu_render_pass_viewport;
use crate::wgpu_render_state::{
    get_wgpu_render_state_device_resources, get_wgpu_render_state_native_device,
};

// Uniform buffer layout (per-draw slot in the ring, 256-byte aligned):
//   offset  0–47 : mat3x3f matrix (3 columns × 16 bytes each due to vec3 padding)
//   offset 48    : f32 alpha
//   offset 52    : u32 hasColorScaleBias
//   offset 56    : u32 straightTextureAlpha
//   offset 60    : f32 padding
//   offset 64–79 : vec4f colorScale
//   offset 80–95 : vec4f colorBias
//   offset 96–111: f32 x0, y0, x1, y1 (quad pixel-space corners)
//   offset 112–127: f32 u0, v0, u1, v1 (texture coordinates)
// Total used: 128 bytes; slot size: minUniformBufferOffsetAlignment (≥256)
pub const UNIFORM_BYTE_SIZE: u32 = 128;

const BITMAP_SHADER_SRC: &str = r#"
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

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

// Quad corner order matching index pattern [0,1,2, 0,2,3]:
//   vi 0 → corner (x0,y0,u0,v0)
//   vi 1 → corner (x1,y0,u1,v0)
//   vi 2 → corner (x1,y1,u1,v1)
//   vi 3 → corner (x0,y0,u0,v0)  [repeated]
//   vi 4 → corner (x1,y1,u1,v1)  [repeated]
//   vi 5 → corner (x0,y1,u0,v1)

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
  if (uni.straightTextureAlpha != 0u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  if (uni.hasColorScaleBias != 0u && color.a > 0.0) {
    // Unpremultiply, apply transform, repremultiply
    color = vec4f(color.rgb / color.a, color.a);
    color = clamp(color * uni.colorScale + uni.colorBias, vec4f(0.0), vec4f(1.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color * clamp(uni.alpha, 0.0, 1.0);
}
"#;

// Stencil-write pipeline: only writes to stencil, not color.
// Uses same vertex shader; fragment just discards to keep stencil logic in pipeline state.
const MASK_FRAGMENT_SRC: &str = r#"
struct Uniforms {
  matrix : mat3x3f,
  alpha : f32,
  hasColorScaleBias : u32,
  _pad0 : f32,
  _pad1 : f32,
  colorScale : vec4f,
  colorBias : vec4f,
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

/// Which stencil behavior a 2D pipeline bakes (TS `StencilMode`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuStencilMode {
    Masked,
    MaskWrite,
    Normal,
}

/// Creates the two shared 2D bind-group layouts: the dynamic-offset uniform slot and the
/// texture+sampler pair (TS `createWgpuBindGroupLayouts`).
pub fn create_wgpu_bind_group_layouts(device: &WgpuNativeDevice) -> WgpuBindGroupLayouts {
    return WgpuBindGroupLayouts::with_layouts(
        create_wgpu_texture_sampler_bind_group_layout(device),
        create_wgpu_uniform_bind_group_layout(device),
    );
}

// One blend component shared by both channels. WebGPU applies the alpha part of a color factor
// (e.g. 'dst' → Ad) in the alpha slot, so a single factor pair reproduces GL's non-separate
// blendFunc. For min/max/reverse-subtract the factors are ignored but must still be valid.
fn create_wgpu_blend_state(
    src_factor: wgpu::BlendFactor,
    dst_factor: wgpu::BlendFactor,
    operation: wgpu::BlendOperation,
) -> wgpu::BlendState {
    let component = wgpu::BlendComponent {
        src_factor,
        dst_factor,
        operation,
    };
    return wgpu::BlendState {
        color: component,
        alpha: component,
    };
}

/// Creates the two-group 2D pipeline layout (TS `createWgpuPipelineLayout`).
pub fn create_wgpu_pipeline_layout(
    device: &WgpuNativeDevice,
    uniform_bind_group_layout: &wgpu::BindGroupLayout,
    texture_bind_group_layout: &wgpu::BindGroupLayout,
) -> wgpu::PipelineLayout {
    return device
        .device
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[
                Some(uniform_bind_group_layout),
                Some(texture_bind_group_layout),
            ],
            immediate_size: 0,
        });
}

// The texture+sampler layout every 2D bitmap bind group and the fullscreen/mip/resolve passes use.
pub(crate) fn create_wgpu_texture_sampler_bind_group_layout(
    device: &WgpuNativeDevice,
) -> wgpu::BindGroupLayout {
    return device
        .device
        .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
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
}

// The per-draw uniform slot: one dynamic-offset uniform buffer visible to both stages.
fn create_wgpu_uniform_bind_group_layout(device: &WgpuNativeDevice) -> wgpu::BindGroupLayout {
    return device
        .device
        .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: true,
                    min_binding_size: NonZeroU64::new(UNIFORM_BYTE_SIZE as u64),
                },
                count: None,
            }],
        });
}

/// Writes freshly created shared layouts into `out` (TS `initializeWgpuBindGroupLayouts`).
pub fn initialize_wgpu_bind_group_layouts(
    out: &mut WgpuBindGroupLayouts,
    device: &WgpuNativeDevice,
) {
    out.uniform_bind_group_layout = create_wgpu_uniform_bind_group_layout(device);
    out.texture_bind_group_layout = create_wgpu_texture_sampler_bind_group_layout(device);
}

fn build_stencil_face_state(stencil_mode: WgpuStencilMode) -> wgpu::StencilFaceState {
    return match stencil_mode {
        WgpuStencilMode::MaskWrite => wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Always,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
            pass_op: wgpu::StencilOperation::Replace,
        },
        WgpuStencilMode::Masked => wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Equal,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
            pass_op: wgpu::StencilOperation::Keep,
        },
        WgpuStencilMode::Normal => wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Always,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
            pass_op: wgpu::StencilOperation::Keep,
        },
    };
}

/// The pipeline for the state's current blend and stencil mode (TS `getActiveWgpuPipeline`).
pub fn get_active_wgpu_pipeline(state: &mut WgpuRenderState) -> wgpu::RenderPipeline {
    let runtime = &state.runtime;
    let stencil_mode = if runtime.mask_write_mode {
        WgpuStencilMode::MaskWrite
    } else if runtime.current_mask_depth > 0 {
        WgpuStencilMode::Masked
    } else {
        WgpuStencilMode::Normal
    };
    let blend_mode = runtime.current_blend_mode.clone();
    return get_wgpu_pipeline(state, blend_mode.as_ref(), stencil_mode);
}

/// The fixed-function blend state for a node blend mode, shared by every immutable 2D pipeline
/// family (TS `getWgpuBlendState`). Unknown and shader-composited modes fall back to Normal.
///
/// Darken/Lighten are not exact under partial coverage: MIN/MAX do not distribute over
/// `(1-a)*dst + a*B(src, dst)`, so at zero alpha Darken wipes the backdrop to black. Multiply is
/// premultiplied: `src.rgb*dst + dst*(1-src.a)` leaves transparent pixels untouched.
pub fn get_wgpu_blend_state(blend_mode: Option<&BlendMode>) -> wgpu::BlendState {
    let normal = create_wgpu_blend_state(
        wgpu::BlendFactor::One,
        wgpu::BlendFactor::OneMinusSrcAlpha,
        wgpu::BlendOperation::Add,
    );
    let Some(blend_mode) = blend_mode else {
        return normal;
    };
    return match blend_mode.as_str() {
        BLEND_MODE_ADD => create_wgpu_blend_state(
            wgpu::BlendFactor::One,
            wgpu::BlendFactor::One,
            wgpu::BlendOperation::Add,
        ),
        BLEND_MODE_DARKEN => create_wgpu_blend_state(
            wgpu::BlendFactor::One,
            wgpu::BlendFactor::One,
            wgpu::BlendOperation::Min,
        ),
        BLEND_MODE_LIGHTEN => create_wgpu_blend_state(
            wgpu::BlendFactor::One,
            wgpu::BlendFactor::One,
            wgpu::BlendOperation::Max,
        ),
        BLEND_MODE_MULTIPLY => create_wgpu_blend_state(
            wgpu::BlendFactor::Dst,
            wgpu::BlendFactor::OneMinusSrcAlpha,
            wgpu::BlendOperation::Add,
        ),
        BLEND_MODE_NORMAL => normal,
        BLEND_MODE_SCREEN => create_wgpu_blend_state(
            wgpu::BlendFactor::One,
            wgpu::BlendFactor::OneMinusSrc,
            wgpu::BlendOperation::Add,
        ),
        _ => normal,
    };
}

/// The cached 2D bitmap pipeline for a blend mode, stencil mode and the current color format (TS
/// `getWgpuPipeline`). The pipeline bakes its color-attachment format, so the key includes it.
pub fn get_wgpu_pipeline(
    state: &mut WgpuRenderState,
    blend_mode: Option<&BlendMode>,
    stencil_mode: WgpuStencilMode,
) -> wgpu::RenderPipeline {
    let format = state.runtime.current_color_format.unwrap_or(state.format);
    let key = format!(
        "{}-{}-{:?}",
        blend_mode.map(|mode| mode.as_str()).unwrap_or("null"),
        match stencil_mode {
            WgpuStencilMode::Masked => "masked",
            WgpuStencilMode::MaskWrite => "maskwrite",
            WgpuStencilMode::Normal => "normal",
        },
        format
    );
    let context = state.runtime.context.clone();
    if let Some(cached) = context.read().unwrap().pipeline_cache.get(&key) {
        return cached.clone();
    }

    let blend = get_wgpu_blend_state(blend_mode);
    let is_mask_write = stencil_mode == WgpuStencilMode::MaskWrite;
    let stencil_face = build_stencil_face_state(stencil_mode);
    let native = get_wgpu_render_state_native_device(state).clone();
    let resources = get_wgpu_render_state_device_resources(state);
    let shader_src = if is_mask_write {
        MASK_FRAGMENT_SRC
    } else {
        BITMAP_SHADER_SRC
    };
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(shader_src.into()),
        });
    let layout = create_wgpu_pipeline_layout(
        &native,
        &resources.uniform_bind_group_layout,
        &resources.texture_bind_group_layout,
    );
    let targets = [Some(wgpu::ColorTargetState {
        format,
        blend: if is_mask_write { None } else { Some(blend) },
        write_mask: if is_mask_write {
            wgpu::ColorWrites::empty()
        } else {
            wgpu::ColorWrites::ALL
        },
    })];
    let depth_stencil = wgpu::DepthStencilState {
        format: wgpu::TextureFormat::Depth24PlusStencil8,
        depth_write_enabled: Some(false),
        depth_compare: Some(wgpu::CompareFunction::Always),
        stencil: wgpu::StencilState {
            front: stencil_face,
            back: stencil_face,
            read_mask: 0xff,
            write_mask: if is_mask_write { 0xff } else { 0x00 },
        },
        bias: wgpu::DepthBiasState::default(),
    };
    let pipeline = native
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &targets,
            }),
            depth_stencil: Some(depth_stencil.clone()),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..wgpu::PrimitiveState::default()
            },
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

    record_wgpu_command(&native, || {
        return WgpuCommandRecord::CreateRenderPipeline(WgpuRenderPipelineRecord {
            depth_stencil: Some(depth_stencil.clone()),
            pipeline: pipeline.clone(),
            targets: targets.to_vec(),
        });
    });
    context
        .write()
        .unwrap()
        .pipeline_cache
        .insert(key, pipeline.clone());
    return pipeline;
}

/// Writes a column-major mat3x3 mapping pixel space to clip space for `t` over `viewport` (TS
/// `setWgpuMatrixFromTransform`).
pub fn set_wgpu_matrix_from_transform(
    matrix_array: &mut [f32; 9],
    t: &Matrix,
    viewport: &WgpuRenderPassViewport,
) {
    let iw = 2.0 / viewport.width;
    let ih = 2.0 / viewport.height;
    // Column-major mat3x3 with vec3-to-16-byte padding:
    // col0
    matrix_array[0] = t.a * iw;
    matrix_array[1] = -t.b * ih;
    matrix_array[2] = 0.0;
    // col1
    matrix_array[3] = t.c * iw;
    matrix_array[4] = -t.d * ih;
    matrix_array[5] = 0.0;
    // col2
    matrix_array[6] = t.tx * iw - 1.0;
    matrix_array[7] = -t.ty * ih + 1.0;
    matrix_array[8] = 1.0;
}

/// Writes a quad's uniforms with no color adjustment (TS `writeWgpuMatrixOnlyUniforms`); returns the
/// slot's byte offset.
// flight-lint: allow(conform-params) the source's renderProxy argument contributes only its alpha
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
    return write_wgpu_quad_uniforms(
        state, alpha, transform, None, x0, y0, x1, y1, u0, v0, u1, v1, false,
    );
}

/// Writes the standard uniforms (matrix, alpha, color adjustment, quad coordinates) into the ring at
/// the current offset, then advances by one slot (TS `writeWgpuQuadUniforms`). Returns the byte
/// offset of the slot written, the dynamic offset a draw binds. Integer fields share the float
/// ring's bytes (host byte order; see `explain_wgpu_uniform_endianness`).
// flight-lint: allow(conform-params) the source's renderProxy argument contributes only its alpha and transform
pub fn write_wgpu_quad_uniforms(
    state: &mut WgpuRenderState,
    alpha: f32,
    transform: &Matrix,
    color_scale_bias: Option<&ColorScaleBias>,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    straight_texture_alpha: bool,
) -> u32 {
    let viewport = get_wgpu_render_pass_viewport(state);
    let runtime = &mut state.runtime;
    let byte_offset = runtime.uniform_offset;
    let float_base = (byte_offset >> 2) as usize; // divide by 4
    set_wgpu_matrix_from_transform(&mut runtime.matrix_array, transform, &viewport);
    let matrix = runtime.matrix_array;
    let data = &mut runtime.uniform_data;

    // mat3x3 columns with per-column padding (4 floats each = 16 bytes):
    data[float_base] = matrix[0];
    data[float_base + 1] = matrix[1];
    data[float_base + 2] = matrix[2];
    data[float_base + 3] = 0.0;
    data[float_base + 4] = matrix[3];
    data[float_base + 5] = matrix[4];
    data[float_base + 6] = matrix[5];
    data[float_base + 7] = 0.0;
    data[float_base + 8] = matrix[6];
    data[float_base + 9] = matrix[7];
    data[float_base + 10] = matrix[8];
    data[float_base + 11] = 0.0;
    // alpha at float 12 (byte 48)
    data[float_base + 12] = alpha;
    // hasColorScaleBias at float 13 (byte 52), written as u32. The color adjustment comes from the
    // node's material (resolved by the caller); None is identity.
    data[float_base + 13] = f32::from_bits(u32::from(color_scale_bias.is_some()));
    // straightTextureAlpha at float 14 (byte 56): native compressed blocks retain straight RGB and the
    // display shader premultiplies their sample before color adjustments and fixed-function blend.
    data[float_base + 14] = f32::from_bits(u32::from(straight_texture_alpha));
    // padding float 15
    data[float_base + 15] = 0.0;
    // colorScale at float 16–19 (byte 64–79)
    data[float_base + 16] = color_scale_bias.map(|c| c.red_scale).unwrap_or(1.0);
    data[float_base + 17] = color_scale_bias.map(|c| c.green_scale).unwrap_or(1.0);
    data[float_base + 18] = color_scale_bias.map(|c| c.blue_scale).unwrap_or(1.0);
    data[float_base + 19] = color_scale_bias.map(|c| c.alpha_scale).unwrap_or(1.0);
    // colorBias at float 20–23 (byte 80–95)
    data[float_base + 20] = color_scale_bias.map(|c| c.red_bias).unwrap_or(0.0);
    data[float_base + 21] = color_scale_bias.map(|c| c.green_bias).unwrap_or(0.0);
    data[float_base + 22] = color_scale_bias.map(|c| c.blue_bias).unwrap_or(0.0);
    data[float_base + 23] = color_scale_bias.map(|c| c.alpha_bias).unwrap_or(0.0);
    // quad corners at float 24–31 (byte 96–127)
    data[float_base + 24] = x0;
    data[float_base + 25] = y0;
    data[float_base + 26] = x1;
    data[float_base + 27] = y1;
    data[float_base + 28] = u0;
    data[float_base + 29] = v0;
    data[float_base + 30] = u1;
    data[float_base + 31] = v1;

    runtime.uniform_offset += runtime.uniform_stride;
    return byte_offset;
}
