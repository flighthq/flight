//! `flighthq-render-wgpu` — the subject-agnostic wgpu (WebGPU) backend **core**.
//!
//! wgpu backend (Vulkan / Metal / DX12 natively, WebGPU on the web) for the
//! Flight render layer. This crate is the backend core: it owns the
//! `WgpuRenderState` (the `wgpu::Device`/`wgpu::Queue`, the uniform ring buffer,
//! the blend/stencil/format-keyed pipeline cache, samplers, depth-stencil),
//! the per-frame draw primitives (`draw_wgpu_quad`, texture upload/bind, blend
//! mode application), the fullscreen / surface passes (`render_wgpu_background`,
//! frame capture), off-screen render targets and their pool, the shader and
//! material-renderer registries, and the canvas-element seam.
//!
//! It is **subject-agnostic**: the per-subject leaf renderers (bitmap, shape,
//! sprite, text, tilemap, particles, quad-batch, velocity, clip, scale-9) live in
//! `flighthq-displayobject-wgpu`, layered over this core. This mirrors the
//! upstream TS split between `@flighthq/render-wgpu` (core) and
//! `@flighthq/displayobject-wgpu` (leaves).
//!
//! The runtime-slot **types** that the leaf renderers read and write
//! (`WgpuSpriteBatchRuntime`, `WgpuVelocityWriter`, `WgpuShapeMeshCacheEntry`,
//! `WgpuRichTextOverlay`, …) are the Rust stand-in for the shared
//! `@flighthq/types` wgpu runtime header and live here in [`runtime_types`].
//!
//! All registration is opt-in: no side effects occur at module load.

pub mod background;
pub mod draw;
pub mod element;
pub mod material_registry;
pub mod render_state;
pub mod render_target;
pub mod render_target_pool;
pub mod runtime_types;
pub mod shader;
pub mod shader_binding;
pub mod surface;

// ---------------------------------------------------------------------------
// Top-level re-exports — the public API surface.
// ---------------------------------------------------------------------------

pub use background::{render_wgpu_background, set_wgpu_frame_target_view, submit_wgpu_render_pass};
pub use draw::{
    WgpuTextureInfo, apply_wgpu_blend_mode, bind_wgpu_texture, build_wgpu_render_target_bind_group,
    composite_wgpu_cached_texture, create_wgpu_texture, draw_wgpu_quad,
    draw_wgpu_quad_with_transform, enable_wgpu_blend_mode_support, update_wgpu_texture,
};
pub use element::{WgpuCanvasElementSize, resolve_wgpu_canvas_element_size};
pub use material_registry::{
    WgpuMaterialRenderer, get_wgpu_material_renderer, register_wgpu_material_renderer,
    resolve_wgpu_material_renderer,
};
pub use render_state::{
    WgpuClipForm, WgpuRenderOptions, WgpuRenderState, WgpuRenderStateRuntime, WgpuRenderStats,
    WgpuRenderTarget, WgpuRenderTargetStackEntry, WgpuRendererSlot, WgpuScissorRect, WgpuViewport,
    create_wgpu_render_state, create_wgpu_render_state_runtime, destroy_wgpu_render_state,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut, is_wgpu_supported,
};
pub use render_target::{
    begin_wgpu_render_target, create_wgpu_render_target, destroy_wgpu_render_target,
    draw_wgpu_render_target_result, end_wgpu_render_target, resize_wgpu_render_target,
};
pub use render_target_pool::{
    WgpuRenderTargetPool, acquire_wgpu_render_target, create_wgpu_render_target_pool,
    destroy_wgpu_render_target_pool, release_wgpu_render_target,
};
pub use runtime_types::{
    SPRITE_INSTANCE_FLOATS, WgpuQuadBatchResources, WgpuRichTextOverlay, WgpuShapeMesh,
    WgpuShapeMeshCacheEntry, WgpuSpriteBatchRuntime, WgpuVelocityPipeline, WgpuVelocityWriter,
};
pub use shader::{
    UNIFORM_BYTE_SIZE, WgpuBindGroupLayouts, WgpuBitmapShader, WgpuStencilMode,
    build_wgpu_stencil_face_state, create_wgpu_bind_group_layouts, create_wgpu_pipeline_layout,
    get_active_wgpu_pipeline, get_wgpu_pipeline, normal_wgpu_blend_state,
    set_wgpu_matrix_from_transform, warm_wgpu_pipelines, wgpu_blend_state, wgpu_pipeline_cache_key,
    write_wgpu_matrix_only_uniforms, write_wgpu_quad_uniforms,
};
pub use shader_binding::{get_wgpu_shader, resolve_wgpu_shader, set_wgpu_shader};
pub use surface::{
    acquire_wgpu_frame_capture_texture, enable_wgpu_frame_capture, encode_wgpu_frame_capture,
};
