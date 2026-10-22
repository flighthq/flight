// flight-lint: conform-skip(createGlState, makeGL, makeShaderLoc) source-only fake WebGL helpers are implemented in the native integration-test harness rather than exported from production
//! Native GL renderer substrate. The public state is deliberately thread-bound: every live
//! `glow::Context` is retained through `Rc`, while cross-thread drops communicate only numeric
//! entity ids or raw GL names through the deferred deletion queue.

mod context;
mod enable_gl_render_state_guards;
mod enable_gl_render_texture_guards;
mod enable_gl_texture_resolver_guards;
mod explain_gl_texture_resolution;
mod gl_compressed_texture;
mod gl_cube_render_target;
mod gl_draw;
mod gl_external_texture;
mod gl_fullscreen_pass;
mod gl_linear_to_srgb_pass;
mod gl_present_render_target;
mod gl_program;
mod gl_quad_material_registry;
mod gl_readback;
mod gl_render_pass;
mod gl_render_state;
mod gl_render_state_bracket;
mod gl_render_target;
mod gl_render_target_pool;
mod gl_render_texture;
mod gl_render_texture_pool;
mod gl_render_view;
mod gl_shader;
mod gl_shader_binding;
mod gl_shader_registry;
mod gl_skin_palette_texture;
mod gl_texture_resolver;
mod gl_texture_upload;
mod gl_texture_video_upload;
mod types;

pub mod contract;

pub use contract::*;
