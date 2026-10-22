use flight_render_wgpu::WgpuRenderState;

use crate::types::WgpuScene3DForwardLightSelectionGuard;
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

pub fn are_wgpu_scene3d_forward_light_selection_guards_enabled(state: &WgpuRenderState) -> bool {
    return get_wgpu_scene3d_runtime(state, |rt| rt.forward_light_selection_guard.is_some());
}

pub fn enable_wgpu_scene3d_forward_light_selection_guards(
    state: &WgpuRenderState,
    guard: WgpuScene3DForwardLightSelectionGuard,
) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.forward_light_selection_guard = Some(guard);
    });
}
