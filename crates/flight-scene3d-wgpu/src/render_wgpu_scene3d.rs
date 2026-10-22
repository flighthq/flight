use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;
use flight_scene3d::Node3D;

use crate::types::{WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy};
use crate::wgpu_mesh_material_registry::resolve_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{draw_wgpu_mesh_subset, write_wgpu_draw_uniform, write_wgpu_frame_uniform};
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime_mut;

pub fn is_wgpu_mesh_gpu_skinned(state: &WgpuRenderState, mesh: &dyn std::any::Any) -> bool {
    return false;
}

pub fn render_wgpu_scene3d(
    state: &WgpuRenderState,
    scene: &dyn Node3D,
    camera: &Camera3D,
    lights: &Scene3DLightBlock,
) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.active_blended_run = false;
        rt.active_skinned_run = false;
        rt.active_color_adjustment_run = false;
        rt.active_color_matrix_run = false;
    });
}
