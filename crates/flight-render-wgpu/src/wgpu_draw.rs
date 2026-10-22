// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Texture realization caches and the immediate 2D quad draw path (TS `wgpuDraw.ts`). Uploaded
//! textures are keyed by the source's identity (an entity's numeric id, or the exact host image),
//! guarded by content version and by the mip allocation, which is part of a resource's identity.
//! Which sampler a draw uses is draw policy, resolved per draw and never captured into a resource.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_bitmap::Bitmap;
use flight_entity::{EntityRuntimeSlot, Ref, get_entity_id};
use flight_geometry::Matrix;
use flight_host::HostImageSource;
use flight_image::{CompressedImageResource, ImageResource};
use flight_materials::{BLEND_MODE_ADD, BLEND_MODE_NORMAL, BlendMode, ColorScaleBias};
use flight_render::RenderProxy2D;
use flight_texture::{
    AlphaType, TextureColorSpace, TextureFilter, TextureVariant, get_texture_source,
};

use crate::types::*;
use crate::wgpu_command_observer::write_wgpu_texture;
use crate::wgpu_external_image_source::{
    is_wgpu_external_image_source_ready, narrow_wgpu_external_image_source,
    try_copy_wgpu_external_image_to_texture,
};
use crate::wgpu_frame::retire_wgpu_texture;
use crate::wgpu_mipmap::get_wgpu_mip_level_count;
use crate::wgpu_render_state::{
    get_wgpu_render_state_device_resources, get_wgpu_render_state_native_device, get_wgpu_sampler,
};
use crate::wgpu_shader::{
    WgpuStencilMode, get_active_wgpu_pipeline, get_wgpu_pipeline, write_wgpu_quad_uniforms,
};

