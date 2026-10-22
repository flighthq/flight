use std::collections::HashMap;
use std::sync::Arc;

use flight_node::NodeRef;
use flight_registry::KindMap;
use flight_render::*;

fn unsupported_guard(_state: &mut BaseRenderState, _source: &NodeRef) {}

mod create_render_state {
    use super::*;

    #[test]
    fn create_render_state_initializes_default_values() {
        let state = create_render_state(None);
        assert!(state.render.allow_smoothing);
        assert_eq!(state.render.current_clip_depth, 0);
        assert_eq!(state.render.pixel_ratio, 1.0);
        assert_eq!(state.render.render_alpha, 1.0);
        assert_eq!(
            state.render.render_blend_mode,
            Some(flight_materials::BLEND_MODE_NORMAL.to_string())
        );
        assert!(!state.render.round_pixels);
    }

    #[test]
    fn create_render_state_attaches_runtime_machinery() {
        let state = create_render_state(None);
        let runtime = get_render_state_runtime(&state);
        assert_eq!(runtime.current_frame_id, 0);
        assert!(runtime.render_proxy_adapter_map.is_empty());
        assert!(state.registries.node_renderers.entries.is_empty());
        assert!(state.registries.stroke_tessellator.is_none());
        assert_eq!(runtime.renderer_map_id, 0);
    }

    #[test]
    fn create_render_state_allows_predefined_values() {
        let state = create_render_state(Some(&RenderStateInit {
            allow_smoothing: Some(false),
            pixel_ratio: Some(5.0),
            render_alpha: Some(0.5),
            render_blend_mode: Some(Some(flight_materials::BLEND_MODE_MULTIPLY.to_string())),
            round_pixels: Some(true),
            ..crate::support::test_default::<RenderStateInit>()
        }));
        assert!(!state.render.allow_smoothing);
        assert_eq!(state.render.pixel_ratio, 5.0);
        assert_eq!(state.render.render_alpha, 0.5);
        assert_eq!(
            state.render.render_blend_mode,
            Some(flight_materials::BLEND_MODE_MULTIPLY.to_string())
        );
        assert!(state.render.round_pixels);
    }

    #[test]
    fn create_render_state_returns_new_state() {
        let first = create_render_state(None);
        let second = create_render_state(None);
        assert!(!Arc::ptr_eq(
            &first.registries.node_renderers,
            &second.registries.node_renderers
        ));
    }
}

mod create_render_state_runtime {
    use super::*;

    #[test]
    fn create_render_state_runtime_initializes_machinery() {
        let runtime: RenderStateRuntime<BaseRenderState> = create_render_state_runtime();
        assert_eq!(runtime.current_frame_id, 0);
        assert!(runtime.render_proxy_adapter_map.is_empty());
        assert!(runtime.registry_signals.is_none());
        assert_eq!(runtime.renderer_map_id, 0);
        assert!(runtime.prepared_scene3d.is_none());
    }

    #[test]
    fn create_render_state_runtime_returns_distinct_runtimes() {
        let first: RenderStateRuntime<BaseRenderState> = create_render_state_runtime();
        let second: RenderStateRuntime<BaseRenderState> = create_render_state_runtime();
        assert!(!Arc::ptr_eq(
            &first.registry_misses,
            &second.registry_misses
        ));
    }
}

mod destroy_render_state {
    use super::*;

    #[test]
    fn destroy_render_state_clears_traversal_and_registration_storage() {
        let mut state = create_render_state(None);
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        state.registries.effect_padding_resolvers = Some(Arc::new(KindMap {
            entries: HashMap::new(),
            key_order: Vec::new(),
        }));
        let node: NodeRef = flight_scene2d::create_display_object(None);
        proxies.temp_stack.push(node);
        destroy_render_state(&mut state, &mut proxies);
        assert!(proxies.temp_stack.is_empty());
        assert!(state.registries.effect_padding_resolvers.is_none());
    }
}

mod get_color_adjustment_unsupported_guard {
    use super::*;

    #[test]
    fn color_adjustment_unsupported_guard_resolves_only_bound_entry() {
        let mut state = create_render_state(None);
        assert!(get_color_adjustment_unsupported_guard(&state).is_none());
        state.registries.color_adjustment_unsupported_guard = Some(unsupported_guard);
        assert!(get_color_adjustment_unsupported_guard(&state).is_some());
        state.registries.color_adjustment_unsupported_guard = None;
        assert!(get_color_adjustment_unsupported_guard(&state).is_none());
    }
}

mod get_render_state_runtime {
    use super::*;

    #[test]
    fn get_render_state_runtime_returns_attached_runtime() {
        let state = create_render_state(None);
        assert_eq!(get_render_state_runtime(&state).current_frame_id, 0);
    }
}

mod get_render_state_runtime_mut {
    use super::*;

    #[test]
    fn get_render_state_runtime_mut_returns_attached_runtime() {
        let mut state = create_render_state(None);
        get_render_state_runtime_mut(&mut state).current_frame_id = 12;
        assert_eq!(state.runtime.current_frame_id, 12);
    }
}

mod initialize_render_state {
    use super::*;

    #[test]
    fn initialize_render_state_is_create_render_state_initializer() {
        let mut state = create_render_state(None);
        initialize_render_state(
            &mut state,
            Some(&RenderStateInit {
                pixel_ratio: Some(2.0),
                ..crate::support::test_default::<RenderStateInit>()
            }),
        );
        assert_eq!(state.render.pixel_ratio, 2.0);
    }
}
