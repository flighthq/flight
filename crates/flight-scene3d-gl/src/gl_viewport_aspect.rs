use flight_render_gl::GlRenderState;
use glow::HasContext;

// Resolves the authoritative draw-time perspective aspect from the active GL pass. This stays an
// internal backend fact: callers provide a camera, while the current destination determines mapping.
// With no active pass viewport the default framebuffer's current GL viewport stands in for the
// canvas drawing-buffer size, which native GL does not expose.
pub fn get_gl_scene3d_viewport_aspect(state: &GlRenderState) -> f32 {
    let viewport = state.gl_runtime.borrow().render_target_viewport;
    let (width, height) = match viewport {
        Some(viewport) => (viewport.width, viewport.height),
        None => {
            let mut values = [0_i32; 4];
            // SAFETY: the viewport query runs on the state's owning GL thread.
            unsafe { state.gl.get_parameter_i32_slice(glow::VIEWPORT, &mut values) };
            (values[2], values[3])
        }
    };
    return if width > 0 && height > 0 {
        width as f32 / height as f32
    } else {
        1.0
    };
}
