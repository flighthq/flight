// flight-lint: allow-file(contract-vocabulary) D17 the color-adjustment fold carries native wgpu modules, pipelines and render-wgpu runtime state
//! The opt-in color-adjustment accumulator and inline fold (TS
//! `wgpuColorAdjustmentMaterialFeature.ts`): a color adjustment folds into the quad batch as
//! per-instance storage data at @group(3) — replicated across the batch for a whole-batch tint, or
//! varied per instance — without ever splitting the batch. Until a state registers it, render
//! proxies stay unadjusted, the batch carries none of this module's WGSL, and recorded tints are
//! skipped.

use std::collections::HashMap;

use flight_render::{RenderProxy2D, enable_color_adjustments};
use flight_render_wgpu::{
    WgpuColorAdjustmentFlush, WgpuColorAdjustmentFlushData, WgpuColorAdjustmentFlushF32,
    WgpuColorAdjustmentFlushU32, WgpuColorAdjustmentMaterialFeature, WgpuColorScaleBiasInput,
    WgpuDeviceRuntime, WgpuRenderState, WgpuRenderStateRuntime, WgpuShapeMesh,
    WgpuShapeMeshBuffers, WgpuShapeMeshPipeline, get_wgpu_blend_state,
    get_wgpu_color_adjustment_material_feature, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

use crate::wgpu_quad_batch_writer::get_wgpu_quad_batch_prelude_wgsl;
use crate::wgpu_shape_mesh::{
    create_shape_mesh_bind_group_layout, create_shape_mesh_pipeline, draw_wgpu_shape_mesh_batch,
};

// Per-instance color-adjustment data (8 floats = 4 scale + 4 bias). Wgpu carries every tint through
// the per-instance storage buffer, so a whole-batch (uniform) tint is the same value on each
// instance — there is no separate hardware-uniform path.
const COLOR_SCALE_BIAS_FLOATS: usize = 8;
const COLOR_MATRIX_FLOATS: usize = 20;

// Color-adjustment fold modes for the active quad-batch writer. NONE keeps the base module; UNIFORM
// defers per-instance fill while one tint covers the whole batch; PER_INSTANCE packs a tint per
// instance.
const CT_MODE_NONE: u32 = 0;
const CT_MODE_UNIFORM: u32 = 1;
const CT_MODE_PACKED_TINT: u32 = 2;
const CT_MODE_PER_INSTANCE: u32 = 3;
const CT_MODE_MATRIX: u32 = 4;

// The backend's single color-adjustment shader chunk. The registered feature carries it to Standard
// 2D and promoted 3D family variants without making their lean compilers statically own the code.
const WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK: &str = r"
fn applyFlightColorAdjustment(color : vec4f, multiplier : vec4f, offset : vec4f) -> vec4f {
  return clamp(color * multiplier + offset, vec4f(0.0), vec4f(1.0));
}
";
const WGPU_COLOR_MATRIX_FRAGMENT_CHUNK: &str = r"
fn applyFlightColorMatrix(
  color : vec4f,
  row0 : vec4f,
  row1 : vec4f,
  row2 : vec4f,
  row3 : vec4f,
  offset : vec4f,
) -> vec4f {
  return clamp(vec4f(dot(row0, color), dot(row1, color), dot(row2, color), dot(row3, color)) + offset,
    vec4f(0.0), vec4f(1.0));
}
";

const SHAPE_MESH_COLOR_SCALE_BIAS_WGSL: &str = r"
struct ShapeMeshUniforms {
  matrix : mat3x3f,
  color : vec4f,
  colorScale : vec4f,
  colorBias : vec4f,
}
@group(0) @binding(0) var<uniform> u : ShapeMeshUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f {
  if (u.color.a <= 0.0) { discard; }
  var color = vec4f(u.color.rgb / u.color.a, u.color.a);
  color = applyFlightColorAdjustment(color, u.colorScale, u.colorBias);
  return vec4f(color.rgb * color.a, color.a);
}
";

const COLOR_SCALE_BIAS_WGSL: &str = r"
@group(3) @binding(0) var<storage, read> ctData : array<f32>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) ctMult : vec4f,
  @location(3) ctOff : vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  let b = ii * 8u;
  let ctMult = vec4f(ctData[b + 0u], ctData[b + 1u], ctData[b + 2u], ctData[b + 3u]);
  let ctOff = vec4f(ctData[b + 4u], ctData[b + 5u], ctData[b + 6u], ctData[b + 7u]);
  return VertexOut(bv.position, bv.uv, bv.alpha, ctMult, ctOff);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.straightTextureAlpha != 0u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = applyFlightColorAdjustment(color, in.ctMult, in.ctOff);
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
";

