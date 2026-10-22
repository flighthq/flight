use flight_render_wgpu::*;
use flight_scene3d_wgpu::*;
use flight_shading::{MODIFIER_SLOT_EFFECT, Modifier};

use crate::support::*;

fn contribute_noop(
    _modifier: &dyn Modifier,
    _index: usize,
    _context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    return WgpuModifierContribution {
        declarations: None,
        source: "// noop".to_string(),
    };
}

fn contribute_override(
    _modifier: &dyn Modifier,
    _index: usize,
    _context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    return WgpuModifierContribution {
        declarations: None,
        source: "// override".to_string(),
    };
}

static INITIAL: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: "acme.Test",
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: None,
    contribution: contribute_noop,
    textures: None,
};

static OVERRIDE: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: "acme.Test",
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: None,
    contribution: contribute_override,
    textures: None,
};

fn is_snippet(value: Option<&'static WgpuModifierSnippet>, expected: &'static WgpuModifierSnippet) -> bool {
    return value.is_some_and(|value| std::ptr::eq(value, expected));
}

mod register_wgpu_modifier_snippet {
    use super::*;

    #[test]
    fn replaces_the_table_while_an_explicit_pipeline_state_retains_its_snapshot_through_lazy_scene_init() {
        let mut screen = make_wgpu_scene3d_state(None);
        register_wgpu_modifier_snippet(&mut screen.state, &INITIAL);
        let snapshot = get_wgpu_render_state_runtime(&screen.state)
            .registries
            .modifier_snippets
            .clone();
        let mut derived = make_wgpu_scene3d_state(Some(WgpuRenderStateOptions {
            modifier_snippets: Some((*snapshot).clone()),
            ..test_default()
        }));

        get_wgpu_scene3d_runtime(&mut derived.state);
        register_wgpu_modifier_snippet(&mut screen.state, &OVERRIDE);

        let derived_runtime = get_wgpu_render_state_runtime(&derived.state);
        assert!(!std::sync::Arc::ptr_eq(&derived_runtime.registries.modifier_snippets, &snapshot));
        assert_eq!(derived_runtime.modifier_snippet_revision, 0);
        let screen_runtime = get_wgpu_render_state_runtime(&screen.state);
        assert!(!std::sync::Arc::ptr_eq(&screen_runtime.registries.modifier_snippets, &snapshot));
        assert_eq!(screen_runtime.modifier_snippet_revision, 2);
        assert!(is_snippet(snapshot.entries.get("acme.Test").copied(), &INITIAL));
        assert!(is_snippet(resolve_wgpu_modifier_snippet(&derived.state, "acme.Test"), &INITIAL));
        assert!(is_snippet(resolve_wgpu_modifier_snippet(&screen.state, "acme.Test"), &OVERRIDE));
    }
}

mod resolve_wgpu_modifier_snippet {
    use super::*;

    #[test]
    fn returns_null_for_an_unregistered_kind() {
        let test = make_wgpu_scene3d_state(None);
        assert!(resolve_wgpu_modifier_snippet(&test.state, "acme.Missing").is_none());
    }
}
