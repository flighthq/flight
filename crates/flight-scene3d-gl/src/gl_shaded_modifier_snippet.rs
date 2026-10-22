// flight-lint: allow-file(contract-vocabulary) D17 modifier snippets are backend-typed GLSL registrations over thread-bound render-gl state

use std::sync::Arc;

use flight_registry::with_kind_map_entry;
use flight_render_gl::{GlModifierSnippet, GlRenderState};

// Registers (or replaces) the GL snippet for a modifier kind on this state's render policy. Opt-in
// and last-write-wins (a vendor-prefixed kind, or an override of a built-in, wins). Unregistered
// kinds contribute no GLSL, so a ShadedMaterial whose modifier has no snippet renders as if that
// modifier were absent. Register the built-ins with register_built_in_gl_modifier_snippets.
pub fn register_gl_modifier_snippet(state: &mut GlRenderState, snippet: &'static GlModifierSnippet) {
    state.gl_registries.modifier_snippets = Arc::new(with_kind_map_entry(
        &state.gl_registries.modifier_snippets,
        snippet.kind.to_string(),
        snippet,
    ));
    state.gl_runtime.borrow_mut().modifier_snippet_revision += 1;
}

// Returns the GL snippet registered for a modifier kind on this state, or None when none is — the
// expected-miss sentinel the compile path checks before injecting an unknown kind.
pub fn resolve_gl_modifier_snippet(state: &GlRenderState, kind: &str) -> Option<&'static GlModifierSnippet> {
    return state.gl_registries.modifier_snippets.entries.get(kind).copied();
}
