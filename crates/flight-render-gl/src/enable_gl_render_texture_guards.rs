use flight_log::{LogLevel, LogStateRef, log_once};
use flight_texture::TextureVariant;

use crate::{
    GlRenderState, GlRenderTextureExplanation, GlRenderTextureStatus, set_gl_render_texture_guard,
};

pub fn are_gl_render_texture_guards_enabled(state: &GlRenderState) -> bool {
    return state
        .gl_runtime
        .borrow()
        .render_texture_guard
        .is_some_and(|guard| {
            std::ptr::fn_addr_eq(
                guard,
                warn_gl_render_texture_unavailable as crate::GlRenderTextureGuard,
            )
        });
}

// flight-lint: allow(conform-params) D5 native logging state is caller-owned
pub fn enable_gl_render_texture_guards(state: &GlRenderState, log_state: Option<LogStateRef>) {
    state.gl_runtime.borrow_mut().render_texture_guard_log = log_state;
    set_gl_render_texture_guard(state, Some(warn_gl_render_texture_unavailable));
}

fn warn_gl_render_texture_unavailable(
    state: &mut GlRenderState,
    _render_texture: &dyn TextureVariant,
    explanation: &GlRenderTextureExplanation,
) {
    let log_state = state.gl_runtime.borrow().render_texture_guard_log.clone();
    let Some(log_state) = log_state else {
        return;
    };
    let (status, message) = match explanation.status {
        GlRenderTextureStatus::Writing => (
            "writing",
            "bindGlRenderTexture: the render Texture is still bound for writing; sampling it would be a read-after-write feedback hazard.",
        ),
        GlRenderTextureStatus::Released => (
            "released",
            "bindGlRenderTexture: the render Texture was released to its pool; sampling uses the empty sentinel.",
        ),
        GlRenderTextureStatus::Ready => return,
        GlRenderTextureStatus::Unrendered => (
            "unrendered",
            "bindGlRenderTexture: the render Texture has not completed renderIntoGlRenderTexture; sampling uses the empty sentinel.",
        ),
    };
    log_once(
        &log_state,
        0.0,
        &format!("render-gl:render-texture-{status}"),
        LogLevel::Warn,
        message.into(),
        Some("render-gl".to_string()),
    );
}