// The texture sources the shared version-guarded cache bracket accepts, each with its own uploader.
enum WgpuTextureSourceRef<'a> {
    Bitmap(&'a Bitmap),
    Compressed(&'a CompressedImageResource),
    Image(&'a ImageResource),
}

pub(crate) fn create_wgpu_sampled_texture(
    native: &WgpuNativeDevice,
    width: u32,
    height: u32,
    format: wgpu::TextureFormat,
    mip_level_count: u32,
) -> wgpu::Texture {
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_DST
            | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
}

/// Allocates a texture entry from a host canvas's current pixels (TS `createWgpuTextureEntry`);
/// `None` when the canvas is not ready or the copy reports it unavailable.
pub fn create_wgpu_texture_entry(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
    canvas: &HostImageSource,
) -> Option<Ref<WgpuTextureEntry>> {
    let native = get_wgpu_render_state_native_device(state);
    let w = width.max(1);
    let h = height.max(1);
    let source = narrow_wgpu_external_image_source(canvas);
    if !is_wgpu_external_image_source_ready(source.as_ref(), w, h) {
        return None;
    }
    let texture = create_wgpu_sampled_texture(&native, w, h, wgpu::TextureFormat::Rgba8Unorm, 1);
    if !try_copy_wgpu_external_image_to_texture(
        &native.queue,
        source.as_ref(),
        &texture,
        wgpu::Origin3d::ZERO,
        true,
        w,
        h,
    ) {
        texture.destroy();
        return None;
    }
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let mut out = new_wgpu_texture_entry_value(texture.clone(), view.clone(), 1);
    initialize_wgpu_texture_entry(&mut out, texture, view);
    return Some(Arc::new(RwLock::new(out)));
}

/// Writes a fresh single-level entry over `texture`/`view` into `out` (TS
/// `initializeWgpuTextureEntry`).
pub fn initialize_wgpu_texture_entry(
    out: &mut WgpuTextureEntry,
    texture: wgpu::Texture,
    view: wgpu::TextureView,
) {
    out.bindings = WgpuTextureBindings::new();
    out.mip_level_count = 1;
    out.texture = texture;
    out.view = view;
}

/// Records the blend mode the next draw's pipeline bakes (TS `applyWgpuBlendMode`).
pub fn apply_wgpu_blend_mode(state: &mut WgpuRenderState, blend_mode: Option<&BlendMode>) {
    state.runtime.current_blend_mode = blend_mode.cloned();
}

pub(crate) fn base_filter(filter: TextureFilter) -> wgpu::FilterMode {
    return match filter {
        TextureFilter::Nearest
        | TextureFilter::NearestMipmapLinear
        | TextureFilter::NearestMipmapNearest => wgpu::FilterMode::Nearest,
        TextureFilter::Linear
        | TextureFilter::LinearMipmapLinear
        | TextureFilter::LinearMipmapNearest => wgpu::FilterMode::Linear,
    };
}

/// Uploads and caches a Bitmap's texture (TS `bindWgpuBitmapTexture`). Premultiplied and straight,
/// sRGB and linear requests use separate caches; a content version bump re-uploads in place.
pub fn bind_wgpu_bitmap_texture(
    state: &mut WgpuRenderState,
    bitmap: &Bitmap,
    generate_mips: Option<bool>,
    premultiply: Option<bool>,
    color_space: Option<TextureColorSpace>,
) -> Ref<WgpuTextureEntry> {
    return bind_wgpu_texture_source_texture(
        state,
        WgpuTextureSourceRef::Bitmap(bitmap),
        generate_mips.unwrap_or(false),
        premultiply.unwrap_or(false),
        color_space.unwrap_or(TextureColorSpace::Linear),
    )
    .expect("a bitmap always uploads");
}

/// Uploads and caches a compressed image's texture through the registered uploader (TS
/// `bindWgpuCompressedImageTexture`); `None` without one.
pub fn bind_wgpu_compressed_image_texture(
    state: &mut WgpuRenderState,
    image: &CompressedImageResource,
    color_space: Option<TextureColorSpace>,
) -> Option<Ref<WgpuTextureEntry>> {
    return bind_wgpu_texture_source_texture(
        state,
        WgpuTextureSourceRef::Compressed(image),
        false,
        false,
        color_space.unwrap_or(TextureColorSpace::Linear),
    );
}

/// Uploads and caches a host image resource's texture through the external copy (TS
/// `bindWgpuImageResourceTexture`); `None` until the source is ready.
pub fn bind_wgpu_image_resource_texture(
    state: &mut WgpuRenderState,
    image: &ImageResource,
    generate_mips: Option<bool>,
    premultiply: Option<bool>,
    color_space: Option<TextureColorSpace>,
) -> Option<Ref<WgpuTextureEntry>> {
    return bind_wgpu_texture_source_texture(
        state,
        WgpuTextureSourceRef::Image(image),
        generate_mips.unwrap_or(false),
        premultiply.unwrap_or(false),
        color_space.unwrap_or(TextureColorSpace::Linear),
    );
}

/// Uploads and caches a raw host image's texture, keyed by the exact image (TS `bindWgpuTexture`).
/// Stored premultiplied, matching the premultiplied blend and shaders; the copy declares the
/// destination encoding and the host derives any conversion. With `generate_mips` and a registered
/// generator the lower levels are rendered after the copy. `None` until the source is ready, and
/// when the copy reports the source unavailable (the allocation is freed and the call retried).
pub fn bind_wgpu_texture(
    state: &mut WgpuRenderState,
    image_source: &Arc<HostImageSource>,
    generate_mips: Option<bool>,
) -> Option<Ref<WgpuTextureEntry>> {
    let generate_mips = generate_mips.unwrap_or(false);
    let wants_mips = generate_mips && state.runtime.mipmap_generator.is_some();
    let cached = find_wgpu_texture_cache_entry(state, image_source);
    if let Some(cached) = &cached
        && (cached.read().unwrap().mip_level_count > 1) == wants_mips
    {
        return Some(cached.clone());
    }

    let native = get_wgpu_render_state_native_device(state);
    let source = narrow_wgpu_external_image_source(image_source);
    let width = non_zero_or_one(source.width());
    let height = non_zero_or_one(source.height());
    if !is_wgpu_external_image_source_ready(source.as_ref(), width, height) {
        return None;
    }
    if generate_mips
        && state.runtime.mipmap_generator.is_none()
        && let Some(guard) = state.runtime.mipmap_degraded_guard.clone()
    {
        guard(state);
    }
    let mip_level_count = if wants_mips {
        get_wgpu_mip_level_count(width, height)
    } else {
        1
    };
    let texture = create_wgpu_sampled_texture(
        &native,
        width,
        height,
        wgpu::TextureFormat::Rgba8Unorm,
        mip_level_count,
    );
    if !try_copy_wgpu_external_image_to_texture(
        &native.queue,
        source.as_ref(),
        &texture,
        wgpu::Origin3d::ZERO,
        true,
        width,
        height,
    ) {
        texture.destroy();
        return None;
    }
    // The copy fills level 0 only; render the remaining levels by downsampling.
    if mip_level_count > 1
        && let Some(generator) = state.runtime.mipmap_generator
    {
        generator(
            state,
            &texture,
            width,
            height,
            wgpu::TextureFormat::Rgba8Unorm,
        );
    }
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    // No bind group is built here: the sampler is chosen per draw.
    let entry = new_wgpu_texture_entry(texture, view, mip_level_count);
    let mut context = state.runtime.context.write().unwrap();
    context.texture_cache.retain(|(source, _)| {
        source.strong_count() > 0 && !std::ptr::eq(source.as_ptr(), Arc::as_ptr(image_source))
    });
    context
        .texture_cache
        .push((Arc::downgrade(image_source), entry.clone()));
    return Some(entry);
}

fn bind_wgpu_texture_source_texture(
    state: &mut WgpuRenderState,
    image: WgpuTextureSourceRef<'_>,
    generate_mips: bool,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    let (id, version) = match &image {
        WgpuTextureSourceRef::Bitmap(bitmap) => (get_entity_id(*bitmap), bitmap.version),
        WgpuTextureSourceRef::Compressed(compressed) => {
            (get_entity_id(*compressed), compressed.version)
        }
        WgpuTextureSourceRef::Image(resource) => (get_entity_id(*resource), resource.version),
    };
    let cached = {
        let context = state.runtime.context.read().unwrap();
        texture_source_cache(&context, premultiply, color_space)
            .get(&id)
            .cloned()
    };
    // Mip allocation is part of the identity, not a sampling preference: a cached level-0-only
    // realization cannot serve a request that needs a chain however it is sampled.
    let wants_mips = generate_mips && state.runtime.mipmap_generator.is_some();
    if let Some(cached) = &cached {
        let entry = cached.read().unwrap();
        if entry.version == Some(version) && (entry.mip_level_count > 1) == wants_mips {
            return Some(cached.clone());
        }
    }

    let built = match image {
        WgpuTextureSourceRef::Bitmap(bitmap) => Some(upload_wgpu_bitmap_entry(
            state,
            bitmap,
            generate_mips,
            premultiply,
            color_space,
        )),
        WgpuTextureSourceRef::Compressed(compressed) => {
            upload_wgpu_compressed_image_entry(state, compressed, color_space)
        }
        WgpuTextureSourceRef::Image(resource) => upload_wgpu_image_resource_entry(
            state,
            resource,
            generate_mips,
            premultiply,
            color_space,
        ),
    };
    let Some(built) = built else {
        return cached;
    };
    if let Some(cached) = cached {
        // RETIRED, NOT DESTROYED: this rewrites the cached entry in place on a version bump, so a bind
        // group recorded earlier in this frame still points at the outgoing texture.
        let built = built.read().unwrap();
        let outgoing = cached.read().unwrap().texture.clone();
        retire_wgpu_texture(state, outgoing);
        let mut entry = cached.write().unwrap();
        entry.texture = built.texture.clone();
        entry.view = built.view.clone();
        entry.mip_level_count = built.mip_level_count;
        // Every cached bind group referenced the old view; drop them so they rebuild.
        entry.bindings.clear();
        entry.straight_alpha = built.straight_alpha;
        entry.version = Some(version);
        drop(entry);
        return Some(cached);
    }
    built.write().unwrap().version = Some(version);
    let mut context = state.runtime.context.write().unwrap();
    texture_source_cache_mut(&mut context, premultiply, color_space).insert(id, built.clone());
    return Some(built);
}

/// Uploads a host video's current frame, caching by its image resource and copying only when its
/// version advances (TS `bindWgpuVideoTexture`). A resolution change recreates the allocation; a
/// sampler change only rebinds. `None` until the element has a decoded frame.
pub fn bind_wgpu_video_texture(
    state: &mut WgpuRenderState,
    video_texture: &dyn TextureVariant,
) -> Option<Ref<WgpuTextureEntry>> {
    let source_ref = get_texture_source(video_texture)?;
    let source_read = source_ref.read().unwrap();
    let image = (&*source_read as &dyn std::any::Any).downcast_ref::<ImageResource>()?;
    let element = narrow_wgpu_external_image_source(&image.source);
    let width = element.width();
    let height = element.height();
    if width == 0 || height == 0 || !element.is_ready(width, height) {
        return None;
    }
    let image_id = get_entity_id(image);
    let image_version = image.version;
    drop(source_read);

    let srgb = video_texture.texture_fields().color_space == TextureColorSpace::Srgb;
    let sampler = get_wgpu_video_sampler(state, video_texture);
    let native = get_wgpu_render_state_native_device(state);
    let existing = {
        let mut context = state.runtime.context.write().unwrap();
        let cache = if srgb {
            context
                .video_srgb_texture_cache
                .get_or_insert_with(HashMap::new)
        } else {
            context.video_texture_cache.get_or_insert_with(HashMap::new)
        };
        cache.get(&image_id).cloned()
    };
    let resized = existing.as_ref().is_none_or(|entry| {
        let video = entry.read().unwrap().video.unwrap();
        return video.width != width || video.height != height;
    });
    let entry = if resized {
        if let Some(entry) = &existing {
            entry.read().unwrap().texture.destroy();
        }
        let format = if srgb {
            wgpu::TextureFormat::Rgba8UnormSrgb
        } else {
            wgpu::TextureFormat::Rgba8Unorm
        };
        let texture = create_wgpu_sampled_texture(&native, width, height, format, 1);
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let entry = new_wgpu_texture_entry(texture, view, 1);
        {
            let mut write = entry.write().unwrap();
            write.sampler = Some(sampler.clone());
            write.video = Some(WgpuVideoTextureState {
                height,
                uploaded_version: -1,
                width,
            });
        }
        let mut context = state.runtime.context.write().unwrap();
        let cache = if srgb {
            context.video_srgb_texture_cache.as_mut().unwrap()
        } else {
            context.video_texture_cache.as_mut().unwrap()
        };
        cache.insert(image_id, entry.clone());
        entry
    } else {
        let entry = existing.unwrap();
        // Video carries its own resolved sampler rather than following the global policy, so record
        // the change; its bind group is resolved on demand from the per-sampler cache.
        let mut write = entry.write().unwrap();
        if write.sampler.as_ref() != Some(&sampler) {
            write.sampler = Some(sampler);
        }
        drop(write);
        entry
    };

    let uploaded_version = entry.read().unwrap().video.unwrap().uploaded_version;
    if uploaded_version != image_version as i64 {
        let texture = entry.read().unwrap().texture.clone();
        let copied = try_copy_wgpu_external_image_to_texture(
            &native.queue,
            element.as_ref(),
            &texture,
            wgpu::Origin3d::ZERO,
            true,
            width,
            height,
        );
        if !copied {
            return if uploaded_version < 0 {
                None
            } else {
                Some(entry)
            };
        }
        entry
            .write()
            .unwrap()
            .video
            .as_mut()
            .unwrap()
            .uploaded_version = image_version as i64;
    }
    return Some(entry);
}

fn build_wgpu_texture_bind_group(
    state: &WgpuRenderState,
    view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let resources = get_wgpu_render_state_device_resources(state);
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
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    });
}

