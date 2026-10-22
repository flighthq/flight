//! The WebGPU display-object renderers (TS `@flighthq/scene2d-wgpu`) over the native wgpu render
//! backend (D17): the shared quad-batch writer, node renderers for bitmaps, shapes, sprites, text,
//! tilemaps and particles, clips, render caches, the opt-in color-adjustment fold and velocity.

mod enable_wgpu_color_adjustment_guards;
mod enable_wgpu_stroke_path_tessellation;
mod scene2d_wgpu_pipeline;
mod scene2d_wgpu_runtime;
mod types;
mod wgpu_bitmap_text;
mod wgpu_cache;
mod wgpu_clip;
mod wgpu_clip_contours;
mod wgpu_clip_rectangle;
mod wgpu_color_adjustment_material_feature;
mod wgpu_mesh_shape_renderer;
mod wgpu_node2d;
mod wgpu_particle_emitter2d;
mod wgpu_quad_batch;
mod wgpu_quad_batch_writer;
mod wgpu_raster_shape_renderer;
mod wgpu_render_stats;
mod wgpu_renderer_data;
mod wgpu_rich_text;
mod wgpu_scale9_mapper;
mod wgpu_scale9_shape;
mod wgpu_scale9_sprite;
mod wgpu_shape;
mod wgpu_shape_data;
mod wgpu_shape_mesh;
mod wgpu_shape_rasterizer;
mod wgpu_sprite;
mod wgpu_standard_material;
mod wgpu_text_input;
mod wgpu_text_label;
mod wgpu_tilemap;
mod wgpu_velocity;

pub mod contract;

// Public lane: the functions and renderers exported by pinned TS `index.ts`, plus the locally owned
// types their signatures use and the Canvas 2D narrowing seam a native host implements. The batch
// writer, shape/text scratch, clip internals and per-draw entry points stay contract-only.
pub use contract::are_wgpu_color_adjustment_guards_enabled;
pub use contract::create_wgpu_cache_state;
pub use contract::create_wgpu_velocity_target;
pub use contract::enable_wgpu_clip_support;
pub use contract::enable_wgpu_color_adjustment_guards;
pub use contract::enable_wgpu_render_cache;
pub use contract::enable_wgpu_stroke_path_tessellation;
pub use contract::enable_wgpu_text_input;
pub use contract::get_wgpu_shape_rasterizer;
pub use contract::refresh_wgpu_render_cache;
pub use contract::register_wgpu_color_adjustment_material_feature;
pub use contract::register_wgpu_shape_rasterizer;
pub use contract::register_wgpu_standard_material;
pub use contract::register_wgpu_velocity_writer;
pub use contract::render_wgpu_scene2d;
pub use contract::render_wgpu_velocity;
pub use contract::wgpu_node2d_velocity_writer;
pub use contract::wgpu_particle_emitter2d_velocity_writer;

pub use contract::STANDARD_WGPU_QUAD_MATERIAL_RENDERER;
pub use contract::WGPU_BITMAP_TEXT_RENDERER;
pub use contract::WGPU_MESH_SHAPE_RENDERER;
pub use contract::WGPU_MORPH_SHAPE_RENDERER;
pub use contract::WGPU_PARTICLE_EMITTER2D_RENDERER;
pub use contract::WGPU_QUAD_BATCH_RENDERER;
pub use contract::WGPU_RASTER_SHAPE_RENDERER;
pub use contract::WGPU_RENDER_CACHE_RENDERER;
pub use contract::WGPU_RENDER_INFRASTRUCTURE;
pub use contract::WGPU_RICH_TEXT_RENDERER;
pub use contract::WGPU_SCALE9_SHAPE_RENDERER;
pub use contract::WGPU_SCALE9_SPRITE_RENDERER;
pub use contract::WGPU_SCENE2D_RENDER_PRESET;
pub use contract::WGPU_SCENE2D_RENDERER;
pub use contract::WGPU_SHAPE_RENDERER;
pub use contract::WGPU_SPRITE_RENDERER;
pub use contract::WGPU_TEXT_LABEL_RENDERER;
pub use contract::WGPU_TILEMAP_RENDERER;

pub use contract::WgpuColorAdjustmentMaterialFeature;
pub use contract::WgpuRenderStats;
pub use contract::WgpuRichTextOverlay;
pub use contract::WgpuScene2DRenderPreset;
pub use contract::WgpuShapeMesh;
pub use contract::WgpuShapeRendererData;
