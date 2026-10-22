//! Backend-neutral render contracts: generic state/renderer dispatch, caller-owned proxy stores,
//! render queues and targets, diagnostics, and 2D/3D scene preparation.

mod enable_color_adjustment_guards;
mod enable_color_adjustments;
mod enable_scene_render_guards;
mod explain_scene2d_coverage;
mod explain_scene2d_pipeline_coverage;
mod explain_scene2d_render;
mod explain_scene3d_pipeline_coverage;
mod image_surface;
mod merge_render_options;
mod render_appearance;
mod render_cache;
mod render_material;
mod render_proxy;
mod render_proxy_adapter;
mod render_queue;
mod render_registry_guards;
mod render_registry_signals;
mod render_state;
mod render_target;
mod render_transform2d;
mod render_viewport;
mod renderer;
mod scene2d_working_color_space;
mod scene_render;
mod types;

pub mod contract;

pub use contract::*;
