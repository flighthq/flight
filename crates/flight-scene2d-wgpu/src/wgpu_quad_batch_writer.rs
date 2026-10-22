// flight-lint: allow-file(contract-vocabulary) D17 quad-batch writer contracts carry native wgpu handles and render-wgpu state
//! The shared instanced quad batch every 2D leaf renderer writes into (TS `wgpuQuadBatchWriter.ts`):
//! the base 13-float instance record, the WGSL prelude material shaders build on, the per-flush
//! buffer pool, and the opt-in color-adjustment fold seam.

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::Matrix;
use flight_materials::{BlendMode, Material, Material2D, MaterialData};
use flight_render::RenderProxy2D;
use flight_render_wgpu::{
    WgpuColorAdjustmentFlushData, WgpuColorScaleBiasInput, WgpuColorScaleBiasValues,
    WgpuCommandRecord, WgpuQuadBatchResources, WgpuQuadBatchWriterBufferSlot,
    WgpuQuadMaterialRenderer, WgpuRenderPipelineRecord, WgpuRenderState, WgpuSamplerLike,
    WgpuTextureEntry, get_wgpu_color_adjustment_material_feature,
    get_wgpu_color_adjustment_material_feature_guard, get_wgpu_render_pass_viewport,
    get_wgpu_render_state_device_resources, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut, get_wgpu_sampler,
    record_wgpu_command, resolve_wgpu_apply_blend_mode, resolve_wgpu_quad_material_renderer,
    resolve_wgpu_smoothing_bind_group, write_wgpu_buffer,
};
use flight_texture::TextureFilter;

use crate::wgpu_render_stats::record_wgpu_batch_flush;

// Base per-instance layout (13 floats = 52 bytes). This is a fixed contract material shaders read
// from the instance storage buffer; it carries no material concern (no color adjustment). A material
// that needs per-instance data writes it into a parallel material storage buffer instead.
// [0-3]   axisUX/Y, axisVX/Y — world-space quad axes, already multiplied by width/height
// [4-5]   tx, ty       — world-space translation
// [6-7]   uvOrigin     — UV at the drawn top-left corner
// [8-9]   uvAxisU      — UV delta across the drawn horizontal axis
// [10-11] uvAxisV      — UV delta across the drawn vertical axis
// [12]    alpha        — per-instance alpha
pub const QUAD_BATCH_INSTANCE_FLOATS: usize = 13;
const QUAD_BATCH_INSTANCE_STRIDE: u64 = (QUAD_BATCH_INSTANCE_FLOATS * 4) as u64;

// Shared WGSL prelude for quad-batch writer material shaders: the base Uniforms and InstanceData
// structs, the standard bind-group bindings (@group(0) uniform, @group(1) texture/sampler,
// @group(2) instances), and a quadBaseVertex helper that expands one instance corner into clip-space
// position, UV, and alpha. A material module appends its own @group(3) material buffer (when it uses
// one), a VertexOut struct, vs_main, and fs_main. The base path knows nothing about what a material
// does with this — color adjustment and any other effect live entirely in the material's own module.
const QUAD_BATCH_PRELUDE_WGSL: &str = r"
struct Uniforms {
  matrix : mat3x3f,
  straightTextureAlpha : u32,
}

struct InstanceData {
  axisUX : f32, axisUY : f32, axisVX : f32, axisVY : f32,
  tx : f32, ty : f32,
  uvOriginX : f32, uvOriginY : f32,
  uvAxisUX : f32, uvAxisUY : f32, uvAxisVX : f32, uvAxisVY : f32,
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
  let cx = select(0.0, 1.0, xi);
  let cy = select(0.0, 1.0, yi);
  let wx = inst.axisUX * cx + inst.axisVX * cy + inst.tx;
  let wy = inst.axisUY * cx + inst.axisVY * cy + inst.ty;
  let p = uni.matrix * vec3f(wx, wy, 1.0);
  var bv : BaseVertex;
  bv.position = vec4f(p.x, p.y, 0.0, 1.0);
  bv.uv = vec2f(inst.uvOriginX, inst.uvOriginY) +
    vec2f(inst.uvAxisUX, inst.uvAxisUY) * cx + vec2f(inst.uvAxisVX, inst.uvAxisVY) * cy;
  bv.alpha = inst.alpha;
  return bv;
}
";

