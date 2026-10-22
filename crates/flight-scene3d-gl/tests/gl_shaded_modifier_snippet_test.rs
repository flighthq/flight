use std::sync::Arc;

use flight_render_gl::GlModifierSnippet;
use flight_scene3d_gl::*;
use flight_shading::MODIFIER_SLOT_EFFECT;
use flight_shading::Modifier;

use crate::gl_test_helper::{make_gl_scene3d_state, make_gl_scene3d_state_with, make_state_options};

fn noop_contribution(_modifier: &dyn Modifier, _index: usize) -> String {
    return "// noop".to_string();
}

fn override_contribution(_modifier: &dyn Modifier, _index: usize) -> String {
    return "// override".to_string();
}

static SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: "acme.Test",
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: None,
    contribution: noop_contribution,
    declarations: None,
};

static OVERRIDE: GlModifierSnippet = GlModifierSnippet {
    kind: "acme.Test",
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: None,
    contribution: override_contribution,
    declarations: None,
};

fn is_snippet(actual: Option<&'static GlModifierSnippet>, expected: &'static GlModifierSnippet) -> bool {
    return actual.is_some_and(|actual| std::ptr::eq(actual, expected));
}

mod register_gl_modifier_snippet {
    use super::*;

    #[test]
    fn starts_with_empty_persistent_policy_and_advances_its_revision_on_registration() {
        let mut state = make_gl_scene3d_state();
        assert_eq!(state.gl_registries.modifier_snippets.entries.len(), 0);
        assert_eq!(state.gl_runtime.borrow().modifier_snippet_revision, 0);
        register_gl_modifier_snippet(&mut state, &SNIPPET);
        assert_eq!(state.gl_registries.modifier_snippets.entries.len(), 1);
        assert_eq!(state.gl_runtime.borrow().modifier_snippet_revision, 1);
    }

    #[test]
    fn stores_a_snippet_resolvable_by_its_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_modifier_snippet(&mut state, &SNIPPET);
        assert!(is_snippet(resolve_gl_modifier_snippet(&state, "acme.Test"), &SNIPPET));
    }

    #[test]
    fn replaces_the_table_while_an_explicitly_copied_state_retains_its_snapshot_through_lazy_scene_init() {
        let mut screen = make_gl_scene3d_state();
        register_gl_modifier_snippet(&mut screen, &SNIPPET);
        let snapshot = screen.gl_registries.modifier_snippets.clone();
        let mut options = make_state_options();
        options.gl_registries = screen.gl_registries.clone();
        let derived = make_gl_scene3d_state_with(&options);

        get_gl_scene3d_runtime(&derived);
        register_gl_modifier_snippet(&mut screen, &OVERRIDE);

        assert!(Arc::ptr_eq(&derived.gl_registries.modifier_snippets, &snapshot));
        assert_eq!(derived.gl_runtime.borrow().modifier_snippet_revision, 0);
        assert!(!Arc::ptr_eq(&screen.gl_registries.modifier_snippets, &snapshot));
        assert_eq!(screen.gl_runtime.borrow().modifier_snippet_revision, 2);
        assert!(is_snippet(snapshot.entries.get("acme.Test").copied(), &SNIPPET));
        assert!(is_snippet(resolve_gl_modifier_snippet(&derived, "acme.Test"), &SNIPPET));
        assert!(is_snippet(resolve_gl_modifier_snippet(&screen, "acme.Test"), &OVERRIDE));
    }
}

mod resolve_gl_modifier_snippet {
    use super::*;

    #[test]
    fn returns_null_for_an_unregistered_kind() {
        let state = make_gl_scene3d_state();
        assert!(resolve_gl_modifier_snippet(&state, "acme.Missing").is_none());
    }
}
