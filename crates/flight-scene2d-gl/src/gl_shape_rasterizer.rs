// flight-lint: allow-file(contract-vocabulary) D17 shape-rasterizer registration stores an opaque callback in render-gl's erased slot

use std::sync::Arc;

use flight_render_gl::GlRenderState;

use crate::types::ShapeRasterizer;

pub fn get_gl_shape_rasterizer(state: &GlRenderState) -> Option<ShapeRasterizer<GlRenderState>> {
    let entry = state.gl_registries.shape_rasterizer.as_ref()?;
    return entry
        .downcast_ref::<ShapeRasterizer<GlRenderState>>()
        .cloned();
}

// Installs the fallback that draws fills the mesh path cannot express. Registration is the opt-in: a
// state without one draws its solid shapes and reports the rest as a registry miss, and nothing here
// reaches for a rasterizer the caller did not name. Pass None to remove one.
pub fn register_gl_shape_rasterizer(
    state: &mut GlRenderState,
    rasterizer: Option<ShapeRasterizer<GlRenderState>>,
) {
    state.gl_registries.shape_rasterizer = rasterizer.map(|value| {
        let slot: flight_render_gl::GlShapeRasterizerSlot = Arc::new(value);
        slot
    });
}
