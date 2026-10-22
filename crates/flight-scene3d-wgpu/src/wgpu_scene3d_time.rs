use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

pub fn get_wgpu_scene3d_time(state: &WgpuRenderState) -> f32 {
    return get_wgpu_scene3d_runtime(state, |rt| rt.time);
}

pub fn set_wgpu_scene3d_time(state: &WgpuRenderState, time: f32) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.time = time;
    });
}