// flight-lint: allow(f64) Uint8ClampedArray assignment takes a double
// Uint8ClampedArray assignment: round half to even, clamped to the byte range.
fn clamp_u8(value: f64) -> u8 {
    return value.round_ties_even().clamp(0.0, 255.0) as u8;
}

// flight-lint: allow(f64) mirrors the source double-precision alpha math so Uint8ClampedArray rounding matches
// Converts RGBA8 between straight and premultiplied alpha in either direction. A fully transparent
// texel carries no recoverable color either way, so it stays zero rather than dividing by zero.
fn convert_rgba8_alpha_encoding(data: &[u8], to_premultiplied: bool) -> Vec<u8> {
    let mut out = vec![0u8; data.len()];
    let mut i = 0;
    while i + 3 < data.len() {
        let a = data[i + 3];
        let scale = if to_premultiplied {
            a as f64 / 255.0
        } else if a == 0 {
            0.0
        } else {
            255.0 / a as f64
        };
        out[i] = clamp_u8(data[i] as f64 * scale);
        out[i + 1] = clamp_u8(data[i + 1] as f64 * scale);
        out[i + 2] = clamp_u8(data[i + 2] as f64 * scale);
        out[i + 3] = a;
        i += 4;
    }
    return out;
}

/// Frees a video texture's cached allocations, both color interpretations (TS
/// `destroyWgpuVideoTexture`); `false` when none existed.
pub fn destroy_wgpu_video_texture(
    state: &mut WgpuRenderState,
    video_texture: &dyn TextureVariant,
) -> bool {
    let Some(source_ref) = get_texture_source(video_texture) else {
        return false;
    };
    let image_id = get_entity_id(&*source_ref.read().unwrap());
    let mut destroyed = false;
    let mut context = state.runtime.context.write().unwrap();
    let context = &mut *context;
    for cache in [
        context.video_texture_cache.as_mut(),
        context.video_srgb_texture_cache.as_mut(),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(entry) = cache.remove(&image_id) {
            entry.read().unwrap().texture.destroy();
            destroyed = true;
        }
    }
    return destroyed;
}

