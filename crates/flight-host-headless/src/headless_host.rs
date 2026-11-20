// flight-lint: allow-file(contract-vocabulary) native host: the host fills native wgpu capability closures and wraps native wgpu values
//! Headless host construction, its capability and carrier producers, synchronous read-back, and
//! teardown.

use std::sync::{Arc, RwLock};

use flight_bitmap::Bitmap;
use flight_entity::{FlightError, Ref};
use flight_host::{HostSpawnCapability, ProviderRef, WgpuDevice};
use flight_render_wgpu::{
    WgpuCanvasContext, WgpuRenderTarget, WgpuScreenRenderTarget, WgpuScreenRenderTargetOptions,
    create_bitmap_from_wgpu_screen_render_target, create_wgpu_native_device,
    create_wgpu_screen_render_target, create_wgpu_surface_context,
    enable_wgpu_screen_render_target_capture,
};
use flight_surface::{
    HostWgpuCapability, WgpuHostAcquisition, WgpuHostAcquisitionOwnership,
    create_wgpu_host_acquisition,
};

use crate::headless_device::request_headless_device;
use crate::headless_surface::{
    attach_headless_surface, create_headless_host_surface, create_headless_presentation_surface,
    create_headless_surface_handle, get_headless_surface,
};
use crate::types::*;

/// Reads a captured screen target back to an RGBA Bitmap, blocking until the SDK's capture read-back
/// settles (`create_bitmap_from_wgpu_screen_render_target`, which this only drives to completion).
/// `None` when the target has no captured frame to read or the map fails or outlives `timeout_ms`;
/// `explain_headless_screen_render_target_read_back` says which.
pub fn create_bitmap_from_headless_screen_render_target(
    target: &Ref<WgpuScreenRenderTarget>,
    timeout_ms: Option<u32>,
) -> Option<Bitmap> {
    return pollster::block_on(create_bitmap_from_wgpu_screen_render_target(
        target, timeout_ms,
    ))
    .ok();
}

/// Opens a real wgpu device on the adapter `options` choose (defaults from
/// `create_headless_host_options`). `None` when no acceptable adapter exists or the device request
/// fails; `explain_headless_host` says which.
pub fn create_headless_host(options: Option<&HeadlessHostOptions>) -> Option<HeadlessHost> {
    let defaults = create_headless_host_options();
    let opened = request_headless_device(options.unwrap_or(&defaults)).ok()?;
    let provider: ProviderRef = Arc::new("flight-host-headless");
    let native = create_wgpu_native_device(
        opened.device,
        opened.queue,
        create_headless_host_spawn_capability(&provider),
    );
    let device = WgpuDevice {
        provider: provider.clone(),
        handle: Arc::new(native.clone()),
    };
    let wgpu = create_headless_host_wgpu_capability(&provider, &device);
    return Some(HeadlessHost {
        adapter_backend: opened.adapter_backend,
        adapter_name: opened.adapter_name,
        destroyed: false,
        device,
        native,
        provider,
        software_adapter: opened.software_adapter,
        wgpu,
    });
}

/// The default options: every platform backend, no power preference, and a software adapter
/// accepted when no hardware adapter exists (the CI case).
pub fn create_headless_host_options() -> HeadlessHostOptions {
    return HeadlessHostOptions {
        allow_dx12: true,
        allow_metal: true,
        allow_software_adapter: true,
        allow_vulkan: true,
        power_preference: HeadlessHostPowerPreference::None,
    };
}

/// Creates the offscreen target a render pass draws into: the SDK's own screen render target
/// (`create_wgpu_screen_render_target`) over a new `width`x`height` headless surface, in the host's
/// RGBA format, with the SDK's capture read-back enabled. Every frame submitted to it stays readable
/// through `create_bitmap_from_headless_screen_render_target`. The target borrows the host's device
/// and capability, so it must be released before `destroy_headless_host`.
pub fn create_headless_host_render_target(
    host: &HeadlessHost,
    width: u32,
    height: u32,
) -> WgpuRenderTarget {
    let surface = create_headless_host_surface(host, width, height);
    let mut screen = create_wgpu_screen_render_target(
        &host.wgpu,
        &host.device,
        &surface,
        Some(&WgpuScreenRenderTargetOptions {
            alpha_mode: None,
            color_space: None,
            format: Some(HEADLESS_SURFACE_TEXTURE_FORMAT),
        }),
    );
    enable_wgpu_screen_render_target_capture(&mut screen);
    return WgpuRenderTarget::Screen(Arc::new(RwLock::new(screen)));
}

