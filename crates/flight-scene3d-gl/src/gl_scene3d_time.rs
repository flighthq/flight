use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};

pub fn get_gl_scene3d_time(state: &GlRenderState) -> f32 {
    return get_gl_scene3d_runtime(state, |rt| rt.time);
}

pub fn set_gl_scene3d_time(state: &GlRenderState, time: f32) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.time = time;
    });
}
