use flight_render_wgpu::WgpuRenderState;

use crate::types::WgpuScene3DCustomShaderGuard;
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

pub fn are_wgpu_scene3d_custom_shader_guards_enabled(state: &WgpuRenderState) -> bool {
    return get_wgpu_scene3d_runtime(state, |rt| rt.custom_shader_guard.is_some());
}

pub fn enable_wgpu_scene3d_custom_shader_guards(
    state: &WgpuRenderState,
    guard: WgpuScene3DCustomShaderGuard,
) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.custom_shader_guard = Some(guard);
    });
}
