//! The scene-scoped time ShadedMaterial's animated modifiers read (TS `wgpuScene3DTime.ts`), kept
//! per state so independent canvases do not share animation.

use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

/// The scene time in seconds; zero until set (TS `getWgpuScene3DTime`).
pub fn get_wgpu_scene3d_time(state: &mut WgpuRenderState) -> f32 {
    return get_wgpu_scene3d_runtime(state).time;
}

/// Sets the scene time in seconds the next draw's modifiers read (TS `setWgpuScene3DTime`).
pub fn set_wgpu_scene3d_time(state: &mut WgpuRenderState, seconds: f32) {
    get_wgpu_scene3d_runtime(state).time = seconds;
}