/// Draws one textured quad with the proxy's transform, alpha and color adjustment (TS
/// `drawWgpuQuad`). No-op outside a pass.
pub fn draw_wgpu_quad(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
    texture_entry: &Ref<WgpuTextureEntry>,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) {
    if state.runtime.render_pass.is_none() {
        return;
    }
    let color_scale_bias = get_wgpu_render_proxy_color_scale_bias(render_proxy);
    let straight_alpha = texture_entry.read().unwrap().straight_alpha == Some(true);
    let uniform_offset = write_wgpu_quad_uniforms(
        state,
        render_proxy.alpha,
        &render_proxy.transform_2d,
        color_scale_bias.as_ref(),
        x0,
        y0,
        x1,
        y1,
        u0,
        v0,
        u1,
        v1,
        straight_alpha,
    );
    let bind_group = resolve_wgpu_smoothing_bind_group(state, texture_entry, None);
    submit_wgpu_quad_draw(state, uniform_offset, &bind_group);
}

/// Draws one textured quad with an explicit transform (TS `drawWgpuQuadWithTransform`).
// flight-lint: allow(conform-params) the source's renderProxy argument contributes its alpha and color adjustment
pub fn draw_wgpu_quad_with_transform(
    state: &mut WgpuRenderState,
    alpha: f32,
    color_scale_bias: Option<&ColorScaleBias>,
    transform: &Matrix,
    texture_entry: &Ref<WgpuTextureEntry>,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) {
    if state.runtime.render_pass.is_none() {
        return;
    }
    let straight_alpha = texture_entry.read().unwrap().straight_alpha == Some(true);
    let uniform_offset = write_wgpu_quad_uniforms(
        state,
        alpha,
        transform,
        color_scale_bias,
        x0,
        y0,
        x1,
        y1,
        u0,
        v0,
        u1,
        v1,
        straight_alpha,
    );
    let bind_group = resolve_wgpu_smoothing_bind_group(state, texture_entry, None);
    submit_wgpu_quad_draw(state, uniform_offset, &bind_group);
}

