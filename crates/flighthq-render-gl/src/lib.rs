//! `flighthq-render-gl`
//!
//! OpenGL (native via glow / WebGL2 on wasm) renderer **backend core** for the
//! Flight scene graph. Ports the TypeScript `@flighthq/render-gl` package.
//!
//! This crate is **subject-agnostic** GPU plumbing: render state, off-screen
//! render targets and a target pool, shader compilation and binding, the
//! material-renderer registry, the textured-quad draw primitives, blend-mode
//! handling, the background clear, and the fullscreen/surface pass. The
//! per-subject leaf renderers (bitmap, shape, sprite, text, tilemap, particles)
//! live in `flighthq-displayobject-gl` over this core — see the render layering
//! in `tools/agents/docs/rust/conformance.md`.
//!
//! The runtime (`GlRenderStateRuntime`) is the shared GPU-state header: it owns
//! the slot fields the leaf renderers fill (sprite batch, shape-fill program /
//! mesh cache, material renderers, clip stacks). `destroy_gl_render_state` frees
//! every GPU resource those slots hold. This mirrors the TS design, where the
//! runtime type lives in `@flighthq/types` so out-of-package renderers can reach
//! the same state.
//!
//! All registration is opt-in: nothing happens at module load.

pub mod background;
pub mod draw;
pub mod fullscreen_pass;
pub mod material_registry;
pub mod readback;
pub mod render_state;
pub mod render_target;
pub mod render_target_pool;
pub mod shader;
pub mod shader_binding;

// ---------------------------------------------------------------------------
// Top-level re-exports — the public API surface.
// ---------------------------------------------------------------------------

pub use background::{render_gl_background, unpack_gl_rgba};
pub use draw::{
    apply_gl_blend_mode, bind_gl_texture, composite_gl_cached_texture, create_gl_texture,
    draw_gl_quad, enable_gl_blend_mode_support, gl_blend_factors, update_gl_texture,
    use_gl_program,
};
pub use fullscreen_pass::draw_gl_fullscreen_pass;
pub use material_registry::{
    GlMaterialRenderer, get_gl_material_renderer, register_gl_material_renderer,
    resolve_gl_material_renderer,
};
pub use readback::{GlReadbackPixels, read_gl_render_target_pixels};
pub use render_state::{
    GlClipForm, GlQuadBatchShader, GlRenderOptions, GlRenderState, GlRenderStateRuntime,
    GlRendererSlot, GlScissorRect, GlShapeFillMesh, GlShapeFillMeshCacheEntry, GlShapeFillProgram,
    GlSpriteBatchRuntime, GlViewport, bytemuck_f32, bytemuck_u16, bytemuck_u32,
    create_gl_render_state, create_gl_render_state_runtime, destroy_gl_render_state,
    get_gl_render_state_runtime, get_gl_render_state_runtime_mut,
};
pub use render_state::{GlRenderTarget, GlRenderTargetFormat};
pub use render_target::{
    GlRenderProxy2D, begin_gl_render_target, create_gl_render_target, destroy_gl_render_target,
    draw_gl_render_target_result, end_gl_render_target, resize_gl_render_target,
    resolve_gl_render_target,
};
pub use render_target_pool::{
    GlRenderTargetPool, acquire_gl_render_target, create_gl_render_target_pool,
    destroy_gl_render_target_pool, get_gl_render_target, release_gl_render_target,
};
pub use shader::{
    FRAGMENT_SRC, GlBitmapShader, GlShaderLocations, VERTEX_SRC, compile_default_gl_program,
    compile_gl_bitmap_program, create_default_gl_bitmap_shader, create_gl_bitmap_shader,
    pack_gl_ndc_matrix, viewport_dimensions,
};
pub use shader_binding::{
    get_gl_material_shader, get_gl_shader, register_gl_bitmap_shader, register_gl_material_shader,
    resolve_gl_shader, set_gl_shader,
};
