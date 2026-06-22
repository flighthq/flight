//! `flighthq-render-gl`
//!
//! OpenGL (native via glow) renderer for the Flight scene graph. Provides a
//! `GlRenderState` that wraps a `glow::Context`, an instanced sprite batch for
//! high-throughput atlas rendering, and individual renderers for bitmaps,
//! shapes, text, video, tilemaps, particles, and quad batches.
//!
//! All registration is opt-in: call `register_gl_display_object_renderer` and
//! `register_gl_sprite_renderer` after `create_gl_render_state` to enable the
//! standard pipelines. No side effects occur at module load.

pub mod background;
pub mod bitmap;
pub mod cache;
pub mod clip;
pub mod color_transform_material;
pub mod default_material;
pub mod display_object;
pub mod draw;
pub mod fullscreen_pass;
pub mod material_registry;
pub mod materials;
pub mod particle_emitter;
pub mod quad_batch;
pub mod render_state;
pub mod render_target;
pub mod render_target_pool;
pub mod rich_text;
pub mod scale9_mapper;
pub mod scale9_shape;
pub mod shader;
pub mod shader_binding;
pub mod shape;
pub mod shape_fill;
pub mod shape_mesh;
pub mod sprite;
pub mod sprite_batch;
pub mod sprite_renderer;
pub mod text_input;
pub mod text_label;
pub mod tilemap;
pub mod uniform_color_transform_material;
pub mod velocity;
pub mod video;

// ---------------------------------------------------------------------------
// Top-level re-exports — the public API surface.
// ---------------------------------------------------------------------------

pub use background::render_gl_background;
pub use cache::{
    GlCacheState, create_gl_cache_state, enable_gl_render_cache, ensure_gl_render_cache_target,
    get_gl_render_cache_target, refresh_gl_render_cache, release_gl_render_cache,
};
pub use clip::{
    GlWindingRule, compute_gl_scissor_rect, enable_gl_clip_support, intersect_gl_scissor_rect,
    pop_gl_clip_contours, pop_gl_clip_rectangle, push_gl_clip_contours, push_gl_clip_rectangle,
};
pub use display_object::{
    GlShapeGeometry, register_gl_display_object_renderer, render_gl_display_object,
};
pub use shape_fill::{
    GlShapeFillMesh, GlShapeFillMeshCacheEntry, GlShapeFillProgram,
    destroy_gl_shape_fill_mesh_cache_entry, draw_gl_shape_fill, fold_gl_shape_fill_region_color,
    pack_gl_shape_fill_color,
};
pub use draw::{
    apply_gl_blend_mode, bind_gl_texture, composite_gl_cached_texture, create_gl_texture,
    draw_gl_quad, enable_gl_blend_mode_support, gl_blend_factors, update_gl_texture,
    use_gl_program,
};
pub use material_registry::{
    GlMaterialRenderer, get_gl_material_renderer, register_gl_material_renderer,
    resolve_gl_material_renderer,
};
pub use materials::{
    get_gl_render_proxy_color_transform, pack_gl_color_transform,
    register_gl_color_transform_shader,
};
pub use render_state::{
    GlClipForm, GlRenderOptions, GlRenderState, GlRenderStateRuntime, GlScissorRect, GlViewport,
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
    GlBitmapShader, GlShaderLocations, compile_default_gl_program, compile_gl_bitmap_program,
    create_default_gl_bitmap_shader, create_gl_bitmap_shader, pack_gl_ndc_matrix,
    set_gl_attributes, set_gl_base_uniforms, set_gl_matrix_from_transform,
    set_gl_matrix_from_values,
};
pub use shader_binding::{
    get_gl_material_shader, get_gl_shader, register_gl_material_shader, resolve_gl_shader,
    set_gl_shader,
};
pub use sprite_batch::{
    GlQuadBatchShader, GlSpriteBatchRuntime, bind_gl_quad_batch_base_attributes,
    ensure_gl_quad_batch_shader, flush_gl_sprite_batch, pack_gl_sprite_batch_material_instance,
    pack_gl_sprite_instance, prepare_gl_sprite_batch_write, set_gl_quad_batch_world_and_texture,
    submit_gl_node_atlas_quad, submit_gl_sprite_instance, use_gl_quad_batch_program,
};
pub use sprite_renderer::register_gl_sprite_renderer;
