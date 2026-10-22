// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Offscreen, sampleable render targets (TS `wgpuTextureRenderTarget.ts`).

use flight_entity::EntityRuntimeSlot;
use flight_geometry::{Matrix, create_matrix};
use flight_materials::ColorScaleBias;
use flight_texture::RenderTargetColorSpace;

use crate::types::*;
use crate::wgpu_draw::draw_wgpu_quad_with_transform;
use crate::wgpu_render_state::get_wgpu_render_state_native_device;

fn create_wgpu_render_target_color_texture(
    native: &WgpuNativeDevice,
    width: u32,
    height: u32,
    format: wgpu::TextureFormat,
) -> wgpu::Texture {
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
}

fn create_wgpu_render_target_depth_texture(
    native: &WgpuNativeDevice,
    width: u32,
    height: u32,
) -> wgpu::Texture {
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth24PlusStencil8,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
}

/// Allocates a texture target (TS `createWgpuTextureRenderTarget`). `format` defaults to the
/// state's; a sample count above 1 allocates 2x per axis (four coverage samples).
pub fn create_wgpu_texture_render_target(
    state: &WgpuRenderState,
    width: f32,
    height: f32,
    format: Option<wgpu::TextureFormat>,
    color_space: Option<RenderTargetColorSpace>,
    sample_count: Option<u32>,
) -> WgpuTextureRenderTarget {
    return build_wgpu_texture_render_target(
        state,
        width,
        height,
        format,
        color_space,
        sample_count,
        EntityRuntimeSlot::default(),
    );
}

/// Reallocates `out` as a texture target (TS `initializeWgpuTextureRenderTarget`), keeping its
/// entity identity.
pub fn initialize_wgpu_texture_render_target(
    out: &mut WgpuTextureRenderTarget,
    state: &WgpuRenderState,
    width: f32,
    height: f32,
    format: Option<wgpu::TextureFormat>,
    color_space: Option<RenderTargetColorSpace>,
    sample_count: Option<u32>,
) {
    let runtime = std::mem::take(&mut out.runtime);
    *out = build_wgpu_texture_render_target(
        state,
        width,
        height,
        format,
        color_space,
        sample_count,
        runtime,
    );
}

fn assert_wgpu_texture_render_target_extent(
    native: &WgpuNativeDevice,
    width: u32,
    height: u32,
    samples: u32,
) {
    let max_dimension = native.device.limits().max_texture_dimension_2d;
    if width > max_dimension || height > max_dimension {
        panic!(
            "Wgpu render target sampleCount {samples} requires a {width}x{height} texture, exceeding maxTextureDimension2D {max_dimension}."
        );
    }
}

fn build_wgpu_texture_render_target(
    state: &WgpuRenderState,
    width: f32,
    height: f32,
    format: Option<wgpu::TextureFormat>,
    color_space: Option<RenderTargetColorSpace>,
    sample_count: Option<u32>,
    runtime: EntityRuntimeSlot,
) -> WgpuTextureRenderTarget {
    let native = get_wgpu_render_state_native_device(state);
    let format = format.unwrap_or(state.format);
    let (w, h, samples) =
        resolve_wgpu_texture_render_target_extent(width, height, sample_count.unwrap_or(1));
    assert_wgpu_texture_render_target_extent(&native, w, h, samples);
    let texture = create_wgpu_render_target_color_texture(&native, w, h, format);
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let depth_stencil_texture = create_wgpu_render_target_depth_texture(&native, w, h);
    let depth_stencil_view =
        depth_stencil_texture.create_view(&wgpu::TextureViewDescriptor::default());
    return WgpuTextureRenderTarget {
        runtime,
        bindings: WgpuTextureBindings::new(),
        color_attachments: 1,
        color_space: color_space.unwrap_or(RenderTargetColorSpace::Srgb),
        depth_stencil_texture,
        depth_stencil_view,
        format,
        height: h,
        mip_level_count: 1,
        sample_count: samples,
        texture,
        view,
        width: w,
    };
}

/// Frees the target's color and depth storage (TS `destroyWgpuTextureRenderTarget`).
pub fn destroy_wgpu_texture_render_target(target: &WgpuTextureRenderTarget) {
    target.texture.destroy();
    target.depth_stencil_texture.destroy();
}