/// Installs fixed-function blend support on the state (TS `enableWgpuBlendModeSupport`).
pub fn enable_wgpu_blend_mode_support(state: &mut WgpuRenderState) {
    *state.apply_blend_mode.write().unwrap() = Some(apply_wgpu_blend_mode);
}

fn find_wgpu_texture_cache_entry(
    state: &WgpuRenderState,
    image_source: &Arc<HostImageSource>,
) -> Option<Ref<WgpuTextureEntry>> {
    let context = state.runtime.context.read().unwrap();
    return context
        .texture_cache
        .iter()
        .find(|(source, _)| std::ptr::eq(source.as_ptr(), Arc::as_ptr(image_source)))
        .map(|(_, entry)| entry.clone());
}

// The sampler the state's CURRENT draw policy selects, read per draw and never stored.
fn get_wgpu_draw_policy_sampler(state: &WgpuRenderState) -> wgpu::Sampler {
    let resources = get_wgpu_render_state_device_resources(state);
    return if state.render.allow_smoothing {
        resources.linear_sampler
    } else {
        resources.nearest_sampler
    };
}

/// The proxy's effective node color adjustment (TS `getWgpuRenderProxyColorScaleBias`).
pub fn get_wgpu_render_proxy_color_scale_bias(
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) -> Option<ColorScaleBias> {
    return render_proxy.color_scale_bias.clone();
}

