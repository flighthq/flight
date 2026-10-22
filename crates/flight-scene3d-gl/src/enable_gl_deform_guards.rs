use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::GlScene3DDeformGuard;

pub fn are_gl_deform_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.deform_guard.is_some());
}

pub fn enable_gl_deform_guards(state: &GlRenderState, guard: GlScene3DDeformGuard) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.deform_guard = Some(guard);
    });
}
