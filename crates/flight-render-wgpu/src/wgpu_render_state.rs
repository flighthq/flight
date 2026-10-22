// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! WebGPU render-state construction, the shared device tier, derived offscreen states, samplers and
//! teardown (TS `wgpuRenderState.ts`). The device is the host-supplied native `wgpu` device and
//! queue (D17); a state is synchronous to build because acquisition happens before it.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_host::WgpuDevice;
use flight_registry::KindMap;
use flight_render::{
    RenderProxies2D, create_render_state, create_render_state_runtime, destroy_render_state,
};
use flight_surface::{
    HostWgpuCapability, SurfaceRef, WgpuHostAcquisition, WgpuHostAcquisitionOptions,
    WgpuHostAcquisitionOwnership,
};
use flight_texture::TextureWrap;

use crate::types::*;
use crate::wgpu_command_observer::{WgpuCommandRecord, WgpuSamplerRecord, record_wgpu_command};
use crate::wgpu_device_loss::observe_wgpu_device_loss;
use crate::wgpu_draw::warm_wgpu_pipelines;
use crate::wgpu_shader::{UNIFORM_BYTE_SIZE, create_wgpu_bind_group_layouts};

// Ring buffer: 4096 draw slots per frame. Stride is clamped to at least 256 by the spec.
const RING_SLOT_COUNT: u32 = 4096;

fn create_minimal_device_runtime(native: WgpuNativeDevice) -> WgpuDeviceRuntimeRef {
    let runtime = Arc::new(RwLock::new(WgpuDeviceRuntime {
        native,
        references: 0,
        teardowns: Vec::new(),
        lost: None,
        signals: None,
        resources: None,
        pipeline_cache: HashMap::new(),
        sampler_cache: HashMap::new(),
        mipmap_pipeline_cache: HashMap::new(),
        texture_cache: Vec::new(),
        texture_source_premultiplied_texture_cache: HashMap::new(),
        texture_source_premultiplied_srgb_texture_cache: HashMap::new(),
        texture_source_straight_texture_cache: HashMap::new(),
        texture_source_straight_srgb_texture_cache: HashMap::new(),
        video_texture_cache: None,
        video_srgb_texture_cache: None,
        wgpu_external_texture_cache: None,
        wgpu_render_texture_cache: None,
        scene_mesh_upload_cache: None,
        standard_material_module: None,
        color_scale_bias_module: None,
        packed_tint_module: None,
        color_matrix_module: None,
        shape_mesh_color_scale_bias_pipelines: None,
        particle_resources: None,
        quad_batch_resources: None,
    }));
    observe_wgpu_device_loss(&runtime);
    return runtime;
}

/// Acquires host handles the CALLER owns (TS `createWgpuAcquisition`). Ownership is `Caller`, so
/// Flight never releases them; the caller ends their life with `release_wgpu_acquisition`. `None`
/// rather than an error, because "this environment has no WebGPU" is an expected outcome.
pub async fn create_wgpu_acquisition(
    host_wgpu: &HostWgpuCapability,
    surface: &SurfaceRef,
    options: Option<&WgpuHostAcquisitionOptions>,
) -> Option<WgpuHostAcquisition> {
    let defaults = WgpuHostAcquisitionOptions::default();
    let acquired = (host_wgpu.acquire)(surface, options.unwrap_or(&defaults)).await;
    let Ok(acquired) = acquired else {
        return None;
    };
    // TS `initializeWgpuHostAcquisition(out, acquired, 'caller')`: the acquired handles, then the
    // caller ownership. The construction initializer lives in flight-surface beside the type (D8/D23).
    let mut out = flight_surface::create_wgpu_host_acquisition();
    out.context = acquired.context;
    out.device = acquired.device;
    out.format = acquired.format;
    out.surface = acquired.surface;
    out.ownership = WgpuHostAcquisitionOwnership::Caller;
    return Some(out);
}

/// Wraps a host-supplied device in its own device tier (TS `createWgpuDeviceState`).
pub fn create_wgpu_device_state(device: &WgpuDevice) -> WgpuDeviceState {
    let native = narrow_wgpu_native_device(device);
    let device_runtime = create_minimal_device_runtime(native);
    let mut state = WgpuDeviceState::with_context(device.clone(), device_runtime);
    initialize_wgpu_device_state(&mut state, device);
    return state;
}

