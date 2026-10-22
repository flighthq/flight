//! The shape-rasterizer registration (TS `wgpuShapeRasterizer.ts`): the fallback that draws fills
//! the mesh path cannot express, held in render-wgpu's typed `ShapeRasterizer<WgpuRenderState>`
//! slot.

use flight_render::ShapeRasterizer;
use flight_render_wgpu::{
    WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

/// The rasterizer registered on `state`, or `None` (TS `getWgpuShapeRasterizer`).
pub fn get_wgpu_shape_rasterizer(
    state: &WgpuRenderState,
) -> Option<ShapeRasterizer<WgpuRenderState>> {
    return get_wgpu_render_state_runtime(state)
        .registries
        .shape_rasterizer
        .clone();
}

/// Installs the fallback that draws fills the mesh path cannot express (TS
/// `registerWgpuShapeRasterizer`). Registration is the opt-in: a state without one draws its solid
/// shapes and reports the rest as a registry miss. `None` removes one.
pub fn register_wgpu_shape_rasterizer(
    state: &mut WgpuRenderState,
    rasterizer: Option<ShapeRasterizer<WgpuRenderState>>,
) {
    get_wgpu_render_state_runtime_mut(state)
        .registries
        .shape_rasterizer = rasterizer;
}
