use flight_render_gl::GlRenderState;
use flight_shading::{
    ANIMATED_NORMAL_MODIFIER_KIND, DISSOLVE_MODIFIER_KIND, EMISSIVE_MODIFIER_KIND,
    ENV_REFLECT_MODIFIER_KIND, FOG_MODIFIER_KIND, RIM_MODIFIER_KIND,
    TOON_MODIFIER_KIND, VERTEX_DISPLACE_MODIFIER_KIND,
};

use crate::gl_shaded_modifier_snippet::register_gl_modifier_snippet;
use crate::types::GlModifierSnippet;

pub fn register_built_in_gl_modifier_snippets(state: &GlRenderState) {
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: ANIMATED_NORMAL_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: DISSOLVE_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: EMISSIVE_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: ENV_REFLECT_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: FOG_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: RIM_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: TOON_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
    register_gl_modifier_snippet(state, GlModifierSnippet {
        kind: VERTEX_DISPLACE_MODIFIER_KIND.to_string(),
        vertex_preamble: String::new(),
        vertex_body: String::new(),
        fragment_preamble: String::new(),
        fragment_body: String::new(),
        define_key_fn: None,
    });
}
