//! The WebGPU 3D scene renderer (TS `@flighthq/scene3d-wgpu`) over the native wgpu render backend
//! (D17): mesh-material renderers and their WGSL families, the shared mesh pipeline, environment
//! maps and image-based lighting, directional shadows, GPU skinning and 3D particles.

mod enable_wgpu_scene3d_forward_light_selection_guards;
mod explain_wgpu_scene3d_coverage;
mod explain_wgpu_scene3d_forward_light_selection;
mod prepare_wgpu_scene3d_forward_lights;
mod render_wgpu_scene3d;
mod types;
mod wgpu_custom_material_abi;
mod wgpu_mesh_fragment_tail;
mod wgpu_mesh_material_registry;
mod wgpu_mesh_pipeline;
mod wgpu_mesh_upload;
mod wgpu_scene3d_runtime;
mod wgpu_scene3d_time;
mod wgpu_shadow_map;
mod wgpu_skin_palette;

pub mod contract;

pub use contract::*;
