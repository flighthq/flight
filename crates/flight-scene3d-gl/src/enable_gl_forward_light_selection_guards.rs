use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::GlScene3DForwardLightSelectionGuard;

pub fn are_gl_forward_light_selection_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.forward_light_selection_guard.is_some());
}

pub fn enable_gl_forward_light_selection_guards(
    state: &GlRenderState,
    guard: GlScene3DForwardLightSelectionGuard,
) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.forward_light_selection_guard = Some(guard);
    });
}
