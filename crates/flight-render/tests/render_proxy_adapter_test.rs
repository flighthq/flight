use std::sync::Arc;

use flight_entity::Ref;
use flight_node::NodeRef;
use flight_render::*;

use crate::support::{NOOP_RENDERER, display_node};

fn adapt_false(
    _adapter: &mut RenderProxyAdapter<BaseRenderState>,
    _state: &mut BaseRenderState,
    _source: &NodeRef,
    _data: &mut RenderProxy2D<BaseRenderState>,
) -> Option<bool> {
    return Some(false);
}

fn adapt_kind(
    _adapter: &mut RenderProxyAdapter<BaseRenderState>,
    _state: &mut BaseRenderState,
    _source: &NodeRef,
    data: &mut RenderProxy2D<BaseRenderState>,
) -> Option<bool> {
    data.kind = "Adapted".to_string();
    return Some(true);
}

fn custom_adapter(
    adapt: fn(
        &mut RenderProxyAdapter<BaseRenderState>,
        &mut BaseRenderState,
        &NodeRef,
        &mut RenderProxy2D<BaseRenderState>,
    ) -> Option<bool>,
) -> Ref<RenderProxyAdapter<BaseRenderState>> {
    let adapter = create_render_cache_adapter(None);
    adapter.write().unwrap().adapt = adapt;
    return adapter;
}

mod apply_render_proxy_adapter {
    use super::*;

    #[test]
    fn apply_adapter_accepts_the_canonical_render_proxy_2d_type() {
        let typed: fn(&mut BaseRenderState, &NodeRef, &mut RenderProxy2D<BaseRenderState>) =
            apply_render_proxy_adapter;
        let _ = typed;
    }

    #[test]
    fn applying_without_adapter_enables_child_traversal() {
        let mut state = create_render_state(None);
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        data.traverse_children = false;
        apply_render_proxy_adapter(&mut state, &source, &mut data);
        assert!(data.traverse_children);
    }

    #[test]
    fn adapter_non_null_result_sets_child_traversal() {
        let mut state = create_render_state(None);
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        set_render_proxy_adapter(&mut state, &source, Some(custom_adapter(adapt_false)));
        apply_render_proxy_adapter(&mut state, &source, &mut data);
        assert!(!data.traverse_children);
    }

    #[test]
    fn adapter_kind_change_synchronizes_renderer() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "Adapted".to_string(), &NOOP_RENDERER);
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        set_render_proxy_adapter(&mut state, &source, Some(custom_adapter(adapt_kind)));
        apply_render_proxy_adapter(&mut state, &source, &mut data);
        assert!(std::ptr::eq(data.renderer.unwrap(), &NOOP_RENDERER));
    }
}

mod get_render_proxy_adapter {
    use super::*;

    #[test]
    fn adapter_lookup_is_none_until_set() {
        let state = create_render_state(None);
        let source = display_node();
        assert!(get_render_proxy_adapter(&state, &source).is_none());
    }

    #[test]
    fn adapter_lookup_returns_same_adapter_after_set() {
        let mut state = create_render_state(None);
        let source = display_node();
        let adapter = custom_adapter(adapt_false);
        set_render_proxy_adapter(&mut state, &source, Some(adapter.clone()));
        assert!(Arc::ptr_eq(
            &get_render_proxy_adapter(&state, &source).unwrap(),
            &adapter
        ));
    }
}

mod set_render_proxy_adapter {
    use super::*;

    #[test]
    fn setting_adapter_attaches_it_to_source() {
        let mut state = create_render_state(None);
        let source = display_node();
        let adapter = custom_adapter(adapt_false);
        set_render_proxy_adapter(&mut state, &source, Some(adapter.clone()));
        assert!(Arc::ptr_eq(
            &get_render_proxy_adapter(&state, &source).unwrap(),
            &adapter
        ));
    }

    #[test]
    fn adapters_are_isolated_between_render_states() {
        let mut a = create_render_state(None);
        let b = create_render_state(None);
        let source = display_node();
        let adapter = custom_adapter(adapt_false);
        set_render_proxy_adapter(&mut a, &source, Some(adapter.clone()));
        assert!(Arc::ptr_eq(
            &get_render_proxy_adapter(&a, &source).unwrap(),
            &adapter
        ));
        assert!(get_render_proxy_adapter(&b, &source).is_none());
    }

    #[test]
    fn passing_none_removes_adapter() {
        let mut state = create_render_state(None);
        let source = display_node();
        set_render_proxy_adapter(&mut state, &source, Some(custom_adapter(adapt_false)));
        set_render_proxy_adapter(&mut state, &source, None);
        assert!(get_render_proxy_adapter(&state, &source).is_none());
    }
}