/// Derives a device-only render state from an existing one (TS `createWgpuOffscreenRenderState`
/// over a state). It gets its own frame-local resources (command encoder, uniform ring, batch writer,
/// clip stack) and shares the immutable device tier; registrations are a creation-time snapshot. A
/// lost device is reported, not thrown.
pub fn create_wgpu_offscreen_render_state(
    source: &WgpuRenderState,
) -> WgpuOffscreenRenderStateResult {
    let lost = source.runtime.context.read().unwrap().lost.clone();
    if let Some(lost) = lost {
        return WgpuOffscreenRenderStateResult::DeviceLost(
            WgpuOffscreenRenderStateDeviceLost::with_info(lost),
        );
    }

    let options = WgpuRenderStateOptions {
        format: Some(source.format),
        image_smoothing_enabled: Some(source.render.allow_smoothing),
        pixel_ratio: Some(source.render.pixel_ratio),
        round_pixels: Some(source.render.round_pixels),
        scene_graph_sync_policy: Some(source.render.scene_graph_sync_policy),
        ..WgpuRenderStateOptions::default()
    };
    let mut state = initialize_wgpu_device_render_state(
        &source.device_state,
        &options,
        Some(source.runtime.registries.clone()),
    );
    copy_renderer_policy_snapshot(&mut state, source);
    *state.runtime.apply_blend_mode_parent.write().unwrap() = Some(WgpuApplyBlendModeParent {
        apply_blend_mode: source.apply_blend_mode.clone(),
        parent: source.runtime.apply_blend_mode_parent.clone(),
    });
    state.runtime.default_bitmap_shader = source.runtime.default_bitmap_shader.clone();
    state.runtime.mipmap_degraded_guard = source.runtime.mipmap_degraded_guard.clone();
    state.runtime.mipmap_generator = source.runtime.mipmap_generator;
    state.runtime.webgpu_shader_binding_resolver = source.runtime.webgpu_shader_binding_resolver;
    state.runtime.shader_bindings = source.runtime.shader_bindings.clone();
    state.runtime.wgpu_render_texture_guard = source.runtime.wgpu_render_texture_guard.clone();
    return WgpuOffscreenRenderStateResult::Ok(WgpuOffscreenRenderStateOk::with_state(state));
}

/// Builds a device-only render state over an existing device tier (TS
/// `createWgpuOffscreenRenderState(deviceState, options)`, the overload taking a device state).
// flight-lint: allow(conform-extra) the device-state overload of the source createWgpuOffscreenRenderState
pub fn create_wgpu_offscreen_render_state_from_device_state(
    device_state: &WgpuDeviceState,
    options: Option<&WgpuRenderStateOptions>,
) -> WgpuRenderState {
    let defaults = WgpuRenderStateOptions::default();
    return initialize_wgpu_device_render_state(device_state, options.unwrap_or(&defaults), None);
}

/// Builds a render state on a host-supplied device (TS `createWgpuRenderState`). Synchronous:
/// adapter and device discovery happen before this call, and the screen target is created
/// separately and bound per pass.
pub fn create_wgpu_render_state(
    device: &WgpuDevice,
    options: Option<&WgpuRenderStateOptions>,
) -> WgpuRenderState {
    let defaults = WgpuRenderStateOptions::default();
    return initialize_wgpu_device_render_state(
        &create_wgpu_device_state(device),
        options.unwrap_or(&defaults),
        None,
    );
}

/// Builds a state runtime over a device tier with registries from `options` (TS
/// `createWgpuRenderStateRuntime`), taking one reference on the tier.
// flight-lint: allow(conform-params) the Rust form takes the device state; the TS runtime overload is reached through the state that owns it
pub fn create_wgpu_render_state_runtime(
    device_state: &WgpuDeviceState,
    options: Option<&WgpuRenderStateOptions>,
) -> WgpuRenderStateRuntime {
    let defaults = WgpuRenderStateOptions::default();
    let device_runtime = get_wgpu_device_runtime(device_state);
    let registries = build_wgpu_render_registries(options.unwrap_or(&defaults));
    return create_wgpu_render_state_runtime_internal(&device_runtime, registries);
}