const PACKED_TINT_WGSL: &str = r"
@group(3) @binding(0) var<storage, read> tintData : array<u32>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) tint : vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  return VertexOut(bv.position, bv.uv, bv.alpha, unpack4x8unorm(tintData[ii]));
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.straightTextureAlpha != 0u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = applyFlightColorAdjustment(color, in.tint, vec4f(0.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
";

const COLOR_MATRIX_WGSL: &str = r"
@group(3) @binding(0) var<storage, read> ctData : array<f32>;
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) row0 : vec4f,
  @location(3) row1 : vec4f,
  @location(4) row2 : vec4f,
  @location(5) row3 : vec4f,
  @location(6) offset : vec4f,
}
@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  let b = ii * 20u;
  return VertexOut(
    bv.position, bv.uv, bv.alpha,
    vec4f(ctData[b], ctData[b + 1u], ctData[b + 2u], ctData[b + 3u]),
    vec4f(ctData[b + 4u], ctData[b + 5u], ctData[b + 6u], ctData[b + 7u]),
    vec4f(ctData[b + 8u], ctData[b + 9u], ctData[b + 10u], ctData[b + 11u]),
    vec4f(ctData[b + 12u], ctData[b + 13u], ctData[b + 14u], ctData[b + 15u]),
    vec4f(ctData[b + 16u], ctData[b + 17u], ctData[b + 18u], ctData[b + 19u]),
  );
}
@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.straightTextureAlpha != 0u) { color = vec4f(color.rgb * color.a, color.a); }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = applyFlightColorMatrix(color, in.row0, in.row1, in.row2, in.row3, in.offset);
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
";

static WGPU_COLOR_ADJUSTMENT_MATERIAL_FEATURE: WgpuColorAdjustmentMaterialFeature =
    WgpuColorAdjustmentMaterialFeature {
        fragment_shader_chunk: WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
        matrix_fragment_shader_chunk: WGPU_COLOR_MATRIX_FRAGMENT_CHUNK,
        draw_shape_meshes: Some(draw_wgpu_shape_meshes_color_scale_bias),
        record: record_wgpu_color_adjustment,
        resolve_flush: resolve_wgpu_color_adjustment_flush,
    };

fn color_matrix_module_slot(context: &mut WgpuDeviceRuntime) -> &mut Option<wgpu::ShaderModule> {
    return &mut context.color_matrix_module;
}

fn color_scale_bias_module_slot(
    context: &mut WgpuDeviceRuntime,
) -> &mut Option<wgpu::ShaderModule> {
    return &mut context.color_scale_bias_module;
}

// Draws tessellated solid fills through the same opt-in scale/bias fold as quad batches. A shape has
// one resolved node adjustment, so the value is uploaded once in each per-mesh uniform rather than
// as vertex data. The fragment shader preserves the unpremultiply → adjust → repremultiply order.
fn draw_wgpu_shape_meshes_color_scale_bias(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
    meshes: &[WgpuShapeMesh],
    buffers: &mut WgpuShapeMeshBuffers,
) {
    let color_scale_bias = render_proxy
        .color_scale_bias
        .as_ref()
        .expect("the shape fold runs only for a resolved ColorScaleBias");
    let mut uniform = [0.0_f32; 24];
    uniform[16] = color_scale_bias.red_scale;
    uniform[17] = color_scale_bias.green_scale;
    uniform[18] = color_scale_bias.blue_scale;
    uniform[19] = color_scale_bias.alpha_scale;
    uniform[20] = color_scale_bias.red_bias;
    uniform[21] = color_scale_bias.green_bias;
    uniform[22] = color_scale_bias.blue_bias;
    uniform[23] = color_scale_bias.alpha_bias;
    let pipeline_entry =
        ensure_wgpu_shape_mesh_color_scale_bias_pipeline(state, render_proxy.blend_mode.as_ref());
    let mut uniform_buffers = std::mem::take(&mut buffers.color_scale_bias_uniform_buffers);
    let mut bind_groups = std::mem::take(&mut buffers.color_scale_bias_bind_groups);
    draw_wgpu_shape_mesh_batch(
        state,
        render_proxy,
        meshes,
        buffers,
        &pipeline_entry,
        &mut uniform_buffers,
        &mut bind_groups,
        &mut uniform,
    );
    buffers.color_scale_bias_uniform_buffers = uniform_buffers;
    buffers.color_scale_bias_bind_groups = bind_groups;
}

