use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlPbrTransmissionSceneColor;

// Selects the caller-owned, resolved opaque-scene texture sampled by later transmission draws.
// Passing None disables refraction.
pub fn set_gl_pbr_transmission_scene_color(
    state: &GlRenderState,
    scene_color: Option<&GlPbrTransmissionSceneColor>,
) {
    get_gl_scene3d_runtime(state).pbr_transmission_scene_color = scene_color.copied();
}