fn create_wgpu_render_state_runtime_internal(
    device_runtime: &WgpuDeviceRuntimeRef,
    registries: WgpuRenderRegistries,
) -> WgpuRenderStateRuntime {
    let resources = ensure_wgpu_device_runtime_resources(device_runtime);
    let native = device_runtime.read().unwrap().native.clone();
    let uniform_stride = 256
        .max(native.device.limits().min_uniform_buffer_offset_alignment)
        .max(UNIFORM_BYTE_SIZE);
    let ring_byte_size = uniform_stride * RING_SLOT_COUNT;
    let uniform_buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: ring_byte_size as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let uniform_bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &resources.uniform_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &uniform_buffer,
                offset: 0,
                size: std::num::NonZeroU64::new(UNIFORM_BYTE_SIZE as u64),
            }),
        }],
    });
    device_runtime.write().unwrap().references += 1;
    return WgpuRenderStateRuntime {
        context: device_runtime.clone(),
        registries,
        modifier_snippet_revision: 0,
        apply_blend_mode_parent: Arc::new(RwLock::new(None)),
        current_blend_mode: None,
        teardowns: Vec::new(),
        borrowed_surface_extent: None,
        uniform_buffer,
        uniform_data: vec![0.0; (ring_byte_size / 4) as usize],
        uniform_offset: 0,
        uniform_stride,
        uniform_bind_group,
        matrix_array: [0.0; 9],
        mipmap_degraded_guard: None,
        mipmap_generator: None,
        wgpu_render_texture_guard: None,
        default_bitmap_shader: None,
        webgpu_shader_binding_resolver: None,
        shader_bindings: HashMap::new(),
        particle_instance_buffer: None,
        particle_instance_data: None,
        particle_instance_capacity: 0,
        quad_batch_writer_blend_mode: None,
        quad_batch_writer_material: None,
        quad_batch_writer_material_renderer: None,
        quad_batch_writer_material_floats: 0,
        quad_batch_writer_count: 0,
        quad_batch_writer_instance_data: vec![0.0; 13 * 256],
        quad_batch_writer_material_data: vec![0.0; 8 * 256],
        quad_batch_writer_texture: None,
        quad_batch_writer_sampler: None,
        quad_batch_writer_smoothing: None,
        quad_batch_writer_color_scale_bias_mode: None,
        quad_batch_writer_uniform_color_scale_bias: None,
        quad_batch_writer_color_scale_bias_data: None,
        quad_batch_writer_color_matrix_data: None,
        quad_batch_writer_color_tint_data: None,
        quad_batch_writer_buffer_pool: Vec::new(),
        quad_batch_writer_buffer_cursor: 0,
        mesh_instance_buffer_pool: Vec::new(),
        mesh_instance_buffer_cursor: 0,
        command_encoder: None,
        command_encoder_serial: 0,
        render_pass: None,
        frame_screen_target: None,
        surface_antialias_resolve_bind_group_layout: None,
        surface_antialias_resolve_pipeline: None,
        clip_forms: Vec::new(),
        current_mask_depth: 0,
        mask_write_mode: false,
        clip_contour_pipelines: None,
        clip_contour_stack: Vec::new(),
        retired_buffers: None,
        retired_textures: None,
        shape_mesh_pipelines: None,
        scissor_stack: Vec::new(),
        current_scissor_rect: None,
        render_target_viewport: None,
        current_color_format: None,
        current_render_target: None,
        pass_stack: Vec::new(),
        destroyed: false,
        effect_runtime: None,
        scene2d_runtime: None,
        scene3d_runtime: None,
    };
}

