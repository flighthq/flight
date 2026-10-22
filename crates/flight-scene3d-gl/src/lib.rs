//! GL 3D scene rendering (TS `@flighthq/scene3d-gl`): mesh-material renderers, shader program
//! families, environment maps, shadow maps and particle emitters for the glow backend. The GL path is
//! thread-bound (D17): every renderer receives the backend-typed `GlRenderState`.

mod gl_lit_program;
mod gl_mesh_material_registry;
mod gl_mesh_program;
mod gl_mesh_upload;
mod gl_scene3d_runtime;
mod gl_scene3d_time;
mod gl_viewport_aspect;
mod render_gl_scene3d;
mod types;

pub mod contract;

pub use contract::*;
