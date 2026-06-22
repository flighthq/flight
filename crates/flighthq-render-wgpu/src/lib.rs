//! `flighthq-render-wgpu`
//!
//! wgpu renderer (Vulkan / Metal / DX12 natively, WebGPU on the web) for the
//! Flight scene graph. Provides a `WgpuRenderState` that owns a `wgpu::Device`
//! and `wgpu::Queue`, an instanced sprite batch for high-throughput atlas
//! rendering, a dynamic-offset uniform ring buffer, a blend/stencil/format
//! keyed pipeline cache, and individual renderers for bitmaps, shapes, text,
//! video, tilemaps, particles, and quad batches.
//!
//! All registration is opt-in: call `register_wgpu_display_object_renderer` and
//! `register_wgpu_sprite_renderer` after `create_wgpu_render_state` to enable
//! the standard pipelines. No side effects occur at module load.

pub mod background;
pub mod bitmap;
pub mod cache;
pub mod clip;
pub mod clip_rectangle;
pub mod color_transform_material;
pub mod default_material;
pub mod display_object;
pub mod draw;
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
pub mod shape_mesh;
pub mod sprite;
pub mod sprite_batch;
pub mod sprite_renderer;
pub mod surface;
pub mod text_input;
pub mod text_label;
pub mod tilemap;
pub mod velocity;
pub mod video;

// ---------------------------------------------------------------------------
// Top-level re-exports — the public API surface.
// ---------------------------------------------------------------------------

pub use background::{render_wgpu_background, set_wgpu_frame_target_view, submit_wgpu_render_pass};
pub use bitmap::{
    DefaultWgpuBitmapRenderer, WgpuBitmapTexture, draw_wgpu_bitmap, draw_wgpu_bitmap_texture,
};
pub use cache::{
    WgpuCacheState, create_wgpu_cache_state, enable_wgpu_render_cache,
    ensure_wgpu_render_cache_target, get_wgpu_render_cache_target, refresh_wgpu_render_cache,
    release_wgpu_render_cache,
};
pub use clip::enable_wgpu_clip_support;
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
pub use draw::{
    WgpuTextureInfo, apply_wgpu_blend_mode, bind_wgpu_texture, build_wgpu_render_target_bind_group,
    composite_wgpu_cached_texture, create_wgpu_texture, draw_wgpu_quad,
    draw_wgpu_quad_with_transform, enable_wgpu_blend_mode_support, update_wgpu_texture,
};
pub use material_registry::{
    WgpuMaterialRenderer, get_wgpu_material_renderer, register_wgpu_material_renderer,
    resolve_wgpu_material_renderer,
};
pub use materials::{draw_wgpu_color_transform_bitmap, register_wgpu_color_transform_shader};
pub use particle_emitter::{DefaultWgpuParticleEmitterRenderer, draw_wgpu_particle_emitter};
pub use quad_batch::{DefaultWgpuQuadBatchRenderer, draw_wgpu_quad_batch};
pub use render_state::{
    WgpuClipForm, WgpuRenderOptions, WgpuRenderState, WgpuRenderStateRuntime, WgpuRenderTarget,
    WgpuRenderTargetStackEntry, WgpuRendererSlot, WgpuScissorRect, WgpuViewport,
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
pub use rich_text::{
    DefaultWgpuRichTextRenderer, WgpuRichTextOverlay, create_wgpu_rich_text_data,
    destroy_wgpu_rich_text_data, draw_wgpu_rich_text, draw_wgpu_rich_text_with_overlay,
    register_wgpu_text_input_overlay,
};
pub use scale9_mapper::build_wgpu_scale9_mapper;
pub use scale9_shape::{
    DefaultWgpuScale9ShapeRenderer, create_wgpu_scale9_shape_data, destroy_wgpu_scale9_shape_data,
    draw_wgpu_scale9_shape, draw_wgpu_scale9_shape_mask, remap_wgpu_scale9_commands,
};
pub use shader::{
    UNIFORM_BYTE_SIZE, WgpuBindGroupLayouts, WgpuBitmapShader, WgpuStencilMode,
    create_wgpu_bind_group_layouts, create_wgpu_pipeline_layout, get_active_wgpu_pipeline,
    get_wgpu_pipeline, set_wgpu_matrix_from_transform, warm_wgpu_pipelines,
    write_wgpu_matrix_only_uniforms, write_wgpu_quad_uniforms,
};
pub use shader_binding::{get_wgpu_shader, resolve_wgpu_shader, set_wgpu_shader};
pub use shape::{DefaultWgpuShapeRenderer, draw_wgpu_shape};
pub use shape_mesh::{
    WgpuShapeMesh, WgpuShapeMeshCacheEntry, draw_wgpu_shape_fill, draw_wgpu_shape_meshes,
};
pub use sprite::render_wgpu_sprite;
pub use sprite_batch::{
    SPRITE_INSTANCE_FLOATS, WgpuQuadBatchResources, WgpuSpriteBatchRuntime,
    ensure_wgpu_quad_batch_resources, flush_wgpu_sprite_batch, get_wgpu_quad_batch_pipeline,
    get_wgpu_quad_batch_prelude_wgsl, pack_wgpu_sprite_batch_material_instance,
    pack_wgpu_sprite_instance, prepare_wgpu_sprite_batch_write,
    reset_wgpu_sprite_batch_buffer_pool, submit_wgpu_node_atlas_quad, submit_wgpu_sprite_instance,
};
pub use sprite_renderer::{DefaultWgpuSpriteRenderer, register_wgpu_sprite_renderer};
pub use surface::{
    acquire_wgpu_frame_capture_texture, enable_wgpu_frame_capture, encode_wgpu_frame_capture,
};
pub use text_input::{draw_wgpu_text_input_overlay, enable_wgpu_text_input};
pub use text_label::{DefaultWgpuTextLabelRenderer, draw_wgpu_text_label};
pub use tilemap::DefaultWgpuTilemapRenderer;
pub use velocity::{
    DefaultWgpuDisplayObjectVelocityWriter, DefaultWgpuParticleEmitterVelocityWriter,
    DefaultWgpuQuadBatchVelocityWriter, WgpuVelocityPipeline, WgpuVelocityWriter,
    create_wgpu_velocity_target, draw_wgpu_velocity_quad, get_wgpu_velocity_writer,
    register_wgpu_velocity_writer, render_wgpu_velocity,
};
pub use video::{
    DefaultWgpuVideoRenderer, create_wgpu_video_data, destroy_wgpu_video_data, draw_wgpu_video,
};
