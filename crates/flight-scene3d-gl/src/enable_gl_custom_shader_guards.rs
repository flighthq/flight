use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::GlScene3DCustomShaderGuard;

pub fn are_gl_custom_shader_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.custom_shader_guard.is_some());
}

pub fn enable_gl_custom_shader_guards(state: &GlRenderState, guard: GlScene3DCustomShaderGuard) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.custom_shader_guard = Some(guard);
    });
}
