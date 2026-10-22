// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! The screen render target: a presentation surface acquired fresh each frame (TS
//! `wgpuScreenRenderTarget.ts`). Natively the acquired frame is a lease the target holds from
//! acquisition until it is presented, exactly once, after the frame's submit (D17).

use flight_entity::EntityRuntimeSlot;
use flight_host::WgpuDevice;
use flight_surface::{GpuCanvasAlphaMode, HostWgpuCapability, SurfaceRef, WgpuSurfaceAttachment};
use flight_texture::RenderTargetColorSpace;

use crate::types::*;
use crate::wgpu_canvas_context::{
    WgpuCanvasConfiguration, WgpuCanvasFrameError, narrow_wgpu_canvas_context,
};
use crate::wgpu_device_loss::report_wgpu_device_lost;
use crate::wgpu_texture_format::get_wgpu_texture_format_name;

fn create_wgpu_screen_depth_stencil_texture(
    device: &WgpuNativeDevice,
    width: u32,
    height: u32,
) -> wgpu::Texture {
    return device.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: width.max(1),
            height: height.max(1),
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

/// Builds a screen target over a surface the host attaches to `device` (TS
/// `createWgpuScreenRenderTarget`). Panics when the host reports the target cannot present.
pub fn create_wgpu_screen_render_target(
    wgpu_host: &HostWgpuCapability,
    device: &WgpuDevice,
    drawable: &SurfaceRef,
    options: Option<&WgpuScreenRenderTargetOptions>,
) -> WgpuScreenRenderTarget {
    return build_wgpu_screen_render_target(
        wgpu_host,
        device,
        drawable,
        options,
        EntityRuntimeSlot::default(),
    );
}

/// Rebuilds `out` as a screen target over a newly attached surface, keeping its entity identity
/// (TS `initializeWgpuScreenRenderTarget`): every per-frame and opt-in slot starts empty.
pub fn initialize_wgpu_screen_render_target(
    out: &mut WgpuScreenRenderTarget,
    wgpu_host: &HostWgpuCapability,
    device: &WgpuDevice,
    drawable: &SurfaceRef,
    options: Option<&WgpuScreenRenderTargetOptions>,
) {
    let runtime = std::mem::take(&mut out.runtime);
    *out = build_wgpu_screen_render_target(wgpu_host, device, drawable, options, runtime);
}

// Acquires this frame's presentation texture natively and keeps its lease on the target until the
// frame presents. A skipped frame draws into scratch storage that is never presented.
fn acquire_wgpu_screen_presentation_view(
    state: &mut WgpuRenderState,
    target: &mut WgpuScreenRenderTarget,
) -> wgpu::TextureView {
    let context = narrow_wgpu_canvas_context(&target.context);
    if target.reconfigure_pending {
        target.configuration.width = get_wgpu_surface_width(target);
        target.configuration.height = get_wgpu_surface_height(target);
        context.configure(&target.configuration);
        target.reconfigure_pending = false;
    }
    match context.get_current_texture() {
        Ok(frame) => {
            let view = frame
                .texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            target.frame = Some(frame);
            return view;
        }
        Err(WgpuCanvasFrameError::Timeout) => {}
        Err(WgpuCanvasFrameError::Outdated) => target.reconfigure_pending = true,
        Err(WgpuCanvasFrameError::Lost) => report_wgpu_device_lost(
            &state.runtime.context,
            WgpuDeviceLostInfo {
                message: "the presentation surface was lost".to_string(),
                reason: WgpuDeviceLostReason::Unknown,
            },
        ),
        Err(WgpuCanvasFrameError::OutOfMemory) => {
            panic!("bindWgpuScreenRenderTarget: out of memory acquiring the presentation texture")
        }
        Err(WgpuCanvasFrameError::Other) => {
            panic!("bindWgpuScreenRenderTarget: the presentation texture could not be acquired")
        }
    }
    return skipped_wgpu_screen_frame_view(target);
}

/// Acquires the color view a screen pass attaches to, sizing storage to the surface first (TS
/// `bindWgpuScreenRenderTarget`). With capture on the frame renders into the capture texture and
/// never touches the swap chain. A native frame that cannot be acquired (`Timeout`, `Outdated`) is
/// skipped: it draws into an unpresented scratch texture, and `Outdated` reconfigures before the
/// next acquire; `Lost` also reports the device lost; `OutOfMemory` and any other failure panic.
// flight-lint: allow(conform-params) D17: the target is passed with its shared screen-target reference
pub fn bind_wgpu_screen_render_target(
    state: &mut WgpuRenderState,
    target: &mut WgpuScreenRenderTarget,
) -> wgpu::TextureView {
    sync_wgpu_screen_render_target_extent(target);
    ensure_wgpu_screen_render_target_depth_stencil(target);

    if target.presentation_view.is_none() {
        if let Some(acquire_capture) = target.acquire_capture_texture {
            // With capture on, render into an offscreen COPY_SRC texture instead of the swap chain:
            // software and headless adapters never present the swap chain, so the readable copy must
            // be the render target itself.
            let texture = acquire_capture(target);
            target.presentation_view =
                Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
        } else {
            let view = acquire_wgpu_screen_presentation_view(state, target);
            target.presentation_view = Some(view);
        }
    }
    if let Some(acquire_antialias) = target.acquire_antialias_view {
        return acquire_antialias(state, target);
    }
    return target.presentation_view.clone().unwrap();
}

fn build_wgpu_screen_render_target(
    wgpu_host: &HostWgpuCapability,
    device: &WgpuDevice,
    drawable: &SurfaceRef,
    options: Option<&WgpuScreenRenderTargetOptions>,
    runtime: EntityRuntimeSlot,
) -> WgpuScreenRenderTarget {
    let defaults = WgpuScreenRenderTargetOptions::default();
    let options = options.unwrap_or(&defaults);
    let format = options.format.unwrap_or(wgpu::TextureFormat::Bgra8Unorm);
    let alpha_mode = options
        .alpha_mode
        .unwrap_or(GpuCanvasAlphaMode::Premultiplied);
    let result = (wgpu_host.attach_surface)(
        drawable,
        &WgpuSurfaceAttachment {
            alpha_mode,
            device: device.clone(),
            format: get_wgpu_texture_format_name(format).to_string(),
        },
    );
    let Some(result) = result else {
        panic!("createWgpuScreenRenderTarget: the target cannot present WebGPU.");
    };
    let native = device
        .handle
        .downcast_ref::<WgpuNativeDevice>()
        .expect("WgpuDevice handle must carry a flight_render_wgpu::WgpuNativeDevice")
        .clone();
    let width = (((result.surface.width)()).max(1.0)) as u32;
    let height = (((result.surface.height)()).max(1.0)) as u32;
    let depth_stencil_texture = create_wgpu_screen_depth_stencil_texture(&native, width, height);
    let out = WgpuScreenRenderTarget {
        runtime,
        antialias: false,
        antialias_resolve_bind_group: None,
        antialias_texture: None,
        antialias_view: None,
        acquire_antialias_view: None,
        encode_antialias_resolve: None,
        capture_buffer: None,
        capture_bytes_per_row: 0,
        capture_enabled: false,
        capture_height: 0,
        capture_texture: None,
        capture_width: 0,
        acquire_capture_texture: None,
        encode_capture: None,
        color_attachments: 1,
        color_space: options.color_space.unwrap_or(RenderTargetColorSpace::Srgb),
        context: result.context,
        depth_stencil_view: depth_stencil_texture
            .create_view(&wgpu::TextureViewDescriptor::default()),
        depth_stencil_texture,
        device: native.clone(),
        format,
        height,
        presentation_view: None,
        sample_count: 1,
        surface: result.surface,
        width,
        configuration: WgpuCanvasConfiguration {
            alpha_mode: wgpu_composite_alpha_mode(alpha_mode),
            device: native,
            format,
            height,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            width,
        },
        frame: None,
        reconfigure_pending: false,
        skipped_frame_texture: None,
        capture_map_pending: false,
    };
    return out;
}

/// Frees the GPU storage this target owns (depth-stencil, supersample, capture) and unconfigures
/// its context (TS `destroyWgpuScreenRenderTarget`). An acquired frame still held is released
/// unpresented. The target is invalid afterward.
pub fn destroy_wgpu_screen_render_target(target: &mut WgpuScreenRenderTarget) {
    target.depth_stencil_texture.destroy();
    if let Some(texture) = target.antialias_texture.take() {
        texture.destroy();
    }
    target.antialias_view = None;
    target.antialias_resolve_bind_group = None;
    if let Some(texture) = target.capture_texture.take() {
        texture.destroy();
    }
    if let Some(buffer) = target.capture_buffer.take() {
        buffer.destroy();
    }
    target.presentation_view = None;
    target.frame = None;
    narrow_wgpu_canvas_context(&target.context).unconfigure();
}

/// Releases the per-frame presentation view and presents the frame's acquired texture, exactly
/// once (TS `endWgpuScreenRenderTargetFrame`; the native present is D17's addition). Called by the
/// frame's submit, after the queue submit.
pub fn end_wgpu_screen_render_target_frame(target: &mut WgpuScreenRenderTarget) {
    target.presentation_view = None;
    if let Some(frame) = target.frame.take() {
        narrow_wgpu_canvas_context(&target.context).present(&target.device, frame);
    }
}

fn ensure_wgpu_screen_render_target_depth_stencil(target: &mut WgpuScreenRenderTarget) {
    let texture = &target.depth_stencil_texture;
    if texture.width() == target.width && texture.height() == target.height {
        return;
    }
    texture.destroy();
    let replacement =
        create_wgpu_screen_depth_stencil_texture(&target.device, target.width, target.height);
    target.depth_stencil_view = replacement.create_view(&wgpu::TextureViewDescriptor::default());
    target.depth_stencil_texture = replacement;
}

fn get_wgpu_surface_height(target: &WgpuScreenRenderTarget) -> u32 {
    return (((target.surface.height)()).max(1.0)) as u32;
}

fn get_wgpu_surface_width(target: &WgpuScreenRenderTarget) -> u32 {
    return (((target.surface.width)()).max(1.0)) as u32;
}

/// Whether a target presents into a swap chain (TS `isWgpuScreenRenderTarget`).
pub fn is_wgpu_screen_render_target(target: &WgpuRenderTarget) -> bool {
    return matches!(target, WgpuRenderTarget::Screen(_));
}

// The unpresented scratch storage a skipped frame draws into, sized to the target's extent.
fn skipped_wgpu_screen_frame_view(target: &mut WgpuScreenRenderTarget) -> wgpu::TextureView {
    let width = target.width;
    let height = target.height;
    let reuse = target
        .skipped_frame_texture
        .as_ref()
        .is_some_and(|texture| texture.width() == width && texture.height() == height);
    if !reuse {
        target.skipped_frame_texture = Some(target.device.device.create_texture(
            &wgpu::TextureDescriptor {
                label: None,
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: target.format,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            },
        ));
    }
    return target
        .skipped_frame_texture
        .as_ref()
        .unwrap()
        .create_view(&wgpu::TextureViewDescriptor::default());
}

/// Brings the target's extent back in line with its surface, the authority on its own size (TS
/// `syncWgpuScreenRenderTargetExtent`). Every pass calls this, so a caller never announces a
/// resize; enabling supersampling calls it too.
pub fn sync_wgpu_screen_render_target_extent(target: &mut WgpuScreenRenderTarget) {
    let scale = if target.antialias {
        WGPU_SCREEN_SUPERSAMPLE_SCALE
    } else {
        1
    };
    target.width = (((target.surface.width)()).max(1.0)) as u32 * scale;
    target.height = (((target.surface.height)()).max(1.0)) as u32 * scale;
}

fn wgpu_composite_alpha_mode(alpha_mode: GpuCanvasAlphaMode) -> wgpu::CompositeAlphaMode {
    return match alpha_mode {
        GpuCanvasAlphaMode::Opaque => wgpu::CompositeAlphaMode::Opaque,
        GpuCanvasAlphaMode::Premultiplied => wgpu::CompositeAlphaMode::PreMultiplied,
    };
}

// One place decides how much bigger a supersampled surface is than its logical extent; the texture
// target module carries the same number for offscreen storage.
const WGPU_SCREEN_SUPERSAMPLE_SCALE: u32 = 2;
