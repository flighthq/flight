//! Native glow-backed display-object renderers for the 2D scene graph (TS `@flighthq/scene2d-gl`).
//! The GL path is thread-bound (D17): every renderer receives the backend-typed `GlRenderState`.

mod gl_color_adjustment_material_feature;
mod gl_quad_batch_writer;
mod gl_scale9_mapper;
mod gl_shape_data;
mod gl_shape_mesh;
mod gl_shape_rasterizer;
mod gl_standard_material;
mod types;

pub mod contract;

pub use contract::*;