// A live frame carries its base level only, so mip-aware filters collapse to their base filter.
fn get_wgpu_video_sampler(
    state: &WgpuRenderState,
    video_texture: &dyn TextureVariant,
) -> wgpu::Sampler {
    let sampler = &video_texture.texture_fields().sampler;
    return get_wgpu_sampler(
        state,
        base_filter(sampler.min_filter),
        base_filter(sampler.mag_filter),
        sampler.wrap_u,
        sampler.wrap_v,
        None,
        Some(sampler.anisotropy),
    );
}

pub(crate) fn new_wgpu_texture_entry(
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    mip_level_count: u32,
) -> Ref<WgpuTextureEntry> {
    return Arc::new(RwLock::new(new_wgpu_texture_entry_value(
        texture,
        view,
        mip_level_count,
    )));
}

pub(crate) fn new_wgpu_texture_entry_value(
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    mip_level_count: u32,
) -> WgpuTextureEntry {
    return WgpuTextureEntry {
        runtime: EntityRuntimeSlot::default(),
        bindings: WgpuTextureBindings::new(),
        mip_level_count,
        sampler: None,
        straight_alpha: None,
        texture,
        view,
        version: None,
        video: None,
    };
}

fn non_zero_or_one(value: u32) -> u32 {
    return if value == 0 { 1 } else { value };
}

/// The group(1) bind group a bitmap samples through (TS `resolveWgpuSmoothingBindGroup`): `None`
/// follows the entry's own sampler or the state's current smoothing policy, `Some` overrides it
/// with the linear or nearest sampler. Every arm resolves through the entry's per-sampler cache.
pub fn resolve_wgpu_smoothing_bind_group(
    state: &WgpuRenderState,
    entry: &Ref<WgpuTextureEntry>,
    smoothing: Option<bool>,
) -> wgpu::BindGroup {
    let resources = get_wgpu_render_state_device_resources(state);
    let sampler = match smoothing {
        None => entry
            .read()
            .unwrap()
            .sampler
            .clone()
            .unwrap_or_else(|| get_wgpu_draw_policy_sampler(state)),
        Some(true) => resources.linear_sampler,
        Some(false) => resources.nearest_sampler,
    };
    return resolve_wgpu_texture_binding(state, entry, &sampler);
}

