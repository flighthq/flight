use flight_render::ShapeRasterizer;
use flight_render_gl::GlRenderState;

pub fn get_gl_shape_rasterizer(state: &GlRenderState) -> Option<ShapeRasterizer<GlRenderState>> {
    return state.gl_registries.shape_rasterizer.clone();
}

// Installs the fallback that draws fills the mesh path cannot express. Registration is the opt-in: a
// state without one draws its solid shapes and reports the rest as a registry miss, and nothing here
// reaches for a rasterizer the caller did not name. Pass None to remove one.
pub fn register_gl_shape_rasterizer(
    state: &mut GlRenderState,
    rasterizer: Option<ShapeRasterizer<GlRenderState>>,
) {
    state.gl_registries.shape_rasterizer = rasterizer;
}
