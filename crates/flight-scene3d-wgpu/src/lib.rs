//! WebGPU 3D scene rendering: material renderers, shader pipelines, environment maps, shadow maps,
//! and particle emitters for the wgpu backend.

mod enable_wgpu_scene3d_custom_shader_guards;
mod enable_wgpu_scene3d_forward_light_selection_guards;
mod explain_wgpu_scene3d_coverage;
mod explain_wgpu_scene3d_forward_light_selection;
mod prepare_wgpu_scene3d_forward_lights;
mod register_wgpu_standard_pbr_material;
mod types;
mod wgpu_custom_material_abi;
mod wgpu_mesh_fragment_tail;
mod wgpu_mesh_material_registry;
mod wgpu_mesh_upload;
mod wgpu_scene3d_runtime;
mod wgpu_scene3d_time;
mod wgpu_shaded_modifier_snippet;
mod wgpu_wireframe_upload;

pub mod contract;

pub use contract::*;
