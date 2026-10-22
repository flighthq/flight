use flight_render_gl::GlRenderState;
use flight_shading::ModifierKind;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::GlModifierSnippet;

pub fn has_gl_modifier_snippet(state: &GlRenderState, kind: &ModifierKind) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.modifier_snippets.contains_key(kind));
}

