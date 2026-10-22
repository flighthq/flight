use std::sync::Arc;

use flight_entity::Kind;
use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};
use crate::WgpuMeshMaterialRenderer;

pub fn has_wgpu_mesh_material_renderer(state: &WgpuRenderState, kind: &Kind) -> bool {
    return get_wgpu_scene3d_runtime(state, |rt| rt.material_renderers.contains_key(kind));
}

pub fn register_wgpu_mesh_material_renderer(
    state: &WgpuRenderState,
    kind: Kind,
    renderer: Arc<dyn WgpuMeshMaterialRenderer>,
) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.material_renderers.insert(kind, renderer);
    });
}