// Device-loss continuations run on their own thread each: a headless host has no event loop to
// queue them on, and a continuation waiting on a loss that never comes parks only its thread,
// which ends when the device is destroyed or dropped.
fn create_headless_host_spawn_capability(provider: &ProviderRef) -> HostSpawnCapability {
    return HostSpawnCapability {
        provider: provider.clone(),
        spawn: Arc::new(|future| {
            std::thread::spawn(move || pollster::block_on(future));
        }),
    };
}

fn create_headless_host_wgpu_capability(
    provider: &ProviderRef,
    device: &WgpuDevice,
) -> HostWgpuCapability {
    let acquire_provider = provider.clone();
    let acquire_device = device.clone();
    let attach_provider = provider.clone();
    let create_provider = provider.clone();
    return HostWgpuCapability {
        provider: provider.clone(),
        acquire: Arc::new(move |surface, options| {
            let headless = get_headless_surface(surface);
            let provider = acquire_provider.clone();
            let device = acquire_device.clone();
            let format = options
                .format
                .clone()
                .unwrap_or_else(|| HEADLESS_SURFACE_FORMAT.to_string());
            return Box::pin(async move {
                let Some(headless) = headless else {
                    return Err(FlightError {
                        kind: flight_entity::FlightErrorKind::Error,
                        message: "flight-host-headless acquires only surfaces from createHeadlessHostSurface".to_string(),
                    });
                };
                let context: Arc<dyn WgpuCanvasContext> = headless.context.clone();
                let mut acquisition: WgpuHostAcquisition = create_wgpu_host_acquisition();
                acquisition.context = create_wgpu_surface_context(provider, context);
                acquisition.device = device;
                acquisition.format = format;
                acquisition.ownership = WgpuHostAcquisitionOwnership::Caller;
                acquisition.surface = create_headless_presentation_surface(&headless);
                return Ok(acquisition);
            });
        }),
        attach_surface: Arc::new(move |surface, attachment| {
            return attach_headless_surface(surface, attachment, &attach_provider);
        }),
        create: Arc::new(move |_window, width, height| {
            return Some(create_headless_surface_handle(
                &create_provider,
                width as u32,
                height as u32,
            ));
        }),
        is_supported: Arc::new(|| true),
        release: Arc::new(|acquisition| {
            if let Some(context) = acquisition
                .context
                .handle
                .downcast_ref::<Arc<dyn WgpuCanvasContext>>()
            {
                context.unconfigure();
            }
        }),
    };
}

/// Frees the host's device now. Every render state, target and surface built over it must already
/// be released; afterwards the host's device and capability are invalid. Destroying twice is a
/// no-op.
pub fn destroy_headless_host(host: &mut HeadlessHost) {
    if host.destroyed {
        return;
    }
    host.destroyed = true;
    host.native.device.destroy();
}

/// The backend name of the adapter the host opened (`"vulkan"`, `"metal"`, `"dx12"`).
pub fn get_headless_host_adapter_backend(host: &HeadlessHost) -> &str {
    return &host.adapter_backend;
}

/// The name the driver reports for the adapter the host opened.
pub fn get_headless_host_adapter_name(host: &HeadlessHost) -> &str {
    return &host.adapter_name;
}

/// The host's wgpu capability: `acquire` resolves immediately with the host's own device, and
/// `attach_surface` configures a surface from `create_headless_host_surface`. Borrowed; valid until
/// `destroy_headless_host`.
pub fn get_headless_host_wgpu_capability(host: &HeadlessHost) -> &HostWgpuCapability {
    return &host.wgpu;
}

/// The host's device, the carrier `create_wgpu_render_state` and
/// `create_wgpu_screen_render_target` take. Borrowed; valid until `destroy_headless_host`.
pub fn get_headless_host_wgpu_device(host: &HeadlessHost) -> &WgpuDevice {
    return &host.device;
}

/// Whether the host has been destroyed.
pub fn is_headless_host_destroyed(host: &HeadlessHost) -> bool {
    return host.destroyed;
}

/// Whether the host's adapter is a CPU (software) adapter, whose rasterization may differ from
/// hardware within a pixel comparison's tolerance.
pub fn is_headless_host_software_adapter(host: &HeadlessHost) -> bool {
    return host.software_adapter;
}

// Offscreen frames are RGBA: the byte order the read-back Bitmap uses, so no swizzle is needed.
const HEADLESS_SURFACE_FORMAT: &str = "rgba8unorm";
const HEADLESS_SURFACE_TEXTURE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
