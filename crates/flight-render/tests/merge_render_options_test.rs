use std::collections::HashMap;

use flight_entity::UnknownValue;
use flight_node::NodeRef;
use flight_registry::KindMap;
use flight_render::*;

use crate::support::NOOP_RENDERER;

static CLIP_HOOKS: Scene2DClipHooks<BaseRenderState> = Scene2DClipHooks {
    finalize: |_| {},
    pop_clip: |_, _, _| {},
    push_clip: |_, _, _| {},
};

fn color_resolver(
    _state: &mut BaseRenderState,
    _proxy: &mut RenderProxy<BaseRenderState>,
    _parent: Option<&RenderProxy<BaseRenderState>>,
) {
}

fn effect_resolver(_value: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 0.0,
        left: 0.0,
        right: 0.0,
        top: 0.0,
    };
}

fn kind_map<T>(values: Vec<(&str, T)>) -> KindMap<T> {
    let mut entries = HashMap::new();
    let mut key_order = Vec::new();
    for (kind, value) in values {
        entries.insert(kind.to_string(), value);
        key_order.push(kind.to_string());
    }
    return KindMap { entries, key_order };
}

fn root_guard(_state: &mut BaseRenderState, _node: &NodeRef) {}

fn second_color_resolver(
    state: &mut BaseRenderState,
    _proxy: &mut RenderProxy<BaseRenderState>,
    _parent: Option<&RenderProxy<BaseRenderState>>,
) {
    state.render.render_alpha = 2.0;
}

fn second_effect_resolver(_value: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 1.0,
        left: 1.0,
        right: 1.0,
        top: 1.0,
    };
}

fn second_root_guard(state: &mut BaseRenderState, _node: &NodeRef) {
    state.render.render_alpha = 3.0;
}

fn second_stroke_tessellator(
    _path: &flight_path::Path,
    _style: &flight_path::StrokeStyle,
    _tolerance: Option<f32>,
) -> Option<flight_path::PathMesh> {
    return Some(flight_path::PathMesh {
        indices: Vec::new(),
        vertices: Vec::new(),
    });
}

fn second_unsupported_guard(state: &mut BaseRenderState, _node: &NodeRef) {
    state.render.render_alpha = 4.0;
}

fn stroke_tessellator(
    _path: &flight_path::Path,
    _style: &flight_path::StrokeStyle,
    _tolerance: Option<f32>,
) -> Option<flight_path::PathMesh> {
    return None;
}

fn unsupported_guard(_state: &mut BaseRenderState, _node: &NodeRef) {}

mod merge_render_options {
    use super::*;