fn create_read_only_storage_layout(device: &wgpu::Device) -> wgpu::BindGroupLayout {
    return device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
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
}

fn create_wgpu_quad_batch_writer_buffer(state: &WgpuRenderState, size: u64) -> wgpu::Buffer {
    return get_wgpu_render_state_native_device(state)
        .device
        .create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
}

fn create_wgpu_texture_sampler_bind_group(
    state: &WgpuRenderState,
    view: &wgpu::TextureView,
    sampler: &WgpuSamplerLike,
) -> wgpu::BindGroup {
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
    let mipmap_filter = get_wgpu_mipmap_filter(sampler);
    let native = get_wgpu_render_state_native_device(state);
    let resources = get_wgpu_render_state_device_resources(state);
    let gpu_sampler = get_wgpu_sampler(
        state,
        min_filter,
        mag_filter,
        sampler.wrap_u,
        sampler.wrap_v,
        mipmap_filter,
        Some(sampler.anisotropy),
    );
    return native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &resources.texture_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&gpu_sampler),
            },
        ],
    });
}

// Claims the next per-frame pool slot, allocating one if the frame has more flushes than any prior
// frame. The cursor is reset to 0 each frame by reset_wgpu_quad_batch_writer_buffer_pool.
fn acquire_wgpu_quad_batch_writer_buffer_slot(state: &mut WgpuRenderState) -> usize {
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let cursor = runtime.quad_batch_writer_buffer_cursor as usize;
    if runtime.quad_batch_writer_buffer_pool.len() <= cursor {
        runtime
            .quad_batch_writer_buffer_pool
            .resize_with(cursor + 1, WgpuQuadBatchWriterBufferSlot::default);
    }
    runtime.quad_batch_writer_buffer_cursor += 1;
    return cursor;
}

/// The device-tier quad-batch layouts, built once per device (TS `ensureWgpuQuadBatchResources`).
pub fn ensure_wgpu_quad_batch_resources(state: &WgpuRenderState) -> WgpuQuadBatchResources {
    let context = get_wgpu_render_state_runtime(state).context.clone();
    if let Some(existing) = &context.read().unwrap().quad_batch_resources {
        return existing.clone();
    }

    let native = get_wgpu_render_state_native_device(state);
    let device = &native.device;
    let device_resources = get_wgpu_render_state_device_resources(state);

    let instance_bind_group_layout = create_read_only_storage_layout(device);
    // Generic per-instance material buffer (array<f32>); the same layout serves every material that
    // appends per-instance data, so the batch — not the material — owns it.
    let material_bind_group_layout = create_read_only_storage_layout(device);

    let base_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[
            Some(&device_resources.uniform_bind_group_layout),
            Some(&device_resources.texture_bind_group_layout),
            Some(&instance_bind_group_layout),
        ],
        immediate_size: 0,
    });

    let material_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[
            Some(&device_resources.uniform_bind_group_layout),
            Some(&device_resources.texture_bind_group_layout),
            Some(&instance_bind_group_layout),
            Some(&material_bind_group_layout),
        ],
        immediate_size: 0,
    });

    let resources = WgpuQuadBatchResources {
        instance_bind_group_layout,
        material_bind_group_layout,
        base_pipeline_layout,
        material_pipeline_layout,
        pipelines: HashMap::new(),
    };
    context.write().unwrap().quad_batch_resources = Some(resources.clone());
    return resources;
}