fn initialize_wgpu_device_render_state(
    device_state: &WgpuDeviceState,
    options: &WgpuRenderStateOptions,
    registries: Option<WgpuRenderRegistries>,
) -> WgpuRenderState {
    let format = options.format.unwrap_or(wgpu::TextureFormat::Bgra8Unorm);
    let device_runtime = get_wgpu_device_runtime(device_state);
    let registries = registries.unwrap_or_else(|| build_wgpu_render_registries(options));
    let runtime = create_wgpu_render_state_runtime_internal(&device_runtime, registries);
    let mut base = create_render_state();
    base.render.allow_smoothing = options.image_smoothing_enabled.unwrap_or(true);
    base.render.pixel_ratio = options.pixel_ratio.unwrap_or(1.0);
    base.render.round_pixels = options.round_pixels.unwrap_or(false);
    if let Some(policy) = options.scene_graph_sync_policy {
        base.render.scene_graph_sync_policy = policy;
    }
    let mut state = WgpuRenderState {
        render: base.render,
        render_runtime: create_render_state_runtime(),
        render_registries: flight_render::RenderRegistries::default(),
        apply_blend_mode: Arc::new(RwLock::new(None)),
        device_state: device_state.clone(),
        device: device_state.device.clone(),
        format,
        canvas_host: options.canvas_host.clone(),
        image_host: options.image_host.clone(),
        image_resolver: options.image_resolver.clone(),
        runtime,
    };
    warm_wgpu_pipelines(&mut state);
    return state;
}

/// Initializes a device state with its device (TS `initializeWgpuDeviceState`).
pub fn initialize_wgpu_device_state(out: &mut WgpuDeviceState, device: &WgpuDevice) {
    out.device = device.clone();
}

/// Writes the `device-lost` arm (TS `initializeWgpuOffscreenRenderStateDeviceLostResult`).
pub fn initialize_wgpu_offscreen_render_state_device_lost_result(
    out: &mut WgpuOffscreenRenderStateDeviceLost,
    info: WgpuDeviceLostInfo,
) {
    out.info = info;
}

/// Writes the `ok` arm (TS `initializeWgpuOffscreenRenderStateOkResult`).
pub fn initialize_wgpu_offscreen_render_state_ok_result(
    out: &mut WgpuOffscreenRenderStateOk,
    state: WgpuRenderState,
) {
    out.state = state;
}

/// Builds the WGPU registries from options (TS `buildWgpuRenderRegistries`); the backend-neutral
/// tables are built by `flight_render` and live in the state's render registries.
pub fn build_wgpu_render_registries(options: &WgpuRenderStateOptions) -> WgpuRenderRegistries {
    return WgpuRenderRegistries {
        color_adjustment_feature: options.color_adjustment_feature,
        color_adjustment_feature_guard: options.color_adjustment_feature_guard,
        compressed_texture_decoder: options.compressed_texture_decoder.clone(),
        compressed_texture_upload: options.compressed_texture_upload,
        custom_material_shaders: Arc::new(
            options
                .custom_material_shaders
                .clone()
                .unwrap_or_else(empty_kind_map),
        ),
        effects: Arc::new(options.effects.clone().unwrap_or_else(empty_kind_map)),
        gpu_skinning: options.gpu_skinning.clone(),
        material_renderers: Arc::new(
            options
                .material_renderers
                .clone()
                .unwrap_or_else(empty_kind_map),
        ),
        modifier_snippets: Arc::new(
            options
                .modifier_snippets
                .clone()
                .unwrap_or_else(empty_kind_map),
        ),
        passes: options.passes.clone().map(Arc::new),
        shape_rasterizer: options.shape_rasterizer.clone(),
        texture_resolvers: Arc::new(
            options
                .texture_resolvers
                .clone()
                .unwrap_or_else(empty_kind_map),
        ),
        velocity_writers: Arc::new(
            options
                .velocity_writers
                .clone()
                .unwrap_or_else(empty_kind_map),
        ),
    };
}

// Copies the backend-neutral renderer tables of `source` onto a freshly derived state, the
// counterpart of the source's `...sourceRuntime.registries` spread.
fn copy_renderer_policy_snapshot(target: &mut WgpuRenderState, source: &WgpuRenderState) {
    let from = &source.render_registries;
    let to = &mut target.render_registries;
    to.canvas_shape_commands = from.canvas_shape_commands.clone();
    to.clip_hooks = from.clip_hooks;
    to.color_adjustments = from.color_adjustments;
    to.color_adjustment_unsupported_guard = from.color_adjustment_unsupported_guard;
    to.effect_padding_resolvers = from.effect_padding_resolvers.clone();
    to.node_renderers = from.node_renderers.clone();
    to.render_root_guard = from.render_root_guard;
    to.skinned_mesh_bounds_guard = from.skinned_mesh_bounds_guard;
    to.stroke_tessellator = from.stroke_tessellator;
}

