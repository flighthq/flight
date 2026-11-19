//! flight-compiler: target-native

use flight_render_gl::GlRenderState;
use glow::HasContext;

// Resolves the authoritative draw-time perspective aspect from the active GL pass. This stays an
// internal backend fact: callers provide a camera, while the current destination determines mapping.
// With no active pass viewport the default framebuffer's current GL viewport stands in for the
// canvas drawing-buffer size, which native GL does not expose.
// flight-lint: allow(f64) 3D geometry, matrices, aspect, camera clip distances and light/shadow values are f64 CPU values (Task Q, foreman-536d86b7); they narrow once into f32 GL uniforms and vertex/instance buffers only
pub fn get_gl_scene3d_viewport_aspect(state: &GlRenderState) -> f64 {
    let viewport = state.gl_runtime.borrow().render_target_viewport;
    let (width, height) = match viewport {
        Some(viewport) => (viewport.width, viewport.height),
        None => {
            let mut values = [0_i32; 4];
            // SAFETY: the viewport query runs on the state's owning GL thread.
            unsafe {
                state
                    .gl
                    .get_parameter_i32_slice(glow::VIEWPORT, &mut values)
            };
            (values[2], values[3])
        }
    };
    return if width > 0 && height > 0 {
        f64::from(width) / f64::from(height)
    } else {
        1.0
    };
}
