use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime_mut;
use crate::types::GlPbrTransmissionSceneColor;

pub fn set_gl_pbr_transmission_scene_color(
    state: &GlRenderState,
    scene_color: Option<GlPbrTransmissionSceneColor>,
) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.pbr_transmission_scene_color = scene_color;
    });
}