/// Destroys the GPU buffers this state allocated: the uniform ring, the particle instance buffer
/// and every pool slot's buffers (TS `destroyWgpuRenderState`). Runs the state's teardowns first,
/// and the device tier's when the last state on it is destroyed. Idempotent. Pipelines, layouts,
/// samplers and views are dropped with the state; uploaded textures are freed by their dispose
/// paths, and screen storage by `destroy_wgpu_screen_render_target`.
// flight-lint: allow(conform-params) D17 sketch A: render proxies are an explicit caller-owned store
pub fn destroy_wgpu_render_state(
    state: &mut WgpuRenderState,
    proxies: &mut RenderProxies2D<WgpuRenderState>,
) {
    if state.runtime.destroyed {
        return;
    }
    state.runtime.destroyed = true;
    let teardowns = state.runtime.teardowns.clone();
    for teardown in &teardowns {
        teardown(state);
    }
    state.runtime.teardowns.clear();
    destroy_render_state(state, proxies);
    let runtime = &mut state.runtime;
    runtime.uniform_buffer.destroy();
    if let Some(buffer) = &runtime.particle_instance_buffer {
        buffer.destroy();
    }
    for slot in &runtime.quad_batch_writer_buffer_pool {
        if let Some(buffer) = &slot.instance_buffer {
            buffer.destroy();
        }
        if let Some(buffer) = &slot.material_buffer {
            buffer.destroy();
        }
    }
    for slot in &runtime.mesh_instance_buffer_pool {
        if let Some(buffer) = &slot.buffer {
            buffer.destroy();
        }
    }
    let context = runtime.context.clone();
    let (references, native, teardowns) = {
        let mut device_runtime = context.write().unwrap();
        device_runtime.references -= 1;
        let teardowns = if device_runtime.references == 0 {
            std::mem::take(&mut device_runtime.teardowns)
        } else {
            Vec::new()
        };
        (
            device_runtime.references,
            device_runtime.native.clone(),
            teardowns,
        )
    };
    if references == 0 {
        for teardown in &teardowns {
            teardown(&native);
        }
    }
}

pub(crate) fn empty_kind_map<T>() -> KindMap<T> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

fn ensure_wgpu_device_runtime_resources(
    runtime: &WgpuDeviceRuntimeRef,
) -> WgpuDeviceRuntimeResources {
    if let Some(resources) = &runtime.read().unwrap().resources {
        return resources.clone();
    }
    let native = runtime.read().unwrap().native.clone();
    let layouts = create_wgpu_bind_group_layouts(&native);
    let linear_sampler = native.device.create_sampler(&wgpu::SamplerDescriptor {
        min_filter: wgpu::FilterMode::Linear,
        mag_filter: wgpu::FilterMode::Linear,
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        ..wgpu::SamplerDescriptor::default()
    });
    let nearest_sampler = native.device.create_sampler(&wgpu::SamplerDescriptor {
        min_filter: wgpu::FilterMode::Nearest,
        mag_filter: wgpu::FilterMode::Nearest,
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        ..wgpu::SamplerDescriptor::default()
    });
    let resources = WgpuDeviceRuntimeResources {
        linear_sampler,
        nearest_sampler,
        texture_bind_group_layout: layouts.texture_bind_group_layout,
        uniform_bind_group_layout: layouts.uniform_bind_group_layout,
    };
    runtime.write().unwrap().resources = Some(resources.clone());
    return resources;
}

/// The registered color-adjustment feature, or `None` (TS
/// `getWgpuColorAdjustmentMaterialFeature`).
pub fn get_wgpu_color_adjustment_material_feature(
    state: &WgpuRenderState,
) -> Option<&'static WgpuColorAdjustmentMaterialFeature> {
    return state.runtime.registries.color_adjustment_feature;
}

/// The registered color-adjustment feature guard, or `None` (TS
/// `getWgpuColorAdjustmentMaterialFeatureGuard`).
pub fn get_wgpu_color_adjustment_material_feature_guard(
    state: &WgpuRenderState,
) -> Option<WgpuColorAdjustmentMaterialFeatureGuard> {
    return state.runtime.registries.color_adjustment_feature_guard;
}