// Grows the color-adjustment data array to hold `floats_needed` floats, preserving already-recorded
// per-instance data.
fn ensure_wgpu_color_scale_bias_capacity(
    runtime: &mut WgpuRenderStateRuntime,
    floats_needed: usize,
) {
    let existing_len = runtime
        .quad_batch_writer_color_scale_bias_data
        .as_ref()
        .map(|data| data.len());
    if existing_len.is_some_and(|len| floats_needed <= len) {
        return;
    }
    let new_size = floats_needed
        .max(existing_len.unwrap_or(0) * 2)
        .max(COLOR_SCALE_BIAS_FLOATS * 256);
    runtime
        .quad_batch_writer_color_scale_bias_data
        .get_or_insert_with(Vec::new)
        .resize(new_size, 0.0);
}

fn ensure_wgpu_shape_mesh_color_scale_bias_pipeline(
    state: &mut WgpuRenderState,
    blend_mode: Option<&flight_materials::BlendMode>,
) -> WgpuShapeMeshPipeline {
    let runtime = get_wgpu_render_state_runtime(state);
    let context = runtime.context.clone();
    let format = runtime.current_color_format.unwrap_or(state.format);
    let key = format!(
        "{:?}|{}",
        format,
        blend_mode.map(|mode| mode.as_str()).unwrap_or("null")
    );
    if let Some(existing) = context
        .read()
        .unwrap()
        .shape_mesh_color_scale_bias_pipelines
        .as_ref()
        .and_then(|cache| cache.get(&key))
    {
        return existing.clone();
    }

    let native = get_wgpu_render_state_native_device(state);
    let source =
        format!("{WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}{SHAPE_MESH_COLOR_SCALE_BIAS_WGSL}");
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
    let bind_group_layout = create_shape_mesh_bind_group_layout(state);
    let pipeline = create_shape_mesh_pipeline(
        state,
        &module,
        &bind_group_layout,
        format,
        get_wgpu_blend_state(blend_mode),
    );
    let created = WgpuShapeMeshPipeline {
        pipeline,
        bind_group_layout,
    };
    context
        .write()
        .unwrap()
        .shape_mesh_color_scale_bias_pipelines
        .get_or_insert_with(HashMap::new)
        .insert(key, created.clone());
    return created;
}

// Value equality for the whole-batch uniform check (the source short-circuits on reference identity,
// then compares all eight fields, or all twenty matrix values).
fn equals_recorded_color_scale_bias(
    a: Option<&WgpuColorScaleBiasInput>,
    b: Option<&WgpuColorScaleBiasInput>,
) -> bool {
    let (a, b) = match (a, b) {
        (None, None) => return true,
        (Some(a), Some(b)) => (a, b),
        _ => return false,
    };
    if is_color_matrix_data(Some(a)) || is_color_matrix_data(Some(b)) {
        let (WgpuColorScaleBiasInput::Values(a), WgpuColorScaleBiasInput::Values(b)) = (a, b)
        else {
            return false;
        };
        for i in 0..COLOR_MATRIX_FLOATS {
            if a.values.get(i) != b.values.get(i) {
                return false;
            }
        }
        return true;
    }
    for channel in 0..4 {
        if get_color_scale(a, channel) != get_color_scale(b, channel)
            || get_color_bias(a, channel) != get_color_bias(b, channel)
        {
            return false;
        }
    }
    return true;
}

fn fill_wgpu_quad_batch_writer_uniform_color_matrix(
    runtime: &mut WgpuRenderStateRuntime,
    matrix: &WgpuColorScaleBiasInput,
    count: usize,
) {
    for i in 0..count {
        write_wgpu_color_matrix_instance(runtime, Some(matrix), i);
    }
}

// Replicates a whole-batch uniform tint across `count` instances at flush time.
fn fill_wgpu_quad_batch_writer_uniform_color_scale_bias(
    runtime: &mut WgpuRenderStateRuntime,
    color_scale_bias: &WgpuColorScaleBiasInput,
    count: usize,
) {
    ensure_wgpu_color_scale_bias_capacity(runtime, count * COLOR_SCALE_BIAS_FLOATS);
    for i in 0..count {
        write_wgpu_color_scale_bias_instance(runtime, Some(color_scale_bias), i);
    }
}

