use flight_entity::Kind;
use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::types::GlModifierSnippet;

pub fn register_gl_modifier_snippet(state: &GlRenderState, snippet: GlModifierSnippet) {
    let kind = snippet.kind.clone();
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.modifier_snippets.insert(kind, snippet);
    });
}

pub fn resolve_gl_modifier_snippet<R>(
    state: &GlRenderState,
    kind: &Kind,
    f: impl FnOnce(Option<&GlModifierSnippet>) -> R,
) -> R {
    return get_gl_scene3d_runtime(state, |rt| f(rt.modifier_snippets.get(kind)));
}
