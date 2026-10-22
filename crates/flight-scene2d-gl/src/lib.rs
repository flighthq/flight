// flight-lint: conform-skip(createGlState) source-only jsdom WebGL test helper is implemented in the native integration-test harness rather than exported from production
//! Native glow-backed display-object renderers for the 2D scene graph (TS `@flighthq/scene2d-gl`).
//! The GL path is thread-bound (D17): every renderer receives the backend-typed `GlRenderState`.

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

// Public lane: what pinned TS `index.ts` exports (whole modules where it uses `export *`, named items
// otherwise), plus the locally owned types those signatures use and the Canvas 2D narrowing seam a
// native host implements. The batch writer, shape/text scratch, clip internals and per-draw entry
// points stay contract-only.
pub use crate::enable_gl_color_adjustment_guards::*;
pub use crate::enable_gl_stroke_path_tessellation::*;
pub use crate::explain_gl_scene2d_coverage::*;
pub use crate::gl_bitmap_text::*;
pub use crate::gl_clip::*;
pub use crate::gl_color_adjustment_material_feature::*;
pub use crate::gl_quad_batch::*;
pub use crate::gl_shape_rasterizer::*;
pub use crate::gl_standard_material::*;
pub use crate::gl_tilemap::*;
pub use crate::scene2d_gl_pipeline::*;

pub use contract::create_gl_cache_state;
pub use contract::create_gl_velocity_target;
pub use contract::enable_gl_render_cache;
pub use contract::enable_gl_text_input;
pub use contract::gl_node2d_velocity_writer;
pub use contract::gl_particle_emitter2d_velocity_writer;
pub use contract::refresh_gl_render_cache;
pub use contract::register_gl_velocity_writer;
pub use contract::render_gl_scene2d;
pub use contract::render_gl_velocity;

pub use contract::GL_MESH_SHAPE_RENDERER;
pub use contract::GL_MORPH_SHAPE_RENDERER;
pub use contract::GL_PARTICLE_EMITTER2D_RENDERER;
pub use contract::GL_RASTER_SHAPE_RENDERER;
pub use contract::GL_RENDER_CACHE_RENDERER;
pub use contract::GL_RICH_TEXT_RENDERER;
pub use contract::GL_SCALE9_SHAPE_RENDERER;
pub use contract::GL_SCALE9_SPRITE_RENDERER;
pub use contract::GL_SCENE2D_RENDERER;
pub use contract::GL_SHAPE_RENDERER;
pub use contract::GL_SPRITE_RENDERER;
pub use contract::GL_TEXT_LABEL_RENDERER;

pub use contract::GlColorAdjustmentMaterialFeature;
pub use contract::GlRichTextOverlay;
pub use contract::GlShapeMesh;
pub use contract::GlShapeRendererData;
pub use contract::GlVelocityContext;
pub use contract::GlVelocityWriter;
pub use contract::RenderCacheRefreshOptions;
pub use contract::ShapeRasterizer;