fn fill_wgpu_quad_batch_writer_uniform_packed_tint(
    runtime: &mut WgpuRenderStateRuntime,
    rgba: u32,
    count: usize,
) {
    for i in 0..count {
        write_wgpu_packed_tint_instance(runtime, rgba, i);
    }
}

fn get_color_bias(value: &WgpuColorScaleBiasInput, channel: usize) -> f32 {
    return match value {
        WgpuColorScaleBiasInput::TintMaterialData(_) => 0.0,
        WgpuColorScaleBiasInput::ColorScaleBias(value) => match channel {
            0 => value.red_bias,
            1 => value.green_bias,
            2 => value.blue_bias,
            _ => value.alpha_bias,
        },
        WgpuColorScaleBiasInput::Values(values) => {
            values.values.get(channel * 5 + 4).copied().unwrap_or(0.0)
        }
    };
}

fn get_color_scale(value: &WgpuColorScaleBiasInput, channel: usize) -> f32 {
    return match value {
        WgpuColorScaleBiasInput::TintMaterialData(value) => {
            ((value.tint >> (24 - channel * 8)) & 0xff) as f32 / 255.0
        }
        WgpuColorScaleBiasInput::ColorScaleBias(value) => match channel {
            0 => value.red_scale,
            1 => value.green_scale,
            2 => value.blue_scale,
            _ => value.alpha_scale,
        },
        WgpuColorScaleBiasInput::Values(values) => values
            .values
            .get(channel * 5 + channel)
            .copied()
            .unwrap_or(1.0),
    };
}

// The packed `0xRRGGBBAA` tint a value reduces to, or `None` when it needs the full scale/bias form
// (any bias, or a scale outside [0, 1]). No value is white.
fn get_packed_tint(value: Option<&WgpuColorScaleBiasInput>) -> Option<u32> {
    let Some(value) = value else {
        return Some(0xffffffff);
    };
    return match value {
        WgpuColorScaleBiasInput::TintMaterialData(value) => Some(value.tint),
        WgpuColorScaleBiasInput::Values(_) => None,
        WgpuColorScaleBiasInput::ColorScaleBias(value) => {
            if value.red_bias != 0.0
                || value.green_bias != 0.0
                || value.blue_bias != 0.0
                || value.alpha_bias != 0.0
                || !(0.0..=1.0).contains(&value.red_scale)
                || !(0.0..=1.0).contains(&value.green_scale)
                || !(0.0..=1.0).contains(&value.blue_scale)
                || !(0.0..=1.0).contains(&value.alpha_scale)
            {
                return None;
            }
            Some(
                ((value.red_scale * 255.0).round() as u32) << 24
                    | ((value.green_scale * 255.0).round() as u32) << 16
                    | ((value.blue_scale * 255.0).round() as u32) << 8
                    | (value.alpha_scale * 255.0).round() as u32,
            )
        }
    };
}

fn get_wgpu_quad_batch_writer_color_matrix_module(state: &WgpuRenderState) -> wgpu::ShaderModule {
    return get_wgpu_quad_batch_writer_fold_module(
        state,
        WGPU_COLOR_MATRIX_FRAGMENT_CHUNK,
        COLOR_MATRIX_WGSL,
        color_matrix_module_slot,
    );
}

fn get_wgpu_quad_batch_writer_color_scale_bias_module(
    state: &WgpuRenderState,
) -> wgpu::ShaderModule {
    return get_wgpu_quad_batch_writer_fold_module(
        state,
        WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
        COLOR_SCALE_BIAS_WGSL,
        color_scale_bias_module_slot,
    );
}

// The folded per-instance module for one fold mode (cached per device): the base prelude, the fold
// chunk, and the mode's own vertex/fragment stages.
fn get_wgpu_quad_batch_writer_fold_module(
    state: &WgpuRenderState,
    chunk: &str,
    body: &str,
    slot: fn(&mut WgpuDeviceRuntime) -> &mut Option<wgpu::ShaderModule>,
) -> wgpu::ShaderModule {
    let context = get_wgpu_render_state_runtime(state).context.clone();
    if let Some(cached) = slot(&mut context.write().unwrap()) {
        return cached.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(
                (get_wgpu_quad_batch_prelude_wgsl() + chunk + body).into(),
            ),
        });
    *slot(&mut context.write().unwrap()) = Some(module.clone());
    return module;
}