/// Uploads and draws the pending batch, then resets it (TS `flushWgpuQuadBatchWriter`). An empty
/// writer, or one outside a pass, only resets.
pub fn flush_wgpu_quad_batch_writer(state: &mut WgpuRenderState) {
    let runtime = get_wgpu_render_state_runtime(state);
    let count = runtime.quad_batch_writer_count;
    if count == 0 || runtime.render_pass.is_none() {
        reset_wgpu_quad_batch_writer(state);
        return;
    }

    let texture = runtime
        .quad_batch_writer_texture
        .clone()
        .expect("a pending quad batch has a texture");
    let sampler = runtime.quad_batch_writer_sampler.clone();
    let blend_mode = runtime.quad_batch_writer_blend_mode.clone();
    let smoothing = runtime.quad_batch_writer_smoothing;
    let renderer = runtime
        .quad_batch_writer_material_renderer
        .clone()
        .expect("a pending quad batch has a material renderer");
    // The color-adjustment fold is opt-in (registerWgpuColorAdjustmentMaterialFeature): when installed
    // it resolves a tinted batch to its per-instance @group(3) storage data + folded module; an
    // untinted batch (or an un-enabled state) falls back to the resolved material's own per-instance
    // data, and no fold WGSL is linked into this module. CT and material per-instance data never mix
    // in a built-in batch (built-in materials have no per-instance floats).
    let ct_flush = get_wgpu_color_adjustment_material_feature(state)
        .and_then(|feature| (feature.resolve_flush)(state, count));
    let runtime = get_wgpu_render_state_runtime(state);
    let group3_floats = match &ct_flush {
        Some(flush) => flush.floats,
        None => runtime.quad_batch_writer_material_floats,
    };
    let group3_bytes = count as u64 * group3_floats as u64 * 4;
    let group3_data: Vec<u8> = match &ct_flush {
        Some(flush) => match &flush.data {
            WgpuColorAdjustmentFlushData::F32(data) => {
                wgpu_f32_bytes(&data.data)[..group3_bytes as usize].to_vec()
            }
            WgpuColorAdjustmentFlushData::U32(data) => {
                wgpu_u32_bytes(&data.data)[..group3_bytes as usize].to_vec()
            }
        },
        None => wgpu_f32_bytes(&runtime.quad_batch_writer_material_data)[..group3_bytes as usize]
            .to_vec(),
    };
    let instance_bytes = count as u64 * QUAD_BATCH_INSTANCE_STRIDE;
    let instance_data = wgpu_f32_bytes(&runtime.quad_batch_writer_instance_data)
        [..instance_bytes as usize]
        .to_vec();
    reset_wgpu_quad_batch_writer(state);

    let resources = ensure_wgpu_quad_batch_resources(state);
    let native = get_wgpu_render_state_native_device(state);

    // Claim a distinct pool slot for this flush. The canvas pass is submitted once at end of frame,
    // so a buffer shared across flushes would be rewritten before any draw reads it, leaving every
    // draw reading the last flush's data. A per-flush slot keeps each draw's instances intact until
    // submit.
    let slot_index = acquire_wgpu_quad_batch_writer_buffer_slot(state);
    let mut slot =
        get_wgpu_render_state_runtime(state).quad_batch_writer_buffer_pool[slot_index].clone();

    if slot.instance_buffer.is_none() || slot.instance_capacity < instance_bytes {
        let capacity = instance_bytes
            .max(slot.instance_capacity * 2)
            .max(QUAD_BATCH_INSTANCE_STRIDE * 256);
        slot.instance_buffer = Some(create_wgpu_quad_batch_writer_buffer(state, capacity));
        slot.instance_capacity = capacity;
    }
    let instance_buffer = slot.instance_buffer.clone().unwrap();
    write_wgpu_buffer(&native, &instance_buffer, 0, &instance_data);

    if group3_floats > 0 {
        if slot.material_buffer.is_none() || slot.material_capacity < group3_bytes {
            let capacity = group3_bytes
                .max(slot.material_capacity * 2)
                .max(group3_floats as u64 * 4 * 256);
            slot.material_buffer = Some(create_wgpu_quad_batch_writer_buffer(state, capacity));
            slot.material_capacity = capacity;
        }
        write_wgpu_buffer(
            &native,
            slot.material_buffer.as_ref().unwrap(),
            0,
            &group3_data,
        );
    }
    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_buffer_pool[slot_index] =
        slot.clone();

    if let Some(apply_blend_mode) = resolve_wgpu_apply_blend_mode(state) {
        apply_blend_mode(state, blend_mode.as_ref());
    }
    let texture_bind_group = match &sampler {
        Some(sampler) => {
            let view = texture.read().unwrap().view.clone();
            create_wgpu_texture_sampler_bind_group(state, &view, sampler)
        }
        None => resolve_wgpu_smoothing_bind_group(state, &texture, smoothing),
    };

    let straight_alpha = texture.read().unwrap().straight_alpha == Some(true);
    let uniform_offset = write_wgpu_quad_batch_writer_uniforms(state, straight_alpha);

    let instance_bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &resources.instance_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: instance_buffer.as_entire_binding(),
        }],
    });

    let module = match &ct_flush {
        Some(flush) => flush.module.clone(),
        None => (renderer.get_shader_module)(state),
    };
    let pipeline = get_wgpu_quad_batch_pipeline(
        state,
        &resources,
        &module,
        group3_floats > 0,
        blend_mode.as_ref(),
    );
    let material_bind_group = if group3_floats > 0 {
        Some(native.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &resources.material_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: slot.material_buffer.as_ref().unwrap().as_entire_binding(),
            }],
        }))
    } else {
        None
    };
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let mask_depth = runtime.current_mask_depth;
    let uniform_bind_group = runtime.uniform_bind_group.clone();
    let pass = runtime.render_pass.as_mut().unwrap();
    pass.set_pipeline(&pipeline);
    pass.set_bind_group(0, &uniform_bind_group, &[uniform_offset]);
    // Per-bitmap smoothing selects the LINEAR/NEAREST variant bind group; a null key
    // (sprites/text/shapes) uses the entry's global-default bind group.
    pass.set_bind_group(1, &texture_bind_group, &[]);
    pass.set_bind_group(2, &instance_bind_group, &[]);
    if let Some(material_bind_group) = &material_bind_group {
        pass.set_bind_group(3, material_bind_group, &[]);
    }
    if mask_depth > 0 {
        pass.set_stencil_reference(mask_depth);
    }
    pass.draw(0..6, 0..count);
    // Recorded beside the draw it counts, not at the top of the flush: an early return above leaves
    // the writer empty without issuing a draw, and counting that would report batches the GPU never
    // saw.
    record_wgpu_batch_flush(state, count);
}

