use std::sync::Arc;

use crate::{GlBitmapShader, GlRenderState};

pub fn register_gl_bitmap_shader(state: &GlRenderState, shader: Arc<GlBitmapShader>) {
    state.gl_runtime.borrow_mut().default_bitmap_shader = Some(shader);
}