    #[test]
    fn merge_render_options_covers_every_declared_field() {
        let first = RenderStateOptions {
            canvas_shape_commands: Some(KindMap {
                entries: HashMap::from([(
                    "moveTo".to_string(),
                    std::sync::Arc::new(1_u32) as UnknownValue,
                )]),
                key_order: vec!["moveTo".to_string()],
            }),
            clip_hooks: Some(&CLIP_HOOKS),
            color_adjustments: Some(Some(color_resolver)),
            color_adjustment_unsupported_guard: Some(Some(unsupported_guard)),
            effect_padding_resolvers: Some(KindMap {
                entries: HashMap::from([(
                    "Effect".to_string(),
                    effect_resolver as EffectPaddingResolver,
                )]),
                key_order: vec!["Effect".to_string()],
            }),
            node_renderers: Some(KindMap {
                entries: HashMap::from([("Node".to_string(), &NOOP_RENDERER)]),
                key_order: vec!["Node".to_string()],
            }),
            render_root_guard: Some(Some(root_guard)),
            stroke_tessellator: Some(None),
        };
        let second = RenderStateOptions {
            canvas_shape_commands: Some(KindMap {
                entries: HashMap::from([(
                    "lineTo".to_string(),
                    std::sync::Arc::new(2_u32) as UnknownValue,
                )]),
                key_order: vec!["lineTo".to_string()],
            }),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let merged = merge_render_options(&[&first, &second]);
        assert_eq!(merged.canvas_shape_commands.unwrap().entries.len(), 2);
        assert!(merged.clip_hooks.is_some());
        assert!(merged.color_adjustments.unwrap().is_some());
        assert!(merged.color_adjustment_unsupported_guard.unwrap().is_some());
        assert!(
            merged
                .effect_padding_resolvers
                .unwrap()
                .entries
                .contains_key("Effect")
        );
        assert!(merged.node_renderers.unwrap().entries.contains_key("Node"));
        assert!(merged.render_root_guard.unwrap().is_some());
        assert_eq!(merged.stroke_tessellator, Some(None));
    }

    #[test]
    fn merge_render_options_merges_canvas_shape_commands_so_entries_from_both_fragments_survive() {
        let first = RenderStateOptions {
            canvas_shape_commands: Some(kind_map(vec![(
                "A",
                std::sync::Arc::new(1_u32) as UnknownValue,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            canvas_shape_commands: Some(kind_map(vec![(
                "B",
                std::sync::Arc::new(2_u32) as UnknownValue,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let merged = merge_render_options(&[&first, &second])
            .canvas_shape_commands
            .unwrap();
        assert_eq!(merged.key_order, vec!["A".to_string(), "B".to_string()]);
    }

    #[test]
    fn merge_render_options_merges_effect_padding_resolvers_so_entries_from_both_fragments_survive()
    {
        let first = RenderStateOptions {
            effect_padding_resolvers: Some(kind_map(vec![(
                "A",
                effect_resolver as EffectPaddingResolver,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            effect_padding_resolvers: Some(kind_map(vec![(
                "B",
                second_effect_resolver as EffectPaddingResolver,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let merged = merge_render_options(&[&first, &second])
            .effect_padding_resolvers
            .unwrap();
        assert_eq!(merged.key_order, vec!["A".to_string(), "B".to_string()]);
    }

    #[test]
    fn merge_render_options_merges_node_renderers_so_entries_from_both_fragments_survive() {
        let first = RenderStateOptions {
            node_renderers: Some(kind_map(vec![("A", &NOOP_RENDERER)])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            node_renderers: Some(kind_map(vec![("B", &crate::support::SECOND_RENDERER)])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let merged = merge_render_options(&[&first, &second])
            .node_renderers
            .unwrap();
        assert_eq!(merged.key_order, vec!["A".to_string(), "B".to_string()]);
    }

    #[test]
    fn merge_render_options_lets_later_canvas_shape_command_win_per_key() {
        let first_value = std::sync::Arc::new(1_u32) as UnknownValue;
        let second_value = std::sync::Arc::new(2_u32) as UnknownValue;
        let first = RenderStateOptions {
            canvas_shape_commands: Some(kind_map(vec![("A", first_value)])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            canvas_shape_commands: Some(kind_map(vec![("A", second_value.clone())])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let merged = merge_render_options(&[&first, &second])
            .canvas_shape_commands
            .unwrap();
        assert!(std::sync::Arc::ptr_eq(
            merged.entries.get("A").unwrap(),
            &second_value
        ));
    }

    #[test]
    fn merge_render_options_lets_later_effect_padding_resolver_win_per_key() {
        let first = RenderStateOptions {
            effect_padding_resolvers: Some(kind_map(vec![(
                "A",
                effect_resolver as EffectPaddingResolver,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            effect_padding_resolvers: Some(kind_map(vec![(
                "A",
                second_effect_resolver as EffectPaddingResolver,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let merged = merge_render_options(&[&first, &second])
            .effect_padding_resolvers
            .unwrap();
        assert!(std::ptr::fn_addr_eq(
            *merged.entries.get("A").unwrap(),
            second_effect_resolver as EffectPaddingResolver
        ));
    }

    #[test]
    fn merge_render_options_lets_later_node_renderer_win_per_key() {
        let first = RenderStateOptions {
            node_renderers: Some(kind_map(vec![("A", &NOOP_RENDERER)])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            node_renderers: Some(kind_map(vec![("A", &crate::support::SECOND_RENDERER)])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let merged = merge_render_options(&[&first, &second])
            .node_renderers
            .unwrap();
        assert!(std::ptr::eq(
            *merged.entries.get("A").unwrap(),
            &crate::support::SECOND_RENDERER
        ));
    }

    #[test]
    fn merge_render_options_does_not_alias_canvas_shape_commands_input() {
        let input = kind_map(vec![("A", std::sync::Arc::new(1_u32) as UnknownValue)]);
        let fragment = RenderStateOptions {
            canvas_shape_commands: Some(input.clone()),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let mut merged = merge_render_options(&[&fragment])
            .canvas_shape_commands
            .unwrap();
        merged
            .entries
            .insert("B".to_string(), std::sync::Arc::new(2_u32) as UnknownValue);
        assert_eq!(input.key_order, vec!["A".to_string()]);
        assert!(!input.entries.contains_key("B"));
    }

    #[test]
    fn merge_render_options_does_not_alias_effect_padding_resolvers_input() {
        let input = kind_map(vec![("A", effect_resolver as EffectPaddingResolver)]);
        let fragment = RenderStateOptions {
            effect_padding_resolvers: Some(input.clone()),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let mut merged = merge_render_options(&[&fragment])
            .effect_padding_resolvers
            .unwrap();
        merged.entries.insert(
            "B".to_string(),
            second_effect_resolver as EffectPaddingResolver,
        );
        assert_eq!(input.key_order, vec!["A".to_string()]);
        assert!(!input.entries.contains_key("B"));
    }

    #[test]
    fn merge_render_options_does_not_alias_node_renderers_input() {
        let input = kind_map(vec![("A", &NOOP_RENDERER)]);
        let fragment = RenderStateOptions {
            node_renderers: Some(input.clone()),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let mut merged = merge_render_options(&[&fragment]).node_renderers.unwrap();
        merged
            .entries
            .insert("B".to_string(), &crate::support::SECOND_RENDERER);
        assert_eq!(input.key_order, vec!["A".to_string()]);
        assert!(!input.entries.contains_key("B"));
    }

    #[test]
    fn merge_render_options_takes_last_stated_color_adjustments() {
        let first = RenderStateOptions {
            color_adjustments: Some(Some(color_resolver)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            color_adjustments: Some(Some(second_color_resolver)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let selected = merge_render_options(&[&first, &second])
            .color_adjustments
            .flatten()
            .unwrap();
        assert!(std::ptr::fn_addr_eq(
            selected,
            second_color_resolver as ColorAdjustmentResolver<BaseRenderState>
        ));
    }

    #[test]
    fn merge_render_options_takes_last_stated_color_adjustment_unsupported_guard() {
        let first = RenderStateOptions {
            color_adjustment_unsupported_guard: Some(Some(unsupported_guard)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            color_adjustment_unsupported_guard: Some(Some(second_unsupported_guard)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let selected = merge_render_options(&[&first, &second])
            .color_adjustment_unsupported_guard
            .flatten()
            .unwrap();
        assert!(std::ptr::fn_addr_eq(
            selected,
            second_unsupported_guard as ColorAdjustmentUnsupportedGuard<BaseRenderState>
        ));
    }

    #[test]
    fn merge_render_options_takes_last_stated_render_root_guard() {
        let first = RenderStateOptions {
            render_root_guard: Some(Some(root_guard)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            render_root_guard: Some(Some(second_root_guard)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let selected = merge_render_options(&[&first, &second])
            .render_root_guard
            .flatten()
            .unwrap();
        assert!(std::ptr::fn_addr_eq(
            selected,
            second_root_guard as RenderRootGuard<BaseRenderState>
        ));
    }

    #[test]
    fn merge_render_options_takes_last_stated_stroke_tessellator() {
        let first = RenderStateOptions {
            stroke_tessellator: Some(Some(stroke_tessellator)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let second = RenderStateOptions {
            stroke_tessellator: Some(Some(second_stroke_tessellator)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let selected = merge_render_options(&[&first, &second])
            .stroke_tessellator
            .flatten()
            .unwrap();
        assert!(std::ptr::fn_addr_eq(
            selected,
            second_stroke_tessellator as StrokeTessellator
        ));
    }

    #[test]
    fn merge_render_options_leaves_canvas_shape_commands_untouched_when_later_fragment_omits_it() {
        let first = RenderStateOptions {
            canvas_shape_commands: Some(kind_map(vec![(
                "A",
                std::sync::Arc::new(1_u32) as UnknownValue,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let later = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        assert!(
            merge_render_options(&[&first, &later])
                .canvas_shape_commands
                .unwrap()
                .entries
                .contains_key("A")
        );
    }

    #[test]
    fn merge_render_options_leaves_effect_padding_resolvers_untouched_when_later_fragment_omits_it()
    {
        let first = RenderStateOptions {
            effect_padding_resolvers: Some(kind_map(vec![(
                "A",
                effect_resolver as EffectPaddingResolver,
            )])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let later = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        assert!(
            merge_render_options(&[&first, &later])
                .effect_padding_resolvers
                .unwrap()
                .entries
                .contains_key("A")
        );
    }

    #[test]
    fn merge_render_options_leaves_node_renderers_untouched_when_later_fragment_omits_it() {
        let first = RenderStateOptions {
            node_renderers: Some(kind_map(vec![("A", &NOOP_RENDERER)])),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let later = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        assert!(
            merge_render_options(&[&first, &later])
                .node_renderers
                .unwrap()
                .entries
                .contains_key("A")
        );
    }

    #[test]
    fn merge_render_options_leaves_color_adjustments_untouched_when_later_fragment_omits_it() {
        let first = RenderStateOptions {
            color_adjustments: Some(Some(color_resolver)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let later = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        assert!(
            merge_render_options(&[&first, &later])
                .color_adjustments
                .flatten()
                .is_some()
        );
    }

    #[test]
    fn merge_render_options_leaves_color_adjustment_unsupported_guard_untouched_when_later_fragment_omits_it()
     {
        let first = RenderStateOptions {
            color_adjustment_unsupported_guard: Some(Some(unsupported_guard)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let later = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        assert!(
            merge_render_options(&[&first, &later])
                .color_adjustment_unsupported_guard
                .flatten()
                .is_some()
        );
    }

    #[test]
    fn merge_render_options_leaves_render_root_guard_untouched_when_later_fragment_omits_it() {
        let first = RenderStateOptions {
            render_root_guard: Some(Some(root_guard)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let later = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        assert!(
            merge_render_options(&[&first, &later])
                .render_root_guard
                .flatten()
                .is_some()
        );
    }

    #[test]
    fn merge_render_options_leaves_stroke_tessellator_untouched_when_later_fragment_omits_it() {
        let first = RenderStateOptions {
            stroke_tessellator: Some(Some(stroke_tessellator)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let later = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        assert!(
            merge_render_options(&[&first, &later])
                .stroke_tessellator
                .flatten()
                .is_some()
        );
    }

    #[test]
    fn merge_render_options_distinguishes_omitted_from_explicit_none() {
        let first = RenderStateOptions {
            color_adjustments: Some(Some(color_resolver)),
            render_root_guard: Some(Some(root_guard)),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let omitted = crate::support::test_default::<RenderStateOptions<BaseRenderState>>();
        let explicit = RenderStateOptions {
            color_adjustments: Some(None),
            render_root_guard: Some(None),
            ..crate::support::test_default::<RenderStateOptions<BaseRenderState>>()
        };
        let preserved = merge_render_options(&[&first, &omitted]);
        assert!(preserved.color_adjustments.unwrap().is_some());
        assert!(preserved.render_root_guard.unwrap().is_some());
        let cleared = merge_render_options(&[&first, &explicit]);
        assert_eq!(cleared.color_adjustments, Some(None));
        assert_eq!(cleared.render_root_guard, Some(None));
    }

    #[test]
    fn merge_render_options_returns_empty_for_no_fragments() {
        let fragments: [&RenderStateOptions<BaseRenderState>; 0] = [];
        let merged = merge_render_options(&fragments);
        assert!(merged.canvas_shape_commands.is_none());
        assert!(merged.clip_hooks.is_none());
        assert!(merged.color_adjustments.is_none());
        assert!(merged.node_renderers.is_none());
    }
}
