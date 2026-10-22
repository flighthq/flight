use flight_log::LogStateRef;
use flight_render::{are_render_registries_guards_enabled, enable_render_registries_guards};

use crate::GlRenderState;

pub fn are_gl_texture_resolver_guards_enabled(state: &GlRenderState) -> bool {
    return are_render_registries_guards_enabled(state);
}

// flight-lint: allow(conform-params) D5 native logging state is caller-owned
pub fn enable_gl_texture_resolver_guards(
    state: &mut GlRenderState,
    log_state: Option<LogStateRef>,
) {
    enable_render_registries_guards(state, log_state);
}
