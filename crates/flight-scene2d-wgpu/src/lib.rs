//! The WebGPU display-object renderers (TS `@flighthq/scene2d-wgpu`) over the native wgpu render
//! backend (D17): the shared quad-batch writer, node renderers for bitmaps, shapes, sprites, text,
//! tilemaps and particles, clips, render caches, the opt-in color-adjustment fold and velocity.

mod canvas_2d_context;
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

pub use contract::*;