/// The device tier behind a device state (TS `getWgpuDeviceRuntime`).
pub fn get_wgpu_device_runtime(device_state: &WgpuDeviceState) -> WgpuDeviceRuntimeRef {
    return device_state
        .context
        .clone()
        .expect("a WgpuDeviceState is built by create_wgpu_device_state");
}

/// The device-native samplers and layouts, allocated on first use (TS
/// `getWgpuRenderStateDeviceResources`).
pub fn get_wgpu_render_state_device_resources(
    state: &WgpuRenderState,
) -> WgpuDeviceRuntimeResources {
    return ensure_wgpu_device_runtime_resources(&state.runtime.context);
}

/// The native device and queue a state draws on (the narrowed `state.device`).
// flight-lint: allow(conform-extra) D17: the narrowed native wgpu device and queue the state's host handle carries
pub fn get_wgpu_render_state_native_device(state: &WgpuRenderState) -> WgpuNativeDevice {
    return state.runtime.context.read().unwrap().native.clone();
}

/// The package-private GPU runtime of a state (TS `getWgpuRenderStateRuntime`).
pub fn get_wgpu_render_state_runtime(state: &WgpuRenderState) -> &WgpuRenderStateRuntime {
    return &state.runtime;
}

/// Mutable access to a state's GPU runtime; the render path writes its fields every frame.
// flight-lint: allow(conform-extra) the mutable twin of the source getWgpuRenderStateRuntime
pub fn get_wgpu_render_state_runtime_mut(
    state: &mut WgpuRenderState,
) -> &mut WgpuRenderStateRuntime {
    return &mut state.runtime;
}

/// A cached sampler for a filter, wrap, mip-filter and anisotropy combination, created on first
/// use (TS `getWgpuSampler`). Anisotropy above 1 forces linear min/mag/mip filtering, as WebGPU
/// requires; `None` mip filtering is wrap-only sampling. The key packs every axis into one number
/// so the per-bind lookup allocates nothing.
pub fn get_wgpu_sampler(
    state: &WgpuRenderState,
    min_filter: wgpu::FilterMode,
    mag_filter: wgpu::FilterMode,
    wrap_u: TextureWrap,
    wrap_v: TextureWrap,
    mipmap_filter: Option<wgpu::MipmapFilterMode>,
    max_anisotropy: Option<f32>,
) -> wgpu::Sampler {
    let anisotropy = 1.0_f32.max(max_anisotropy.unwrap_or(1.0).floor()) as u32;
    let effective_min_filter = if anisotropy > 1 {
        wgpu::FilterMode::Linear
    } else {
        min_filter
    };
    let effective_mag_filter = if anisotropy > 1 {
        wgpu::FilterMode::Linear
    } else {
        mag_filter
    };
    let effective_mipmap_filter = if anisotropy > 1 {
        Some(wgpu::MipmapFilterMode::Linear)
    } else {
        mipmap_filter
    };
    // min (1 bit) | mag (1) | wrapU (2) | wrapV (2) | mipmap (2) | anisotropy above them.
    let key = sampler_filter_bits(effective_min_filter)
        | (sampler_filter_bits(effective_mag_filter) << 1)
        | (sampler_wrap_bits(wrap_u) << 2)
        | (sampler_wrap_bits(wrap_v) << 4)
        | (effective_mipmap_filter
            .map(sampler_mipmap_bits)
            .unwrap_or(0)
            << 6)
        | (anisotropy << 8);
    let context = state.runtime.context.clone();
    if let Some(sampler) = context.read().unwrap().sampler_cache.get(&key) {
        return sampler.clone();
    }
    let native = context.read().unwrap().native.clone();
    let descriptor = wgpu::SamplerDescriptor {
        min_filter: effective_min_filter,
        mag_filter: effective_mag_filter,
        address_mode_u: wgpu_address_mode(wrap_u),
        address_mode_v: wgpu_address_mode(wrap_v),
        mipmap_filter: effective_mipmap_filter.unwrap_or(wgpu::MipmapFilterMode::Nearest),
        anisotropy_clamp: anisotropy as u16,
        ..wgpu::SamplerDescriptor::default()
    };
    let sampler = native.device.create_sampler(&descriptor);
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::CreateSampler(WgpuSamplerRecord {
            address_mode_u: descriptor.address_mode_u,
            address_mode_v: descriptor.address_mode_v,
            anisotropy_clamp: descriptor.anisotropy_clamp,
            mag_filter: descriptor.mag_filter,
            min_filter: descriptor.min_filter,
            mipmap_filter: descriptor.mipmap_filter,
            sampler: sampler.clone(),
        });
    });
    context
        .write()
        .unwrap()
        .sampler_cache
        .insert(key, sampler.clone());
    return sampler;
}

