//! Contract lane for the WebGPU 3D scene renderer.

pub use crate::enable_wgpu_scene3d_custom_shader_guards::*;
pub use crate::enable_wgpu_scene3d_forward_light_selection_guards::*;
pub use crate::explain_wgpu_scene3d_coverage::*;
pub use crate::explain_wgpu_scene3d_forward_light_selection::*;
pub use crate::prepare_wgpu_scene3d_forward_lights::*;
pub use crate::register_wgpu_standard_pbr_material::*;
pub use crate::types::*;
pub use crate::wgpu_custom_material_abi::*;
pub use crate::wgpu_mesh_fragment_tail::*;
pub use crate::wgpu_mesh_material_registry::*;
pub use crate::wgpu_mesh_pipeline::*;
pub use crate::wgpu_mesh_upload::*;
pub use crate::wgpu_scene3d_runtime::*;
pub use crate::wgpu_scene3d_time::*;
pub use crate::wgpu_shaded_modifier_snippet::*;
pub use crate::wgpu_wireframe_upload::*;
