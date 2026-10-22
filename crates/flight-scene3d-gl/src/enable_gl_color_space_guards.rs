use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::GlScene3DColorSpaceGuard;

pub fn are_gl_color_space_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.color_space_guard.is_some());
}

pub fn enable_gl_color_space_guards(state: &GlRenderState, guard: GlScene3DColorSpaceGuard) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.color_space_guard = Some(guard);
    });
}