fn get_wgpu_quad_batch_writer_packed_tint_module(state: &WgpuRenderState) -> wgpu::ShaderModule {
    return get_wgpu_quad_batch_writer_fold_module(
        state,
        WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
        PACKED_TINT_WGSL,
        packed_tint_module_slot,
    );
}

fn is_color_matrix_data(value: Option<&WgpuColorScaleBiasInput>) -> bool {
    return matches!(value, Some(WgpuColorScaleBiasInput::Values(_)));
}

fn packed_tint_module_slot(context: &mut WgpuDeviceRuntime) -> &mut Option<wgpu::ShaderModule> {
    return &mut context.packed_tint_module;
}

fn promote_wgpu_color_scale_bias_to_matrix(
    runtime: &mut WgpuRenderStateRuntime,
    instance_count: usize,
) {
    let affine = runtime
        .quad_batch_writer_color_scale_bias_data
        .clone()
        .expect("per-instance mode carries scale/bias data");
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_MATRIX);
    for i in 0..instance_count {
        write_wgpu_affine_values_as_color_matrix(runtime, &affine, i * COLOR_SCALE_BIAS_FLOATS, i);
    }
}

fn promote_wgpu_packed_tint_to_color_matrix(
    runtime: &mut WgpuRenderStateRuntime,
    instance_count: usize,
) {
    let packed = runtime
        .quad_batch_writer_color_tint_data
        .clone()
        .expect("packed-tint mode carries tint data");
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_MATRIX);
    for (i, word) in packed.iter().enumerate().take(instance_count) {
        write_wgpu_native_packed_tint_as_color_matrix(runtime, *word, i);
    }
}

fn promote_wgpu_packed_tint_to_color_scale_bias(
    runtime: &mut WgpuRenderStateRuntime,
    instance_count: usize,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PER_INSTANCE);
    let packed = runtime
        .quad_batch_writer_color_tint_data
        .clone()
        .expect("packed-tint mode carries tint data");
    for (i, word) in packed.iter().enumerate().take(instance_count) {
        write_wgpu_native_packed_tint_as_color_scale_bias(runtime, *word, i);
    }
}

fn promote_wgpu_quad_batch_writer_color_scale_bias_to_matrix(
    runtime: &mut WgpuRenderStateRuntime,
    instance_count: usize,
    fill: Option<&WgpuColorScaleBiasInput>,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_MATRIX);
    for i in 0..instance_count {
        write_wgpu_color_matrix_instance(runtime, fill, i);
    }
}

fn promote_wgpu_quad_batch_writer_color_scale_bias_to_packed_tint(
    runtime: &mut WgpuRenderStateRuntime,
    instance_count: usize,
    fill: Option<&WgpuColorScaleBiasInput>,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PACKED_TINT);
    let packed = get_packed_tint(fill).expect("a packed-tint fill reduces to a packed tint");
    for i in 0..instance_count {
        write_wgpu_packed_tint_instance(runtime, packed, i);
    }
}

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instance_count) with `fill` (a prior uniform value, or `None` → identity).
fn promote_wgpu_quad_batch_writer_color_scale_bias_to_per_instance(
    runtime: &mut WgpuRenderStateRuntime,
    instance_count: usize,
    fill: Option<&WgpuColorScaleBiasInput>,
) {
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PER_INSTANCE);
    for i in 0..instance_count {
        write_wgpu_color_scale_bias_instance(runtime, fill, i);
    }
}

