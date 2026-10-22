// flight-lint: conform-skip(createGlState) source-only jsdom WebGL test helper is implemented in the native integration-test harness rather than exported from production
//! Native glow-backed display-object renderers for the 2D scene graph (TS `@flighthq/scene2d-gl`).
//! The GL path is thread-bound (D17): every renderer receives the backend-typed `GlRenderState`.

mod canvas_2d_context;
mod enable_gl_color_adjustment_guards;
mod enable_gl_stroke_path_tessellation;
mod explain_gl_scene2d_coverage;
mod gl_bitmap_text;
mod gl_cache;
mod gl_clip;
mod gl_clip_contours;
mod gl_clip_rectangle;
mod gl_color_adjustment_material_feature;
mod gl_mesh_shape_renderer;
mod gl_node2d;
mod gl_particle_emitter2d;
mod gl_quad_batch;
mod gl_quad_batch_common;
mod gl_quad_batch_writer;
mod gl_raster_shape_renderer;
mod gl_rich_text;
mod gl_scale9_mapper;
mod gl_scale9_shape;
mod gl_scale9_sprite;
mod gl_shape;
mod gl_shape_commands;
mod gl_shape_data;
mod gl_shape_mesh;
mod gl_shape_rasterizer;
mod gl_sprite;
mod gl_standard_material;
mod gl_text_input;
mod gl_text_label;
mod gl_tilemap;
mod gl_velocity;
mod scene2d_gl_pipeline;
mod scene2d_gl_runtime;
mod types;

pub mod contract;

pub use contract::*;
