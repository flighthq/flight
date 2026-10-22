use flight_render_gl::{GlRenderState, get_gl_render_state_runtime};

pub fn get_gl_scene3d_viewport_aspect(state: &GlRenderState) -> f32 {
    let runtime = get_gl_render_state_runtime(state);
    if let Some(viewport) = &runtime.render_target_viewport {
        let width = viewport.width as f32;
        let height = viewport.height as f32;
        if width > 0.0 && height > 0.0 {
            return width / height;
        }
    }
    return 1.0;
}