// Folds instance `instance_index`'s effective color adjustment into the active batch. See the
// fold-mode constants for the promotion rules. `None` is an untinted instance.
fn record_wgpu_color_adjustment(
    runtime: &mut WgpuRenderStateRuntime,
    color_scale_bias: Option<&WgpuColorScaleBiasInput>,
    instance_index: u32,
) {
    let mode = runtime
        .quad_batch_writer_color_scale_bias_mode
        .unwrap_or(CT_MODE_NONE);
    let tint = color_scale_bias;
    let index = instance_index as usize;

    if mode == CT_MODE_MATRIX {
        write_wgpu_color_matrix_instance(runtime, tint, index);
        return;
    }

    if mode == CT_MODE_NONE {
        let Some(tint) = tint else {
            return;
        };
        if index == 0 {
            runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_UNIFORM);
            runtime.quad_batch_writer_uniform_color_scale_bias = Some(tint.clone());
            return;
        }
        if is_color_matrix_data(Some(tint)) {
            promote_wgpu_quad_batch_writer_color_scale_bias_to_matrix(runtime, index, None);
            write_wgpu_color_matrix_instance(runtime, Some(tint), index);
            return;
        }
        match get_packed_tint(Some(tint)) {
            Some(packed_tint) => {
                promote_wgpu_quad_batch_writer_color_scale_bias_to_packed_tint(
                    runtime, index, None,
                );
                write_wgpu_packed_tint_instance(runtime, packed_tint, index);
            }
            None => {
                promote_wgpu_quad_batch_writer_color_scale_bias_to_per_instance(
                    runtime, index, None,
                );
                write_wgpu_color_scale_bias_instance(runtime, Some(tint), index);
            }
        }
        return;
    }

    if mode == CT_MODE_UNIFORM {
        let uniform = runtime.quad_batch_writer_uniform_color_scale_bias.clone();
        if equals_recorded_color_scale_bias(tint, uniform.as_ref()) {
            return;
        }
        if is_color_matrix_data(tint) || is_color_matrix_data(uniform.as_ref()) {
            promote_wgpu_quad_batch_writer_color_scale_bias_to_matrix(
                runtime,
                index,
                uniform.as_ref(),
            );
            write_wgpu_color_matrix_instance(runtime, tint, index);
            return;
        }
        let packed_tint = get_packed_tint(tint);
        if let (Some(_), Some(packed_tint)) = (get_packed_tint(uniform.as_ref()), packed_tint) {
            promote_wgpu_quad_batch_writer_color_scale_bias_to_packed_tint(
                runtime,
                index,
                uniform.as_ref(),
            );
            write_wgpu_packed_tint_instance(runtime, packed_tint, index);
        } else {
            promote_wgpu_quad_batch_writer_color_scale_bias_to_per_instance(
                runtime,
                index,
                uniform.as_ref(),
            );
            write_wgpu_color_scale_bias_instance(runtime, tint, index);
        }
        return;
    }

    if mode == CT_MODE_PACKED_TINT {
        if is_color_matrix_data(tint) {
            promote_wgpu_packed_tint_to_color_matrix(runtime, index);
            write_wgpu_color_matrix_instance(runtime, tint, index);
            return;
        }
        match get_packed_tint(tint) {
            Some(packed_tint) => write_wgpu_packed_tint_instance(runtime, packed_tint, index),
            None => {
                promote_wgpu_packed_tint_to_color_scale_bias(runtime, index);
                write_wgpu_color_scale_bias_instance(runtime, tint, index);
            }
        }
        return;
    }

    if is_color_matrix_data(tint) {
        promote_wgpu_color_scale_bias_to_matrix(runtime, index);
        write_wgpu_color_matrix_instance(runtime, tint, index);
        return;
    }
    write_wgpu_color_scale_bias_instance(runtime, tint, index);
}

/// Enables the opt-in color-adjustment accumulator and inline fold on a state (TS
/// `registerWgpuColorAdjustmentMaterialFeature`). Idempotent; safe to call per state.
pub fn register_wgpu_color_adjustment_material_feature(state: &mut WgpuRenderState) {
    enable_color_adjustments(state);
    let installed = get_wgpu_color_adjustment_material_feature(state)
        .is_some_and(|feature| std::ptr::eq(feature, &WGPU_COLOR_ADJUSTMENT_MATERIAL_FEATURE));
    let runtime = get_wgpu_render_state_runtime_mut(state);
    if !installed {
        runtime.registries.color_adjustment_feature = Some(&WGPU_COLOR_ADJUSTMENT_MATERIAL_FEATURE);
    }
    if runtime.quad_batch_writer_color_scale_bias_mode.is_none() {
        runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_NONE);
    }
}

