use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;

// The per-frame `time` uniform seam owned by the shading GL assembly. Animated modifiers (a scrolling
// AnimatedNormalModifier) read a scene-scoped time value the app advances each frame; the
// ShadedMaterial renderer uploads it into each ShadedMaterial program's `u_time`. Time is in seconds.

// Returns the current per-frame time (seconds) stored on this state's scene runtime. Defaults to 0
// until set_gl_scene3d_time runs, so a caller that never advances time gets a static result.
pub fn get_gl_scene3d_time(state: &GlRenderState) -> f32 {
    return get_gl_scene3d_runtime(state).time;
}

// Sets the per-frame time (seconds) the ShadedMaterial renderer uploads to `u_time` each draw. Call
// once per frame before render_gl_scene3d so every animated modifier this frame samples the same time.
pub fn set_gl_scene3d_time(state: &GlRenderState, time_seconds: f32) {
    get_gl_scene3d_runtime(state).time = time_seconds;
}