/// Draws a texture target's content as a quad in the current pass, composing the proxy transform
/// with the cache offset `transform` (TS `drawWgpuTextureRenderTargetResult`). Target textures are
/// stored bottom-left origin, so the v range is flipped.
// flight-lint: allow(conform-params) the source's renderProxy argument contributes its alpha, color adjustment and transform
pub fn draw_wgpu_texture_render_target_result(
    state: &mut WgpuRenderState,
    alpha: f32,
    color_scale_bias: Option<&ColorScaleBias>,
    transform_2d: &Matrix,
    target: &mut WgpuTextureRenderTarget,
    transform: &Matrix,
) {
    if target.width == 0 || target.height == 0 {
        return;
    }
    if state.runtime.render_pass.is_none() {
        return;
    }
    let (a, b, c, d, tx, ty) = (
        transform_2d.a,
        transform_2d.b,
        transform_2d.c,
        transform_2d.d,
        transform_2d.tx,
        transform_2d.ty,
    );
    let (ta, tb, tc, td, ttx, tty) = (
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.tx,
        transform.ty,
    );
    let composed = create_matrix(
        a * ta + c * tb,
        b * ta + d * tb,
        a * tc + c * td,
        b * tc + d * td,
        a * ttx + c * tty + tx,
        b * ttx + d * tty + ty,
    );
    // TS draws the target itself as the texture entry; here a transient entry shares the target's
    // storage, and its per-sampler bind groups are written back so they persist on the target.
    let entry = WgpuTextureEntry {
        runtime: EntityRuntimeSlot::default(),
        bindings: std::mem::take(&mut target.bindings),
        mip_level_count: target.mip_level_count,
        sampler: None,
        straight_alpha: None,
        texture: target.texture.clone(),
        view: target.view.clone(),
        version: None,
        video: None,
    };
    let entry = entry_ref(entry);
    draw_wgpu_quad_with_transform(
        state,
        alpha,
        color_scale_bias,
        &composed,
        &entry,
        0.0,
        0.0,
        target.width as f32,
        target.height as f32,
        0.0,
        1.0,
        1.0,
        0.0,
    );
    target.bindings = std::mem::take(&mut entry.write().unwrap().bindings);
}

fn entry_ref(entry: WgpuTextureEntry) -> flight_entity::Ref<WgpuTextureEntry> {
    return std::sync::Arc::new(std::sync::RwLock::new(entry));
}

/// Resizes a target's storage in place, dropping cached bind groups (TS
/// `resizeWgpuTextureRenderTarget`). No-op when the resolved extent and samples are unchanged.
/// Panics when a supersampled extent exceeds the device's 2D texture limit.
pub fn resize_wgpu_texture_render_target(
    state: &WgpuRenderState,
    target: &mut WgpuTextureRenderTarget,
    width: f32,
    height: f32,
    sample_count: Option<u32>,
) {
    let native = get_wgpu_render_state_native_device(state);
    let (w, h, samples) = resolve_wgpu_texture_render_target_extent(
        width,
        height,
        sample_count.unwrap_or(target.sample_count),
    );
    assert_wgpu_texture_render_target_extent(&native, w, h, samples);
    if w == target.width && h == target.height && samples == target.sample_count {
        return;
    }
    target.width = w;
    target.height = h;
    target.sample_count = samples;
    target.texture.destroy();
    target.depth_stencil_texture.destroy();
    let texture = create_wgpu_render_target_color_texture(&native, w, h, target.format);
    target.view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    target.texture = texture;
    // Every cached bind group referenced the old view; drop them so they rebuild against the new one.
    target.bindings.clear();
    let depth = create_wgpu_render_target_depth_texture(&native, w, h);
    target.depth_stencil_view = depth.create_view(&wgpu::TextureViewDescriptor::default());
    target.depth_stencil_texture = depth;
}

// The physical extent and effective sample count of a request: four coverage samples are realized
// as a 2x extent per axis.
pub(crate) fn resolve_wgpu_texture_render_target_extent(
    width: f32,
    height: f32,
    sample_count: u32,
) -> (u32, u32, u32) {
    let samples = if sample_count > 1 { 4 } else { 1 };
    let scale = if samples == 4 {
        WGPU_TEXTURE_RENDER_TARGET_SUPERSAMPLE_SCALE
    } else {
        1
    };
    return (
        (width.ceil().max(1.0) as u32) * scale,
        (height.ceil().max(1.0) as u32) * scale,
        samples,
    );
}

// One place decides how much bigger a supersampled target is than its logical extent; the screen
// target module carries the same number for the swap-chain surface.
const WGPU_TEXTURE_RENDER_TARGET_SUPERSAMPLE_SCALE: u32 = 2;