// Resolves the active batch's folded realization: replicates a whole-batch uniform tint across the
// batch, then returns the per-instance storage data and the folded module. `None` when the batch
// carried no tint, so the flush runs the lean material path. Resets the fold mode for the next
// batch.
fn resolve_wgpu_color_adjustment_flush(
    state: &mut WgpuRenderState,
    count: u32,
) -> Option<WgpuColorAdjustmentFlush> {
    let count = count as usize;
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let ct_mode = runtime
        .quad_batch_writer_color_scale_bias_mode
        .unwrap_or(CT_MODE_NONE);
    if ct_mode == CT_MODE_NONE {
        return None;
    }
    if ct_mode == CT_MODE_UNIFORM {
        let uniform = runtime
            .quad_batch_writer_uniform_color_scale_bias
            .clone()
            .expect("uniform mode carries its tint");
        if is_color_matrix_data(Some(&uniform)) {
            runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_MATRIX);
            fill_wgpu_quad_batch_writer_uniform_color_matrix(runtime, &uniform, count);
        } else {
            match get_packed_tint(Some(&uniform)) {
                Some(packed_tint) => {
                    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PACKED_TINT);
                    fill_wgpu_quad_batch_writer_uniform_packed_tint(runtime, packed_tint, count);
                }
                None => {
                    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_PER_INSTANCE);
                    fill_wgpu_quad_batch_writer_uniform_color_scale_bias(runtime, &uniform, count);
                }
            }
        }
    }
    let resolved_mode = runtime.quad_batch_writer_color_scale_bias_mode;
    runtime.quad_batch_writer_color_scale_bias_mode = Some(CT_MODE_NONE);
    runtime.quad_batch_writer_uniform_color_scale_bias = None;
    if resolved_mode == Some(CT_MODE_PACKED_TINT) {
        let data = runtime
            .quad_batch_writer_color_tint_data
            .clone()
            .expect("packed-tint mode carries tint data");
        return Some(WgpuColorAdjustmentFlush {
            data: WgpuColorAdjustmentFlushData::U32(WgpuColorAdjustmentFlushU32 { data }),
            floats: 1,
            module: get_wgpu_quad_batch_writer_packed_tint_module(state),
        });
    }
    if resolved_mode == Some(CT_MODE_MATRIX) {
        let data = runtime
            .quad_batch_writer_color_matrix_data
            .clone()
            .expect("matrix mode carries matrix data");
        return Some(WgpuColorAdjustmentFlush {
            data: WgpuColorAdjustmentFlushData::F32(WgpuColorAdjustmentFlushF32 { data }),
            floats: COLOR_MATRIX_FLOATS as u32,
            module: get_wgpu_quad_batch_writer_color_matrix_module(state),
        });
    }
    let data = runtime
        .quad_batch_writer_color_scale_bias_data
        .clone()
        .expect("per-instance mode carries scale/bias data");
    return Some(WgpuColorAdjustmentFlush {
        data: WgpuColorAdjustmentFlushData::F32(WgpuColorAdjustmentFlushF32 { data }),
        floats: COLOR_SCALE_BIAS_FLOATS as u32,
        module: get_wgpu_quad_batch_writer_color_scale_bias_module(state),
    });
}

// `0xRRGGBBAA` to the little-endian byte word `unpack4x8unorm` reads as (r, g, b, a).
fn rgba_to_native_byte_word(rgba: u32) -> u32 {
    return ((rgba >> 24) & 0xff)
        | (((rgba >> 16) & 0xff) << 8)
        | (((rgba >> 8) & 0xff) << 16)
        | ((rgba & 0xff) << 24);
}

fn write_identity_color_matrix(out: &mut [f32], offset: usize) {
    out[offset..offset + COLOR_MATRIX_FLOATS].fill(0.0);
    out[offset] = 1.0;
    out[offset + 5] = 1.0;
    out[offset + 10] = 1.0;
    out[offset + 15] = 1.0;
}

fn write_wgpu_affine_values_as_color_matrix(
    runtime: &mut WgpuRenderStateRuntime,
    affine: &[f32],
    affine_offset: usize,
    instance_index: usize,
) {
    write_wgpu_color_matrix_instance(runtime, None, instance_index);
    let out = runtime
        .quad_batch_writer_color_matrix_data
        .as_mut()
        .unwrap();
    let offset = instance_index * COLOR_MATRIX_FLOATS;
    for channel in 0..4 {
        out[offset + channel * 4 + channel] = affine[affine_offset + channel];
        out[offset + 16 + channel] = affine[affine_offset + 4 + channel];
    }
}