// The group(1) bind group for an entry's view sampled with `sampler`, built once per sampler and
// memoized on the entry.
fn resolve_wgpu_texture_binding(
    state: &WgpuRenderState,
    entry: &Ref<WgpuTextureEntry>,
    sampler: &wgpu::Sampler,
) -> wgpu::BindGroup {
    if let Some(cached) = entry.read().unwrap().bindings.get(sampler) {
        return cached.clone();
    }
    let view = entry.read().unwrap().view.clone();
    let bind_group = build_wgpu_texture_bind_group(state, &view, sampler);
    entry
        .write()
        .unwrap()
        .bindings
        .insert(sampler.clone(), bind_group.clone());
    return bind_group;
}

/// Records one quad draw with the active pipeline, the uniform slot and a texture bind group (TS
/// `submitWgpuQuadDraw`). No-op outside a pass.
pub fn submit_wgpu_quad_draw(
    state: &mut WgpuRenderState,
    uniform_offset: u32,
    texture_bind_group: &wgpu::BindGroup,
) {
    if state.runtime.render_pass.is_none() {
        return;
    }
    let pipeline = get_active_wgpu_pipeline(state);
    let runtime = &mut state.runtime;
    let mask_depth = runtime.current_mask_depth;
    let uniform_bind_group = runtime.uniform_bind_group.clone();
    let pass = runtime.render_pass.as_mut().unwrap();
    pass.set_pipeline(&pipeline);
    pass.set_bind_group(0, &uniform_bind_group, &[uniform_offset]);
    pass.set_bind_group(1, texture_bind_group, &[]);
    if mask_depth > 0 {
        pass.set_stencil_reference(mask_depth);
    }
    pass.draw(0..6, 0..1);
}

