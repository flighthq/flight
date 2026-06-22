//! `flighthq-displayobject-gl` — WebGL2 / OpenGL display-object **leaf
//! renderers** (bitmap, shape, sprite, text, tilemap, particles) over the
//! `flighthq-render-gl` backend core.
//!
//! Ports the TypeScript `@flighthq/displayobject-gl` package. This is one of the
//! per-subject leaf renderers split out of the former render monolith (see the
//! render layering in `tools/agents/docs/rust/conformance.md`). The backend core
//! (`flighthq-render-gl`) owns render state, targets, shaders, draw primitives,
//! and the fullscreen/surface passes; this crate draws the 2D display-object
//! leaves into the core's instanced sprite batch and shape-fill pipeline,
//! filling the GPU-state slots the core's `GlRenderStateRuntime` owns.
//!
//! Registration is opt-in (no module-load side effects): a host calls
//! [`register_gl_display_object_renderer`] and [`register_gl_sprite_renderer`]
//! after `create_gl_render_state`.

pub mod bitmap;
pub mod cache;
pub mod clip;
pub mod color_transform_material;
pub mod default_material;
pub mod gl_display_object;
pub mod materials;
pub mod particle_emitter;
pub mod quad_batch;
pub mod rich_text;
pub mod scale9_mapper;
pub mod scale9_shape;
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

pub use bitmap::{GlBitmapData, draw_gl_bitmap};
pub use cache::{
    GlCacheState, create_gl_cache_state, enable_gl_render_cache, ensure_gl_render_cache_target,
    get_gl_render_cache_target, refresh_gl_render_cache, release_gl_render_cache,
};
pub use clip::{
    GlWindingRule, compute_gl_scissor_rect, enable_gl_clip_support, intersect_gl_scissor_rect,
    pop_gl_clip_contours, pop_gl_clip_rectangle, push_gl_clip_contours, push_gl_clip_rectangle,
};
pub use color_transform_material::draw_gl_color_transform_material;
pub use default_material::{GlDefaultMaterialRenderer, register_gl_default_material};
pub use gl_display_object::{
    GlShapeGeometry, draw_gl_display_object, register_gl_display_object_renderer,
    render_gl_display_object,
};
pub use materials::{
    get_gl_render_proxy_color_transform, pack_gl_color_transform,
    register_gl_color_transform_shader,
};
pub use particle_emitter::{
    GlParticleRuntime, GlParticleShader, draw_gl_particle_emitter, ensure_gl_particle_shader,
};
pub use quad_batch::draw_gl_quad_batch;
pub use rich_text::draw_gl_rich_text;
pub use scale9_mapper::compute_gl_scale9_quads;
pub use scale9_shape::draw_gl_scale9_shape;
pub use shape::draw_gl_shape;
pub use shape_fill::{
    destroy_gl_shape_fill_mesh_cache_entry, draw_gl_shape_fill, fold_gl_shape_fill_region_color,
    pack_gl_shape_fill_color,
};
pub use shape_mesh::{
    GlShapeMesh, create_gl_shape_mesh, destroy_gl_shape_mesh, draw_gl_shape_mesh,
};
pub use sprite::submit_gl_sprite;
pub use sprite_batch::{
    bind_gl_quad_batch_base_attributes, ensure_gl_quad_batch_shader, flush_gl_sprite_batch,
    pack_gl_sprite_batch_material_instance, pack_gl_sprite_instance, prepare_gl_sprite_batch_write,
    set_gl_quad_batch_world_and_texture, submit_gl_node_atlas_quad, submit_gl_sprite_instance,
    use_gl_quad_batch_program,
};
pub use sprite_renderer::{register_gl_sprite_renderer, submit_gl_sprite_node};
pub use text_input::draw_gl_text_input;
pub use text_label::draw_gl_text_label;
pub use tilemap::draw_gl_tilemap;
pub use uniform_color_transform_material::draw_gl_uniform_color_transform_material;
pub use velocity::draw_gl_velocity;
pub use video::draw_gl_video;