fn write_wgpu_color_matrix_instance(
    runtime: &mut WgpuRenderStateRuntime,
    adjustment: Option<&WgpuColorScaleBiasInput>,
    instance_index: usize,
) {
    let offset = instance_index * COLOR_MATRIX_FLOATS;
    let out = runtime
        .quad_batch_writer_color_matrix_data
        .get_or_insert_with(|| vec![0.0; COLOR_MATRIX_FLOATS * 256]);
    if offset + COLOR_MATRIX_FLOATS > out.len() {
        let new_len = (offset + COLOR_MATRIX_FLOATS).max(out.len() * 2);
        out.resize(new_len, 0.0);
    }
    match adjustment {
        None => write_identity_color_matrix(out, offset),
        Some(WgpuColorScaleBiasInput::Values(matrix)) => {
            for row in 0..4 {
                let source = row * 5;
                let target = offset + row * 4;
                let value = |i: usize| matrix.values.get(i).copied().unwrap_or(f32::NAN);
                out[target] = value(source);
                out[target + 1] = value(source + 1);
                out[target + 2] = value(source + 2);
                out[target + 3] = value(source + 3);
                out[offset + 16 + row] = value(source + 4);
            }
        }
        Some(adjustment) => {
            write_identity_color_matrix(out, offset);
            for channel in 0..4 {
                out[offset + channel * 4 + channel] = get_color_scale(adjustment, channel);
                out[offset + 16 + channel] = get_color_bias(adjustment, channel);
            }
        }
    }
}

// Writes one instance's eight color scale/bias floats at its slot, growing the array as needed.
// Bias is already normalized-linear and copied verbatim. `None` writes identity.
fn write_wgpu_color_scale_bias_instance(
    runtime: &mut WgpuRenderStateRuntime,
    color_scale_bias: Option<&WgpuColorScaleBiasInput>,
    instance_index: usize,
) {
    let offset = instance_index * COLOR_SCALE_BIAS_FLOATS;
    ensure_wgpu_color_scale_bias_capacity(runtime, offset + COLOR_SCALE_BIAS_FLOATS);
    let out = runtime
        .quad_batch_writer_color_scale_bias_data
        .as_mut()
        .unwrap();
    match color_scale_bias {
        Some(color_scale_bias) => {
            for channel in 0..4 {
                out[offset + channel] = get_color_scale(color_scale_bias, channel);
                out[offset + 4 + channel] = get_color_bias(color_scale_bias, channel);
            }
        }
        None => {
            out[offset..offset + 4].fill(1.0);
            out[offset + 4..offset + 8].fill(0.0);
        }
    }
}

fn write_wgpu_native_packed_tint_as_color_matrix(
    runtime: &mut WgpuRenderStateRuntime,
    native_word: u32,
    instance_index: usize,
) {
    write_wgpu_color_matrix_instance(runtime, None, instance_index);
    let out = runtime
        .quad_batch_writer_color_matrix_data
        .as_mut()
        .unwrap();
    let offset = instance_index * COLOR_MATRIX_FLOATS;
    out[offset] = (native_word & 0xff) as f32 / 255.0;
    out[offset + 5] = ((native_word >> 8) & 0xff) as f32 / 255.0;
    out[offset + 10] = ((native_word >> 16) & 0xff) as f32 / 255.0;
    out[offset + 15] = ((native_word >> 24) & 0xff) as f32 / 255.0;
}

fn write_wgpu_native_packed_tint_as_color_scale_bias(
    runtime: &mut WgpuRenderStateRuntime,
    native_word: u32,
    instance_index: usize,
) {
    let offset = instance_index * COLOR_SCALE_BIAS_FLOATS;
    write_wgpu_color_scale_bias_instance(runtime, None, instance_index);
    let data = runtime
        .quad_batch_writer_color_scale_bias_data
        .as_mut()
        .unwrap();
    data[offset] = (native_word & 0xff) as f32 / 255.0;
    data[offset + 1] = ((native_word >> 8) & 0xff) as f32 / 255.0;
    data[offset + 2] = ((native_word >> 16) & 0xff) as f32 / 255.0;
    data[offset + 3] = ((native_word >> 24) & 0xff) as f32 / 255.0;
}

fn write_wgpu_packed_tint_instance(
    runtime: &mut WgpuRenderStateRuntime,
    rgba: u32,
    instance_index: usize,
) {
    let data = runtime
        .quad_batch_writer_color_tint_data
        .get_or_insert_with(|| vec![0; 256]);
    if instance_index >= data.len() {
        let new_len = (instance_index + 1).max(data.len() * 2);
        data.resize(new_len, 0);
    }
    data[instance_index] = rgba_to_native_byte_word(rgba);
}