fn texture_source_cache(
    context: &WgpuDeviceRuntime,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> &HashMap<u64, Ref<WgpuTextureEntry>> {
    return match (premultiply, color_space) {
        (true, TextureColorSpace::Srgb) => &context.texture_source_premultiplied_srgb_texture_cache,
        (true, TextureColorSpace::Linear) => &context.texture_source_premultiplied_texture_cache,
        (false, TextureColorSpace::Srgb) => &context.texture_source_straight_srgb_texture_cache,
        (false, TextureColorSpace::Linear) => &context.texture_source_straight_texture_cache,
    };
}

fn texture_source_cache_mut(
    context: &mut WgpuDeviceRuntime,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> &mut HashMap<u64, Ref<WgpuTextureEntry>> {
    return match (premultiply, color_space) {
        (true, TextureColorSpace::Srgb) => {
            &mut context.texture_source_premultiplied_srgb_texture_cache
        }
        (true, TextureColorSpace::Linear) => {
            &mut context.texture_source_premultiplied_texture_cache
        }
        (false, TextureColorSpace::Srgb) => &mut context.texture_source_straight_srgb_texture_cache,
        (false, TextureColorSpace::Linear) => &mut context.texture_source_straight_texture_cache,
    };
}

/// Re-copies a host canvas into an existing entry (TS `updateWgpuTextureEntry`); no-op until the
/// canvas is ready.
pub fn update_wgpu_texture_entry(
    state: &WgpuRenderState,
    entry: &Ref<WgpuTextureEntry>,
    canvas: &HostImageSource,
) {
    let native = get_wgpu_render_state_native_device(state);
    let source = narrow_wgpu_external_image_source(canvas);
    let w = source.width().max(1);
    let h = source.height().max(1);
    if !is_wgpu_external_image_source_ready(source.as_ref(), w, h) {
        return;
    }
    let texture = entry.read().unwrap().texture.clone();
    try_copy_wgpu_external_image_to_texture(
        &native.queue,
        source.as_ref(),
        &texture,
        wgpu::Origin3d::ZERO,
        true,
        w,
        h,
    );
}

// Allocates a texture for a Bitmap and writes its pixels, resolving its declared alpha encoding to
// the requested one in either direction.
fn upload_wgpu_bitmap_entry(
    state: &mut WgpuRenderState,
    bitmap: &Bitmap,
    generate_mips: bool,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Ref<WgpuTextureEntry> {
    let native = get_wgpu_render_state_native_device(state);
    let width = non_zero_or_one(bitmap.width);
    let height = non_zero_or_one(bitmap.height);
    if generate_mips
        && state.runtime.mipmap_generator.is_none()
        && let Some(guard) = state.runtime.mipmap_degraded_guard.clone()
    {
        guard(state);
    }
    let mip_level_count = if generate_mips && state.runtime.mipmap_generator.is_some() {
        get_wgpu_mip_level_count(width, height)
    } else {
        1
    };
    let format = if color_space == TextureColorSpace::Srgb {
        wgpu::TextureFormat::Rgba8UnormSrgb
    } else {
        wgpu::TextureFormat::Rgba8Unorm
    };
    let texture = create_wgpu_sampled_texture(&native, width, height, format, mip_level_count);
    let premultiplied = bitmap.alpha_type == AlphaType::Premultiplied;
    let converted;
    let data: &[u8] = if premultiply && !premultiplied {
        converted = convert_rgba8_alpha_encoding(&bitmap.data, true);
        &converted
    } else if !premultiply && premultiplied {
        converted = convert_rgba8_alpha_encoding(&bitmap.data, false);
        &converted
    } else {
        &bitmap.data
    };
    write_wgpu_texture(
        &native,
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        data,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    if mip_level_count > 1
        && let Some(generator) = state.runtime.mipmap_generator
    {
        generator(state, &texture, width, height, format);
    }
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    return new_wgpu_texture_entry(texture, view, mip_level_count);
}

fn upload_wgpu_compressed_image_entry(
    state: &mut WgpuRenderState,
    image: &CompressedImageResource,
    color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    let upload = state.runtime.registries.compressed_texture_upload?;
    let decoder = state.runtime.registries.compressed_texture_decoder.clone();
    return upload(state, image, decoder.as_ref(), Some(color_space));
}

fn upload_wgpu_image_resource_entry(
    state: &mut WgpuRenderState,
    resource: &ImageResource,
    generate_mips: bool,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    let native = get_wgpu_render_state_native_device(state);
    let width = non_zero_or_one(resource.width);
    let height = non_zero_or_one(resource.height);
    let source = narrow_wgpu_external_image_source(&resource.source);
    if !is_wgpu_external_image_source_ready(source.as_ref(), width, height) {
        return None;
    }
    if generate_mips
        && state.runtime.mipmap_generator.is_none()
        && let Some(guard) = state.runtime.mipmap_degraded_guard.clone()
    {
        guard(state);
    }
    let mip_level_count = if generate_mips && state.runtime.mipmap_generator.is_some() {
        get_wgpu_mip_level_count(width, height)
    } else {
        1
    };
    let format = if color_space == TextureColorSpace::Srgb {
        wgpu::TextureFormat::Rgba8UnormSrgb
    } else {
        wgpu::TextureFormat::Rgba8Unorm
    };
    let texture = create_wgpu_sampled_texture(&native, width, height, format, mip_level_count);
    if !try_copy_wgpu_external_image_to_texture(
        &native.queue,
        source.as_ref(),
        &texture,
        wgpu::Origin3d::ZERO,
        premultiply,
        width,
        height,
    ) {
        texture.destroy();
        return None;
    }
    if mip_level_count > 1
        && let Some(generator) = state.runtime.mipmap_generator
    {
        generator(state, &texture, width, height, format);
    }
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    return Some(new_wgpu_texture_entry(texture, view, mip_level_count));
}

/// Pre-builds the normal and additive pipelines so the first frame does not stall (TS
/// `warmWgpuPipelines`).
pub fn warm_wgpu_pipelines(state: &mut WgpuRenderState) {
    get_wgpu_pipeline(
        state,
        Some(&BLEND_MODE_NORMAL.to_string()),
        WgpuStencilMode::Normal,
    );
    get_wgpu_pipeline(
        state,
        Some(&BLEND_MODE_ADD.to_string()),
        WgpuStencilMode::Normal,
    );
}
