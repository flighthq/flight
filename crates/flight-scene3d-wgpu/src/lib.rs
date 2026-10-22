//! WebGPU 3D scene rendering: material renderers, shader pipelines, environment maps, shadow maps,
//! and particle emitters for the wgpu backend.

mod enable_wgpu_scene3d_custom_shader_guards;
mod enable_wgpu_scene3d_forward_light_selection_guards;
mod explain_wgpu_scene3d_coverage;
mod types;
mod wgpu_mesh_material_registry;
mod wgpu_scene3d_runtime;
mod wgpu_scene3d_time;
mod wgpu_shaded_modifier_snippet;

pub mod contract;

pub use contract::*;
