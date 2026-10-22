//! The shape-rasterizer registration (TS `wgpuShapeRasterizer.ts`): the fallback that draws fills
//! the mesh path cannot express. render-wgpu holds it in an erased slot; this package owns its
//! concrete `ShapeRasterizer<WgpuRenderState>` form.

use std::sync::Arc;

use flight_render_wgpu::{
    WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

use crate::types::*;

/// The rasterizer registered on `state`, or `None` (TS `getWgpuShapeRasterizer`).
pub fn get_wgpu_shape_rasterizer(
    state: &WgpuRenderState,
) -> Option<ShapeRasterizer<WgpuRenderState>> {
    let slot = get_wgpu_render_state_runtime(state)
        .registries
        .shape_rasterizer
        .as_ref()?;
    return Some(
        slot.downcast_ref::<ShapeRasterizer<WgpuRenderState>>()
            .expect("the shape-rasterizer slot holds a ShapeRasterizer<WgpuRenderState>")
            .clone(),
    );
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
        .shape_rasterizer = rasterizer.map(|rasterizer| {
        let slot: flight_render_wgpu::WgpuShapeRasterizerSlot = Arc::new(rasterizer);
        return slot;
    });
}