/// Whether the host can provide WebGPU (TS `isWgpuSupported`).
pub fn is_wgpu_supported(host_wgpu: &HostWgpuCapability) -> bool {
    return (host_wgpu.is_supported)();
}

// The private narrowing of a host device handle to its native payload. A foreign payload is a
// host-provider programming error: the source's device type admits no other value.
fn narrow_wgpu_native_device(device: &WgpuDevice) -> WgpuNativeDevice {
    return device
        .handle
        .downcast_ref::<WgpuNativeDevice>()
        .expect("WgpuDevice handle must carry a flight_render_wgpu::WgpuNativeDevice")
        .clone();
}

/// Queues a teardown that runs when the last state on this device is destroyed (TS
/// `registerWgpuDeviceTeardown`).
pub fn register_wgpu_device_teardown(state: &WgpuRenderState, teardown: WgpuDeviceTeardown) {
    state
        .runtime
        .context
        .write()
        .unwrap()
        .teardowns
        .push(teardown);
}

/// Queues a teardown that runs when this state is destroyed (TS
/// `registerWgpuRenderStateTeardown`).
pub fn register_wgpu_render_state_teardown(
    state: &mut WgpuRenderState,
    teardown: WgpuRenderStateTeardown,
) {
    state.runtime.teardowns.push(teardown);
}

/// The caller's own teardown for an acquisition they own (TS `releaseWgpuAcquisition`).
/// Unconditional by design: the caller is asking.
pub fn release_wgpu_acquisition(host_wgpu: &HostWgpuCapability, acquisition: &WgpuHostAcquisition) {
    (host_wgpu.release)(acquisition);
}

/// The blend hook in effect for a state (TS `resolveWgpuApplyBlendMode`): its own when installed,
/// otherwise the nearest one up its whole derivation chain, so support enabled after derivation is
/// visible to derived states.
pub fn resolve_wgpu_apply_blend_mode(state: &WgpuRenderState) -> Option<WgpuApplyBlendMode> {
    if let Some(hook) = *state.apply_blend_mode.read().unwrap() {
        return Some(hook);
    }
    let mut link = state
        .runtime
        .apply_blend_mode_parent
        .read()
        .unwrap()
        .clone();
    while let Some(parent) = link {
        if let Some(hook) = *parent.apply_blend_mode.read().unwrap() {
            return Some(hook);
        }
        link = parent.parent.read().unwrap().clone();
    }
    return None;
}

fn sampler_filter_bits(filter: wgpu::FilterMode) -> u32 {
    return match filter {
        wgpu::FilterMode::Nearest => 0,
        wgpu::FilterMode::Linear => 1,
    };
}

fn sampler_mipmap_bits(filter: wgpu::MipmapFilterMode) -> u32 {
    return match filter {
        wgpu::MipmapFilterMode::Nearest => 1,
        wgpu::MipmapFilterMode::Linear => 2,
    };
}

fn sampler_wrap_bits(wrap: TextureWrap) -> u32 {
    return match wrap {
        TextureWrap::ClampToEdge => 0,
        TextureWrap::MirrorRepeat => 1,
        TextureWrap::Repeat => 2,
    };
}

fn wgpu_address_mode(wrap: TextureWrap) -> wgpu::AddressMode {
    return match wrap {
        TextureWrap::ClampToEdge => wgpu::AddressMode::ClampToEdge,
        TextureWrap::MirrorRepeat => wgpu::AddressMode::MirrorRepeat,
        TextureWrap::Repeat => wgpu::AddressMode::Repeat,
    };
}
