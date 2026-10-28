use flight_entity::get_entity_id;
use flight_log::{LogLevel, LogStateRef, log_once};
use flight_node::NodeRef;
use glow::HasContext;

use crate::GlRenderState;

pub fn are_gl_render_state_guards_enabled(state: &GlRenderState) -> bool {
    return state.registries.render_root_guard.is_some_and(|guard| {
        std::ptr::fn_addr_eq(
            guard,
            warn_on_second_render_root as flight_render::RenderRootGuard<GlRenderState>,
        )
    });
}

// flight-lint: allow(conform-params) D5 native logging state is caller-owned
pub fn enable_gl_render_state_guards(state: &mut GlRenderState, log_state: Option<LogStateRef>) {
    state.registries.render_root_guard = Some(warn_on_second_render_root);
    let mut runtime = state.gl_runtime.borrow_mut();
    runtime.binding_cache_guard = Some(warn_on_foreign_gl_binding);
    runtime.render_state_guard_log = log_state;
}

fn log_guard(state: &GlRenderState, key: &str, message: &str) {
    let log_state = state.gl_runtime.borrow().render_state_guard_log.clone();
    if let Some(log_state) = log_state {
        log_once(
            &log_state,
            0.0,
            key,
            LogLevel::Warn,
            message.into(),
            Some("render-gl".to_string()),
        );
    }
}

fn warn_on_foreign_gl_binding(state: &GlRenderState, expected_program: glow::NativeProgram) {
    // SAFETY: the guard runs synchronously on the owning render thread.
    let actual = unsafe { state.gl.get_parameter_program(glow::CURRENT_PROGRAM) };
    if actual == Some(expected_program) {
        return;
    }
    log_guard(
        state,
        "render-gl:foreign-gl-binding",
        "useGlProgram: the GL program actually bound is not the one render-gl cached; call invalidateGlRenderStateCache before returning control to render-gl",
    );
}

fn warn_on_second_render_root(state: &mut GlRenderState, root: &NodeRef) {
    let root_id = get_entity_id(&*root.read().unwrap());
    let previous = state.gl_runtime.borrow().first_render_root_id;
    if previous.is_none() {
        state.gl_runtime.borrow_mut().first_render_root_id = Some(root_id);
        return;
    }
    if previous == Some(root_id) {
        return;
    }
    log_guard(
        state,
        "render-gl:multiple-roots-one-state",
        "prepareScene2DRender: one GlRenderState was used for multiple roots; create a dedicated state for each independently rendered root",
    );
}
