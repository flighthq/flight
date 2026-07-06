//! `flighthq-displayobject-wgpu` — WebGPU display-object leaf renderers (bitmap,
//! shape, sprite, text, tilemap, particles) over the `flighthq-render-wgpu`
//! backend core.
//!
//! Ports the TypeScript `@flighthq/displayobject-wgpu` package: the per-subject
//! leaf renderers split out of the former render monolith. Each leaf draws one
//! scene-graph subject through the backend core's `WgpuRenderState`, reading and
//! writing the runtime slots the core defines.
//!
//! Registration is opt-in: call `register_wgpu_display_object_renderer` and
//! `register_wgpu_sprite_renderer` after `create_wgpu_render_state` to enable the
//! standard pipelines. No side effects occur at module load.

pub mod bitmap;
pub mod cache;
pub mod clip;
pub mod clip_contours;
pub mod clip_rectangle;
pub mod color_transform_material;
pub mod default_material;
pub mod display_object;
pub mod materials;
pub mod particle_emitter;
pub mod quad_batch;
pub mod rich_text;
pub mod scale9_mapper;
pub mod scale9_shape;
pub mod shape;
pub mod shape_mesh;
pub mod sprite;
pub mod sprite_batch;
pub mod sprite_renderer;
pub mod text_input;
pub mod text_label;
pub mod tilemap;
pub mod velocity;
pub mod video;

// ---------------------------------------------------------------------------
// Top-level re-exports — the public API surface.
// ---------------------------------------------------------------------------

pub use bitmap::{
    DefaultWgpuBitmapRenderer, WgpuBitmapTexture, draw_wgpu_bitmap, draw_wgpu_bitmap_texture,
};
pub use cache::{
    WgpuCacheState, create_wgpu_cache_state, enable_wgpu_render_cache,
    ensure_wgpu_render_cache_target, get_wgpu_render_cache_target, refresh_wgpu_render_cache,
    release_wgpu_render_cache,
};
pub use clip::enable_wgpu_clip_support;
pub use clip_contours::{pop_wgpu_clip_contours, push_wgpu_clip_contours};
pub use clip_rectangle::{WgpuClipRectangle, pop_wgpu_clip_rectangle, push_wgpu_clip_rectangle};
pub use color_transform_material::{
    ColorTransformWgpuMaterialRenderer, UniformColorTransformWgpuMaterialRenderer,
    register_wgpu_color_transform_materials,
};
pub use default_material::{DefaultWgpuMaterialRenderer, register_default_wgpu_material};
pub use display_object::{
    DefaultWgpuDisplayObjectRenderer, WgpuShapeGeometry, compose_wgpu_clip_rectangle,
    draw_wgpu_display_object, register_wgpu_display_object_renderer, render_wgpu_display_object,
};
pub use materials::{draw_wgpu_color_transform_bitmap, register_wgpu_color_transform_shader};
pub use particle_emitter::{DefaultWgpuParticleEmitterRenderer, draw_wgpu_particle_emitter};
pub use quad_batch::{DefaultWgpuQuadBatchRenderer, WgpuQuadBatchSource, draw_wgpu_quad_batch};
pub use rich_text::{
    DefaultWgpuRichTextRenderer, WgpuRichTextData, create_wgpu_rich_text_data,
    destroy_wgpu_rich_text_data, draw_wgpu_rich_text, draw_wgpu_rich_text_with_overlay,
    register_wgpu_text_input_overlay,
};
pub use scale9_mapper::build_wgpu_scale9_mapper;
pub use scale9_shape::{
    DefaultWgpuScale9ShapeRenderer, create_wgpu_scale9_shape_data, destroy_wgpu_scale9_shape_data,
    draw_wgpu_scale9_shape, draw_wgpu_scale9_shape_mask, remap_wgpu_scale9_commands,
};
pub use shape::{DefaultWgpuShapeRenderer, draw_wgpu_shape};
pub use shape_mesh::{draw_wgpu_shape_fill, draw_wgpu_shape_meshes};
pub use sprite::{WgpuSpriteSource, render_wgpu_sprite};
pub use sprite_batch::{
    ensure_wgpu_quad_batch_resources, flush_wgpu_sprite_batch, get_wgpu_quad_batch_pipeline,
    get_wgpu_quad_batch_prelude_wgsl, pack_wgpu_sprite_batch_material_instance,
    pack_wgpu_sprite_instance, prepare_wgpu_sprite_batch_write,
    reset_wgpu_sprite_batch_buffer_pool, submit_wgpu_node_atlas_quad, submit_wgpu_sprite_instance,
};
pub use sprite_renderer::{DefaultWgpuSpriteRenderer, register_wgpu_sprite_renderer};
pub use text_input::{draw_wgpu_text_input_overlay, enable_wgpu_text_input};
pub use text_label::{DefaultWgpuTextLabelRenderer, draw_wgpu_text_label};
pub use tilemap::{DefaultWgpuTilemapRenderer, WgpuTilemapSource, draw_wgpu_tilemap};
pub use velocity::{
    DefaultWgpuDisplayObjectVelocityWriter, DefaultWgpuParticleEmitterVelocityWriter,
    DefaultWgpuQuadBatchVelocityWriter, create_wgpu_velocity_target, draw_wgpu_velocity_quad,
    get_wgpu_velocity_writer, register_wgpu_velocity_writer, render_wgpu_velocity,
};
pub use video::{
    DefaultWgpuVideoRenderer, create_wgpu_video_data, destroy_wgpu_video_data, draw_wgpu_video,
};

use flighthq_render_wgpu::WgpuRenderState;

/// Registers the standard wgpu display-object leaf renderers on `state` in one
/// call: the display-object container/bitmap/shape renderer and the sprite-graph
/// renderer. The umbrella mirrors the TS package's combined registration seam;
/// callers that need finer control call the individual `register_*` functions.
pub fn register_wgpu_display_object_renderers(state: &mut WgpuRenderState) {
    register_wgpu_display_object_renderer(state);
    register_wgpu_sprite_renderer(state);
}
