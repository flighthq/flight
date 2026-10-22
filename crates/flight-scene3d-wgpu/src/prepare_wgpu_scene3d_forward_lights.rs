use flight_lighting::Scene3DLightsLike;
use flight_render::Scene3DRenderList;
use flight_render_wgpu::WgpuRenderState;

use crate::explain_wgpu_scene3d_forward_light_selection::WgpuScene3DForwardLightList;

pub fn prepare_wgpu_scene3d_forward_lights(
    _state: &WgpuRenderState,
    scene_render_list: &Scene3DRenderList,
    _lights: &Scene3DLightsLike,
) -> WgpuScene3DForwardLightList {
    // TODO: port full implementation — requires get_node_3d_world_bounds, select_scene_3d_forward_lights
    return WgpuScene3DForwardLightList {
        mesh_count: scene_render_list.mesh_count,
        mesh_light_blocks: Vec::new(),
    };
}
