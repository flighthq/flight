// flight-lint: conform-skip(beginWgpuScreenRenderPassForTest, createReadyImageElementForTest, createTestWgpuSurface, createWgpuRenderStateForTest, createWgpuScreenRenderTargetForTest, installWgpuMock) browser test scaffolding (wgpuHost.ts, wgpuTestHelper.ts) is ported as the crate's Rust test doubles in tests/support.rs, never as public API
// flight-lint: conform-skip(initializeWgpuHostAcquisition) D8/D23 (principal): one owner; flight-surface defines initialize_wgpu_host_acquisition beside the WgpuHostAcquisition type it initializes, and create_wgpu_acquisition assigns the acquired handles and caller ownership inline
//! The WebGPU render backend (TS `@flighthq/render-wgpu`) over host-supplied native `wgpu` devices
//! (D17). Render states share a device tier per device; a frame records into one encoder and
//! submits once; passes bind screen or texture targets; texture sources realize into cached GPU
//! entries.

mod enable_wgpu_texture_resolver_guards;
mod explain_wgpu_texture_resolution;
mod explain_wgpu_uniform_endianness;
mod types;
mod wgpu_adapter_capabilities;
mod wgpu_canvas_context;
mod wgpu_command_observer;
mod wgpu_compressed_texture;
mod wgpu_device_loss;
mod wgpu_draw;
mod wgpu_external_image_source;
mod wgpu_external_texture;
mod wgpu_frame;
mod wgpu_fullscreen_pass;
mod wgpu_mipmap;
mod wgpu_quad_material_registry;
mod wgpu_render_pass;
mod wgpu_render_state;
mod wgpu_render_target;
mod wgpu_render_target_pool;
mod wgpu_render_texture;
mod wgpu_render_texture_pool;
mod wgpu_scissor;
mod wgpu_screen_antialias;
mod wgpu_screen_capture;
mod wgpu_screen_render_target;
mod wgpu_shader;
mod wgpu_shader_binding;
mod wgpu_shader_registry;
mod wgpu_texture_format;
mod wgpu_texture_render_target;
mod wgpu_texture_resolver;
mod wgpu_texture_upload;

pub mod contract;

pub use contract::*;
