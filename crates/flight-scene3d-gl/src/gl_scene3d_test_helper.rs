use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlScene3DRuntime;

pub fn has_gl_scene3d_runtime(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |_rt| true);
}
