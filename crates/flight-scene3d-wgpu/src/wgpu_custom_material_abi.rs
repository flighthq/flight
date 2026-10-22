use flight_materials::Material3D;
use flight_render_wgpu::WgpuRenderState;

use crate::types::WgpuMeshPipeline;

pub const WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY: usize = 32;
pub const WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY: usize = 8;

pub fn resolve_wgpu_custom_material_pipeline(
    _state: &WgpuRenderState,
    _material: &dyn Material3D,
) -> Option<WgpuMeshPipeline> {
    // TODO: resolve custom material pipelines from runtime registry
    return None;
}