// The mip filter a sampler descriptor selects (TS: `mipmaps && minFilter.includes('mipmap')`, then
// the filter's trailing component); `None` when it samples the base level only.
pub(crate) fn get_wgpu_mipmap_filter(sampler: &WgpuSamplerLike) -> Option<wgpu::MipmapFilterMode> {
    if !sampler.mipmaps {
        return None;
    }
    return match sampler.min_filter {
        TextureFilter::LinearMipmapNearest | TextureFilter::NearestMipmapNearest => {
            Some(wgpu::MipmapFilterMode::Nearest)
        }
        TextureFilter::LinearMipmapLinear | TextureFilter::NearestMipmapLinear => {
            Some(wgpu::MipmapFilterMode::Linear)
        }
        TextureFilter::Linear | TextureFilter::Nearest => None,
    };
}

/// The cached batch pipeline for a material module, blend mode, stencil mode and the current color
/// format (TS `getWgpuQuadBatchPipeline`).
// flight-lint: allow(conform-params) the device-tier resources are read back through the state that owns them; Rust passes them by reference
pub fn get_wgpu_quad_batch_pipeline(
    state: &WgpuRenderState,
    resources: &WgpuQuadBatchResources,
    module: &wgpu::ShaderModule,
    has_material_data: bool,
    blend_mode: Option<&BlendMode>,
) -> wgpu::RenderPipeline {
    let runtime = get_wgpu_render_state_runtime(state);
    let stencil_mode = if runtime.mask_write_mode {
        "maskwrite"
    } else if runtime.current_mask_depth > 0 {
        "masked"
    } else {
        "normal"
    };
    // The pipeline bakes its color-attachment format, so key on the current target format too
    // (rgba16float inside an HDR effect target vs the canvas format).
    let format = runtime.current_color_format.unwrap_or(state.format);
    let key = format!(
        "{}-{}-{:?}-{}",
        blend_mode.map(|mode| mode.as_str()).unwrap_or("null"),
        stencil_mode,
        format,
        has_material_data
    );
    let context = runtime.context.clone();
    if let Some(cached) = context
        .read()
        .unwrap()
        .quad_batch_resources
        .as_ref()
        .and_then(|resources| resources.pipelines.get(module))
        .and_then(|per_module| per_module.get(&key))
    {
        return cached.clone();
    }

    let native = get_wgpu_render_state_native_device(state);
    let blend = flight_render_wgpu::get_wgpu_blend_state(blend_mode);
    let is_mask_write = stencil_mode == "maskwrite";

    let stencil_face = if is_mask_write {
        stencil_face_state(
            wgpu::CompareFunction::Always,
            wgpu::StencilOperation::Replace,
        )
    } else if stencil_mode == "masked" {
        stencil_face_state(wgpu::CompareFunction::Equal, wgpu::StencilOperation::Keep)
    } else {
        stencil_face_state(wgpu::CompareFunction::Always, wgpu::StencilOperation::Keep)
    };

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
            layout: Some(if has_material_data {
                &resources.material_pipeline_layout
            } else {
                &resources.base_pipeline_layout
            }),
            vertex: wgpu::VertexState {
                module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module,
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

    let mut context = context.write().unwrap();
    let cached_resources = context
        .quad_batch_resources
        .get_or_insert_with(|| resources.clone());
    cached_resources
        .pipelines
        .entry(module.clone())
        .or_default()
        .insert(key, pipeline.clone());
    return pipeline;
}

/// The shared WGSL prelude a material shader prepends before its own VertexOut/vs_main/fs_main (and
/// optional @group(3) material buffer) (TS `getWgpuQuadBatchPreludeWGSL`). Exposed so a
/// user-authored material can build on the same base instance contract the bundled materials use.
pub fn get_wgpu_quad_batch_prelude_wgsl() -> String {
    return QUAD_BATCH_PRELUDE_WGSL.to_string();
}

// The color adjustment an instance of `render_proxy` records (TS `renderProxy.colorMatrix ??
// renderProxy.colorScaleBias`).
pub(crate) fn get_wgpu_render_proxy_color_adjustment(
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) -> Option<WgpuColorScaleBiasInput> {
    if let Some(matrix) = &render_proxy.color_matrix {
        return Some(WgpuColorScaleBiasInput::Values(WgpuColorScaleBiasValues {
            values: matrix.to_vec(),
        }));
    }
    return render_proxy
        .color_scale_bias
        .clone()
        .map(WgpuColorScaleBiasInput::ColorScaleBias);
}

// TS `filter.startsWith('nearest')`.
pub(crate) fn is_nearest_filter(filter: TextureFilter) -> bool {
    return matches!(
        filter,
        TextureFilter::Nearest
            | TextureFilter::NearestMipmapLinear
            | TextureFilter::NearestMipmapNearest
    );
}

/// Writes one instance's per-instance material floats into the parallel material buffer at the
/// instance's slot (TS `packWgpuQuadBatchMaterialInstance`). No-op for materials with no
/// per-instance data, so the base path never assumes any material contributes here.
pub fn pack_wgpu_quad_batch_material_instance(
    state: &mut WgpuRenderState,
    material_data: Option<&Ref<dyn MaterialData>>,
    instance_index: u32,
) {
    let runtime = get_wgpu_render_state_runtime(state);
    let floats = runtime.quad_batch_writer_material_floats;
    if floats == 0 {
        return;
    }
    let Some(pack_instance) = runtime
        .quad_batch_writer_material_renderer
        .as_ref()
        .and_then(|renderer| renderer.pack_instance)
    else {
        return;
    };
    let material = runtime.quad_batch_writer_material.clone();
    let mut data = std::mem::take(
        &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_material_data,
    );
    pack_instance(
        state,
        material.as_ref(),
        material_data,
        &mut data,
        instance_index as usize * floats as usize,
    );
    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_material_data = data;
}

/// Ensures the writer can accept up to `max_instances` more instances for the given texture,
/// sampler, blend mode, material and smoothing, flushing when any of them changes (material by
/// identity) or capacity is exceeded (TS `prepareWgpuQuadBatchWrite`). Returns the index of the
/// instance the caller writes first, the ONLY valid source for that index: this may flush, and a
/// flush resets the writer count to 0. Multiply by `QUAD_BATCH_INSTANCE_FLOATS` for the float offset
/// into the instance data; the caller increments the writer count and packs material data per
/// instance.
pub fn prepare_wgpu_quad_batch_write(
    state: &mut WgpuRenderState,
    texture: &Ref<WgpuTextureEntry>,
    sampler: Option<&WgpuSamplerLike>,
    blend_mode: Option<&BlendMode>,
    material: Option<&Ref<dyn Material2D>>,
    material_renderer: &WgpuQuadMaterialRenderer,
    max_instances: u32,
    smoothing: Option<bool>,
) -> u32 {
    let runtime = get_wgpu_render_state_runtime(state);
    let same_texture = runtime
        .quad_batch_writer_texture
        .as_ref()
        .is_some_and(|current| Arc::ptr_eq(current, texture));
    let same_material = match (&runtime.quad_batch_writer_material, material) {
        (None, None) => true,
        (Some(current), Some(material)) => Arc::ptr_eq(current, material),
        _ => false,
    };
    if !same_texture
        || runtime.quad_batch_writer_sampler.as_ref() != sampler
        || runtime.quad_batch_writer_blend_mode.as_ref() != blend_mode
        || !same_material
        || runtime.quad_batch_writer_smoothing != smoothing
    {
        flush_wgpu_quad_batch_writer(state);
    }
    let runtime = get_wgpu_render_state_runtime_mut(state);
    runtime.quad_batch_writer_texture = Some(texture.clone());
    runtime.quad_batch_writer_sampler = sampler.cloned();
    runtime.quad_batch_writer_smoothing = smoothing;
    runtime.quad_batch_writer_blend_mode = blend_mode.cloned();
    runtime.quad_batch_writer_material = material.cloned();
    runtime.quad_batch_writer_material_renderer = Some(material_renderer.clone());
    let floats = material_renderer.instance_float_count;
    runtime.quad_batch_writer_material_floats = floats;

    let needed =
        (runtime.quad_batch_writer_count + max_instances) as usize * QUAD_BATCH_INSTANCE_FLOATS;
    if needed > runtime.quad_batch_writer_instance_data.len() {
        let new_size = needed
            .max(runtime.quad_batch_writer_instance_data.len() * 2)
            .max(QUAD_BATCH_INSTANCE_FLOATS * 256);
        runtime.quad_batch_writer_instance_data = vec![0.0; new_size];
    }

    if floats > 0 {
        let material_needed =
            (runtime.quad_batch_writer_count + max_instances) as usize * floats as usize;
        if material_needed > runtime.quad_batch_writer_material_data.len() {
            let new_size = material_needed
                .max(runtime.quad_batch_writer_material_data.len() * 2)
                .max(floats as usize * 256);
            runtime.quad_batch_writer_material_data = vec![0.0; new_size];
        }
    }

    return runtime.quad_batch_writer_count;
}

/// Folds instance `instance_index`'s effective color adjustment into the active batch through the
/// opt-in fold, without ever splitting the batch (TS `recordWgpuQuadBatchColorScaleBias`). With no
/// fold registered the tint is skipped and the batch draws untinted (never a throw); an installed
/// guard reports the miss. `None` is an untinted instance, a no-op either way.
pub fn record_wgpu_quad_batch_color_scale_bias(
    state: &mut WgpuRenderState,
    color_scale_bias: Option<&WgpuColorScaleBiasInput>,
    instance_index: u32,
) {
    if let Some(fold) = get_wgpu_color_adjustment_material_feature(state) {
        (fold.record)(
            get_wgpu_render_state_runtime_mut(state),
            color_scale_bias,
            instance_index,
        );
        return;
    }
    if let Some(color_scale_bias) = color_scale_bias
        && let Some(guard) = get_wgpu_color_adjustment_material_feature_guard(state)
    {
        guard(state, color_scale_bias);
    }
}

fn reset_wgpu_quad_batch_writer(state: &mut WgpuRenderState) {
    let runtime = get_wgpu_render_state_runtime_mut(state);
    runtime.quad_batch_writer_count = 0;
    runtime.quad_batch_writer_texture = None;
    runtime.quad_batch_writer_sampler = None;
    runtime.quad_batch_writer_smoothing = None;
    runtime.quad_batch_writer_blend_mode = None;
    runtime.quad_batch_writer_material = None;
    runtime.quad_batch_writer_material_renderer = None;
    runtime.quad_batch_writer_material_floats = 0;
}

/// Rewinds the per-frame buffer-pool cursor so the next frame reclaims slots from the start (TS
/// `resetWgpuQuadBatchWriterBufferPool`). Called once at the start of each frame's batch work.
pub fn reset_wgpu_quad_batch_writer_buffer_pool(state: &mut WgpuRenderState) {
    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_buffer_cursor = 0;
}

// The quad material renderer for the proxy's material (TS `resolveWgpuQuadMaterialRenderer(state,
// renderProxy.material)`).
pub(crate) fn resolve_wgpu_render_proxy_material_renderer(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) -> Option<WgpuQuadMaterialRenderer> {
    let material = render_proxy.material.clone();
    let guard = material.as_ref().map(|material| material.read().unwrap());
    let material: Option<&dyn Material> = guard.as_deref().map(|material| {
        let material: &dyn Material = material;
        return material;
    });
    return resolve_wgpu_quad_material_renderer(state, material);
}

fn stencil_face_state(
    compare: wgpu::CompareFunction,
    pass_op: wgpu::StencilOperation,
) -> wgpu::StencilFaceState {
    return wgpu::StencilFaceState {
        compare,
        fail_op: wgpu::StencilOperation::Keep,
        depth_fail_op: wgpu::StencilOperation::Keep,
        pass_op,
    };
}

// The bytes a Float32Array view uploads, in host order.
pub(crate) fn wgpu_f32_bytes(data: &[f32]) -> &[u8] {
    return bytemuck::cast_slice(data);
}

// The bytes a Uint32Array view uploads, in host order.
pub(crate) fn wgpu_u32_bytes(data: &[u32]) -> &[u8] {
    return bytemuck::cast_slice(data);
}

/// Writes one affine instance record: pre-scaled geometry axes, translation, two affine UV axes and
/// alpha (TS `writeWgpuQuadBatchAffineInstance`). Rotated texture views add neither bandwidth nor
/// another allocation.
pub fn write_wgpu_quad_batch_affine_instance(
    data: &mut [f32],
    base: usize,
    transform: &Matrix,
    width: f32,
    height: f32,
    uv_origin_x: f32,
    uv_origin_y: f32,
    uv_axis_ux: f32,
    uv_axis_uy: f32,
    uv_axis_vx: f32,
    uv_axis_vy: f32,
    alpha: f32,
) {
    data[base] = transform.a * width;
    data[base + 1] = transform.b * width;
    data[base + 2] = transform.c * height;
    data[base + 3] = transform.d * height;
    data[base + 4] = transform.tx;
    data[base + 5] = transform.ty;
    data[base + 6] = uv_origin_x;
    data[base + 7] = uv_origin_y;
    data[base + 8] = uv_axis_ux;
    data[base + 9] = uv_axis_uy;
    data[base + 10] = uv_axis_vx;
    data[base + 11] = uv_axis_vy;
    data[base + 12] = alpha;
}

/// Writes one instance whose UVs are an axis-aligned rectangle (TS `writeWgpuQuadBatchInstance`).
pub fn write_wgpu_quad_batch_instance(
    data: &mut [f32],
    base: usize,
    transform: &Matrix,
    width: f32,
    height: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    alpha: f32,
) {
    write_wgpu_quad_batch_affine_instance(
        data,
        base,
        transform,
        width,
        height,
        u0,
        v0,
        u1 - u0,
        0.0,
        0.0,
        v1 - v0,
        alpha,
    );
}

// Writes the NDC viewport matrix and the shared texture's alpha representation into the uniform
// ring, then advances the ring offset. Returns the byte offset for the dynamic bind-group binding.
fn write_wgpu_quad_batch_writer_uniforms(
    state: &mut WgpuRenderState,
    straight_texture_alpha: bool,
) -> u32 {
    let viewport = get_wgpu_render_pass_viewport(state);
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let uniform_offset = runtime.uniform_offset;
    let float_base = (uniform_offset >> 2) as usize;
    let iw = 2.0 / viewport.width;
    let ih = 2.0 / viewport.height;
    let data = &mut runtime.uniform_data;

    data[float_base] = iw;
    data[float_base + 1] = 0.0;
    data[float_base + 2] = 0.0;
    data[float_base + 3] = 0.0;
    data[float_base + 4] = 0.0;
    data[float_base + 5] = -ih;
    data[float_base + 6] = 0.0;
    data[float_base + 7] = 0.0;
    data[float_base + 8] = -1.0;
    data[float_base + 9] = 1.0;
    data[float_base + 10] = 1.0;
    data[float_base + 11] = 0.0;
    data[float_base + 12] = f32::from_bits(u32::from(straight_texture_alpha));
    runtime.uniform_offset += runtime.uniform_stride;
    return uniform_offset;
}
