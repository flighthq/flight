//! Test-only helpers for the WGPU effect crate.
//!
//! Building a real `WgpuRenderState` needs a GPU adapter, so these helpers
//! request one over all backends (accepting a software fallback) and return
//! `None` when none is available — letting GPU-less boxes skip the test rather
//! than fail, matching the rest of the codebase's GPU-graceful pattern.

use flighthq_render_wgpu::render_state::{
    WgpuRenderOptions, WgpuRenderState, create_wgpu_render_state,
};

const TEST_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// Creates a small `WgpuRenderState` for tests, or `None` when no adapter (not
/// even a software one) is available.
pub(crate) fn try_create_test_wgpu_render_state() -> Option<WgpuRenderState> {
    let (device, queue) = pollster::block_on(request_test_device())?;
    let options = WgpuRenderOptions {
        format: Some(TEST_FORMAT),
        ..Default::default()
    };
    Some(create_wgpu_render_state(
        device,
        queue,
        TEST_FORMAT,
        16,
        16,
        &options,
    ))
}

async fn request_test_device() -> Option<(wgpu::Device, wgpu::Queue)> {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });
    let adapter = match instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::None,
            force_fallback_adapter: false,
            compatible_surface: None,
        })
        .await
    {
        Some(adapter) => Some(adapter),
        None => {
            instance
                .request_adapter(&wgpu::RequestAdapterOptions {
                    power_preference: wgpu::PowerPreference::None,
                    force_fallback_adapter: true,
                    compatible_surface: None,
                })
                .await
        }
    }?;
    adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("flight-effects-wgpu-test-device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::default(),
            },
            None,
        )
        .await
        .ok()
}
