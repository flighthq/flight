use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::UnknownValue;
use flight_node::{NodeRef, RendererDataRef};
use flight_path::{Path, PathMesh, StrokeStyle};
use flight_registry::KindMap;
use flight_render::*;

use crate::support::{NOOP_RENDERER, SECOND_RENDERER, display_node};

static CLIP_HOOKS: Scene2DClipHooks<BaseRenderState> = Scene2DClipHooks {
    finalize: finalize,
    pop_clip,
    push_clip,
};

fn color_resolver(
    _state: &mut BaseRenderState,
    _proxy: &mut RenderProxy<BaseRenderState>,
    _parent: Option<&RenderProxy<BaseRenderState>>,
) {
}

fn effect_resolver(_value: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 1.0,
        left: 1.0,
        right: 1.0,
        top: 1.0,
    };
}

fn finalize(_state: &mut BaseRenderState) {}

fn pop_clip(
    _state: &mut BaseRenderState,
    _proxy: &RenderProxy2D<BaseRenderState>,
    _node: &NodeRef,
) {
}

fn push_clip(
    _state: &mut BaseRenderState,
    _proxy: &RenderProxy2D<BaseRenderState>,
    _node: &NodeRef,
) {
}

fn render_root_guard(_state: &mut BaseRenderState, _node: &NodeRef) {}

fn stroke_tessellator(_path: &Path, _style: &StrokeStyle, _scale: Option<f32>) -> Option<PathMesh> {
    return None;
}

fn unsupported_guard(_state: &mut BaseRenderState, _node: &NodeRef) {}

#[allow(dead_code)]
fn _renderer_data_type_check(_value: Option<RendererDataRef>) {}

mod copy_all_renderers_from_render_state {
    use super::*;

    #[test]
    fn copy_all_renderers_copies_registrations_and_clip_hooks() {
        let mut source = create_render_state(None);
        let mut target = create_render_state(None);
        register_node_renderer(&mut source, "kind".to_string(), &NOOP_RENDERER);
        source.registries.clip_hooks = Some(&CLIP_HOOKS);
        copy_all_renderers_from_render_state(&mut target, &source);
        assert!(std::ptr::eq(
            *target
                .registries
                .node_renderers
                .entries
                .get("kind")
                .unwrap(),
            &NOOP_RENDERER
        ));
        assert!(std::ptr::eq(
            target.registries.clip_hooks.unwrap(),
            &CLIP_HOOKS
        ));
    }

    #[test]
    fn copy_all_renderers_is_noop_for_empty_source() {
        let source = create_render_state(None);
        let mut target = create_render_state(None);
        copy_all_renderers_from_render_state(&mut target, &source);
        assert!(target.registries.node_renderers.entries.is_empty());
        assert!(target.registries.clip_hooks.is_none());
    }
}

mod copy_render_state_registrations {
    use super::*;

    #[test]
    fn copy_render_state_registrations_shares_policy_snapshots() {
        let mut source = create_render_state(None);
        let mut target = create_render_state(None);
        source.registries.color_adjustments = Some(color_resolver);
        source.registries.color_adjustment_unsupported_guard = Some(unsupported_guard);
        source.registries.effect_padding_resolvers = Some(Arc::new(KindMap {
            entries: HashMap::from([(
                "acme.Effect".to_string(),
                effect_resolver as EffectPaddingResolver,
            )]),
            key_order: vec!["acme.Effect".to_string()],
        }));
        source.registries.render_root_guard = Some(render_root_guard);
        source.registries.stroke_tessellator = Some(stroke_tessellator);
        copy_render_state_registrations(&mut target, &source);
        assert!(Arc::ptr_eq(
            target.registries.effect_padding_resolvers.as_ref().unwrap(),
            source.registries.effect_padding_resolvers.as_ref().unwrap()
        ));
        assert_eq!(
            target.registries.color_adjustments.unwrap() as usize,
            color_resolver as *const () as usize
        );
        assert_eq!(
            target
                .registries
                .color_adjustment_unsupported_guard
                .unwrap() as usize,
            unsupported_guard as *const () as usize
        );
        assert_eq!(
            target.registries.render_root_guard.unwrap() as usize,
            render_root_guard as *const () as usize
        );
        assert_eq!(
            target.registries.stroke_tessellator.unwrap() as usize,
            stroke_tessellator as *const () as usize
        );
    }

    #[test]
    fn copy_render_state_registrations_shares_shape_command_snapshot() {
        let mut source = create_render_state(None);
        let mut target = create_render_state(None);
        source.registries.canvas_shape_commands = Some(Arc::new(KindMap {
            entries: HashMap::from([("beginFill".to_string(), Arc::new(42_u32) as UnknownValue)]),
            key_order: vec!["beginFill".to_string()],
        }));
        copy_render_state_registrations(&mut target, &source);
        assert!(Arc::ptr_eq(
            target.registries.canvas_shape_commands.as_ref().unwrap(),
            source.registries.canvas_shape_commands.as_ref().unwrap()
        ));
        assert!(
            target
                .registries
                .canvas_shape_commands
                .as_ref()
                .unwrap()
                .entries
                .contains_key("beginFill")
        );
    }

    #[test]
    fn copy_render_state_registrations_leaves_absent_shape_commands_absent() {
        let source = create_render_state(None);
        let mut target = create_render_state(None);
        copy_render_state_registrations(&mut target, &source);
        assert!(target.registries.canvas_shape_commands.is_none());
    }
}

mod copy_renderers_from_render_state {
    use super::*;

    #[test]
    fn copy_renderers_copies_all_registrations() {
        let mut source = create_render_state(None);
        let mut target = create_render_state(None);
        register_node_renderer(&mut source, "kind".to_string(), &NOOP_RENDERER);
        copy_renderers_from_render_state(&mut target, &source);
        assert!(Arc::ptr_eq(
            &target.registries.node_renderers,
            &source.registries.node_renderers
        ));
    }

    #[test]
    fn copy_renderers_is_noop_for_empty_source() {
        let source = create_render_state(None);
        let mut target = create_render_state(None);
        copy_renderers_from_render_state(&mut target, &source);
        assert!(target.registries.node_renderers.entries.is_empty());
    }

    #[test]
    fn copy_renderers_does_not_change_source_map_id() {
        let mut source = create_render_state(None);
        let mut target = create_render_state(None);
        register_node_renderer(&mut source, "kind".to_string(), &NOOP_RENDERER);
        let source_id = source.runtime.renderer_map_id;
        copy_renderers_from_render_state(&mut target, &source);
        assert_eq!(source.runtime.renderer_map_id, source_id);
    }

    #[test]
    fn copy_renderers_preserves_target_only_and_source_wins_collision() {
        let mut source = create_render_state(None);
        let mut target = create_render_state(None);
        register_node_renderer(&mut source, "shared".to_string(), &NOOP_RENDERER);
        register_node_renderer(&mut target, "shared".to_string(), &SECOND_RENDERER);
        register_node_renderer(&mut target, "target-only".to_string(), &SECOND_RENDERER);
        copy_renderers_from_render_state(&mut target, &source);
        assert!(std::ptr::eq(
            *target
                .registries
                .node_renderers
                .entries
                .get("shared")
                .unwrap(),
            &NOOP_RENDERER
        ));
        assert!(
            target
                .registries
                .node_renderers
                .entries
                .contains_key("target-only")
        );
    }

    #[test]
    fn copy_renderers_shares_then_diverges_cow_snapshot() {
        let mut source = create_render_state(None);
        let mut target = create_render_state(None);
        register_node_renderer(&mut source, "shared".to_string(), &NOOP_RENDERER);
        copy_renderers_from_render_state(&mut target, &source);
        let snapshot = target.registries.node_renderers.clone();
        assert!(Arc::ptr_eq(&snapshot, &source.registries.node_renderers));
        register_node_renderer(&mut source, "late".to_string(), &SECOND_RENDERER);
        assert!(Arc::ptr_eq(&snapshot, &target.registries.node_renderers));
        assert!(!Arc::ptr_eq(&snapshot, &source.registries.node_renderers));
        assert!(!snapshot.entries.contains_key("late"));
    }
}

mod noop_renderer_data {
    use super::*;

    #[test]
    fn noop_renderer_data_returns_none() {
        let mut state = create_render_state(None);
        assert!(noop_renderer_data(&mut state, &display_node()).is_none());
    }
}

mod register_node_renderer {
    use super::*;

    #[test]
    fn register_node_renderer_registers_and_increments_id() {
        let mut state = create_render_state(None);
        let before = state.registries.node_renderers.clone();
        register_node_renderer(&mut state, "kindA".to_string(), &NOOP_RENDERER);
        assert!(!Arc::ptr_eq(&before, &state.registries.node_renderers));
        assert!(
            state
                .registries
                .node_renderers
                .entries
                .contains_key("kindA")
        );
        assert_eq!(state.runtime.renderer_map_id, 1);
    }

    #[test]
    fn register_node_renderer_increments_for_each_new_renderer() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "kindA".to_string(), &NOOP_RENDERER);
        let first_id = state.runtime.renderer_map_id;
        register_node_renderer(&mut state, "kindB".to_string(), &SECOND_RENDERER);
        assert_eq!(state.runtime.renderer_map_id, first_id + 1);
    }

    #[test]
    fn register_node_renderer_same_identity_is_actual_fast_path() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "kindA".to_string(), &NOOP_RENDERER);
        let id = state.runtime.renderer_map_id;
        let snapshot = state.registries.node_renderers.clone();
        register_node_renderer(&mut state, "kindA".to_string(), &NOOP_RENDERER);
        assert_eq!(state.runtime.renderer_map_id, id);
        assert!(Arc::ptr_eq(&snapshot, &state.registries.node_renderers));
    }

    #[test]
    fn register_node_renderer_replacement_increments_id() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "kindA".to_string(), &NOOP_RENDERER);
        let id = state.runtime.renderer_map_id;
        register_node_renderer(&mut state, "kindA".to_string(), &SECOND_RENDERER);
        assert_eq!(state.runtime.renderer_map_id, id + 1);
        assert!(std::ptr::eq(
            *state
                .registries
                .node_renderers
                .entries
                .get("kindA")
                .unwrap(),
            &SECOND_RENDERER
        ));
    }

    #[test]
    fn register_node_renderer_wraps_map_id() {
        let mut state = create_render_state(None);
        state.runtime.renderer_map_id = u32::MAX;
        register_node_renderer(&mut state, "kindA".to_string(), &NOOP_RENDERER);
        assert_eq!(state.runtime.renderer_map_id, 0);
    }
}

mod register_node_renderers {
    use super::*;

    #[test]
    fn register_node_renderers_registers_every_pair() {
        let mut state = create_render_state(None);
        register_node_renderers(
            &mut state,
            &[
                ("A".to_string(), &NOOP_RENDERER),
                ("B".to_string(), &SECOND_RENDERER),
            ],
        );
        assert!(state.registries.node_renderers.entries.contains_key("A"));
        assert!(state.registries.node_renderers.entries.contains_key("B"));
    }

    #[test]
    fn register_node_renderers_empty_set_is_noop() {
        let mut state = create_render_state(None);
        let entries: [(String, &'static NodeRenderer<BaseRenderState>); 0] = [];
        register_node_renderers(&mut state, &entries);
        assert_eq!(state.runtime.renderer_map_id, 0);
    }
}
