use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::get_entity_id;
use flight_render::*;
use flight_signals::connect_signal;

use crate::support::{NOOP_RENDERER, display_node};

fn adapt(
    adapter: &flight_entity::Ref<RenderProxyAdapter<BaseRenderState>>,
    state: &mut BaseRenderState,
    source: &flight_node::NodeRef,
    data: &mut RenderProxy2D<BaseRenderState>,
) -> Option<bool> {
    let mut adapter = adapter.write().unwrap();
    let callback = adapter.adapt;
    return callback(&mut adapter, state, source, data);
}

mod create_render_cache {
    use super::*;

    #[test]
    fn cache_has_render_cache_kind_and_transform() {
        let cache = create_render_cache();
        assert_eq!(cache.kind, RENDER_CACHE_KIND);
        assert_eq!(
            cache.transform,
            flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
    }
}

mod create_render_cache_adapter {
    use super::*;

    #[test]
    fn cache_adapter_is_an_entity_with_runtime_state() {
        let adapter = create_render_cache_adapter::<BaseRenderState>(None);
        assert_ne!(get_entity_id(&*adapter.read().unwrap()), 0);
    }

    #[test]
    fn each_cache_adapter_has_its_own_runtime_slot() {
        let first = create_render_cache_adapter::<BaseRenderState>(None);
        let second = create_render_cache_adapter::<BaseRenderState>(None);
        assert_ne!(
            get_entity_id(&*first.read().unwrap()),
            get_entity_id(&*second.read().unwrap())
        );
    }

    #[test]
    fn cache_adapter_starts_detached_or_adopts_supplied_cache() {
        let detached = create_render_cache_adapter::<BaseRenderState>(None);
        assert!(detached.read().unwrap().cache.is_none());
        assert!(detached.read().unwrap().signals.is_none());
        let cache = Arc::new(RwLock::new(create_render_cache()));
        let attached = create_render_cache_adapter::<BaseRenderState>(Some(cache.clone()));
        assert!(Arc::ptr_eq(
            attached.read().unwrap().cache.as_ref().unwrap(),
            &cache
        ));
    }

    #[test]
    fn cache_adapter_renders_normally_without_attached_cache() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        let adapter = create_render_cache_adapter(None);
        assert_eq!(adapt(&adapter, &mut state, &source, &mut data), None);
    }

    #[test]
    fn cache_adapter_switches_kind_transform_and_stops_traversal() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        let cache = Arc::new(RwLock::new(create_render_cache()));
        cache.write().unwrap().transform.tx = 7.0;
        let adapter = create_render_cache_adapter(Some(cache));
        assert_eq!(adapt(&adapter, &mut state, &source, &mut data), Some(false));
        assert_eq!(data.kind, RENDER_CACHE_KIND);
        assert!(Arc::ptr_eq(&data.source, &source));
        assert_eq!(data.transform_2d.tx, 7.0);
    }

    #[test]
    fn cache_adapter_emits_prepare_when_signals_enabled() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        let adapter = create_render_cache_adapter(None);
        enable_render_cache_adapter_signals(&adapter);
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        connect_signal(
            &adapter.read().unwrap().signals.as_ref().unwrap().on_prepare,
            Arc::new(move |_: &()| {
                observed.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        assert_eq!(adapt(&adapter, &mut state, &source, &mut data), None);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}

mod enable_render_cache_adapter_signals {
    use super::*;

    #[test]
    fn enabling_cache_adapter_signals_allocates_signal_group() {
        let adapter = create_render_cache_adapter::<BaseRenderState>(None);
        assert!(adapter.read().unwrap().signals.is_none());
        enable_render_cache_adapter_signals(&adapter);
        assert!(adapter.read().unwrap().signals.is_some());
    }

    #[test]
    fn enabling_cache_adapter_signals_is_idempotent() {
        let adapter = create_render_cache_adapter::<BaseRenderState>(None);
        enable_render_cache_adapter_signals(&adapter);
        let first = adapter
            .read()
            .unwrap()
            .signals
            .as_ref()
            .unwrap()
            .on_prepare
            .clone();
        enable_render_cache_adapter_signals(&adapter);
        let second = adapter
            .read()
            .unwrap()
            .signals
            .as_ref()
            .unwrap()
            .on_prepare
            .clone();
        assert!(Arc::ptr_eq(&first.data, &second.data));
    }
}

mod get_render_proxy_cache {
    use super::*;

    #[test]
    fn proxy_cache_lookup_returns_attached_cache_or_none() {
        let mut state = create_render_state();
        let source = display_node();
        assert!(get_render_proxy_cache(&state, &source).is_none());
        let cache = Arc::new(RwLock::new(create_render_cache()));
        use_render_cache(&mut state, &source, cache.clone());
        assert!(Arc::ptr_eq(
            &get_render_proxy_cache(&state, &source).unwrap(),
            &cache
        ));
    }
}

mod initialize_render_cache {
    use super::*;

    #[test]
    fn cache_initializer_sets_construction_defaults() {
        let mut cache = create_render_cache();
        cache.kind = "other".to_string();
        cache.transform.tx = 8.0;
        initialize_render_cache(&mut cache);
        assert_eq!(cache.kind, RENDER_CACHE_KIND);
        assert_eq!(cache.transform.tx, 0.0);
    }
}

mod initialize_render_cache_adapter {
    use super::*;

    #[test]
    fn cache_adapter_initializer_sets_construction_defaults() {
        let adapter = create_render_cache_adapter::<BaseRenderState>(None);
        enable_render_cache_adapter_signals(&adapter);
        let cache = Arc::new(RwLock::new(create_render_cache()));
        initialize_render_cache_adapter(&mut adapter.write().unwrap(), Some(cache.clone()));
        let adapter = adapter.read().unwrap();
        assert!(adapter.signals.is_none());
        assert!(adapter.is_cache_adapter);
        assert!(Arc::ptr_eq(adapter.cache.as_ref().unwrap(), &cache));
    }
}

mod is_render_cache {
    use super::*;

    #[test]
    fn cache_kind_predicate_recognizes_cache_handle() {
        assert!(is_render_cache(&create_render_cache()));
    }

    #[test]
    fn cache_kind_predicate_rejects_other_kind() {
        let mut cache = create_render_cache();
        cache.kind = "other".to_string();
        assert!(!is_render_cache(&cache));
    }
}

mod is_render_cache_adapter {
    use super::*;

    #[test]
    fn cache_adapter_predicate_recognizes_cache_adapter() {
        let adapter = create_render_cache_adapter::<BaseRenderState>(None);
        assert!(is_render_cache_adapter(&adapter.read().unwrap()));
    }

    #[test]
    fn cache_adapter_predicate_rejects_non_cache_adapter() {
        let adapter = create_render_cache_adapter::<BaseRenderState>(None);
        adapter.write().unwrap().is_cache_adapter = false;
        assert!(!is_render_cache_adapter(&adapter.read().unwrap()));
    }
}

mod register_render_cache_node_renderer {
    use super::*;

    #[test]
    fn registering_cache_renderer_uses_cache_kind() {
        let mut state = create_render_state();
        register_render_cache_node_renderer(&mut state, &NOOP_RENDERER);
        assert!(std::ptr::eq(
            *state
                .registries
                .node_renderers
                .entries
                .get(RENDER_CACHE_KIND)
                .unwrap(),
            &NOOP_RENDERER
        ));
    }
}

mod use_render_cache {
    use super::*;

    #[test]
    fn use_cache_attaches_adapter_and_cache() {
        let mut state = create_render_state();
        let source = display_node();
        let cache = Arc::new(RwLock::new(create_render_cache()));
        let adapter = use_render_cache(&mut state, &source, cache.clone());
        assert!(Arc::ptr_eq(
            &get_render_proxy_adapter(&state, &source).unwrap(),
            &adapter
        ));
        assert!(Arc::ptr_eq(
            adapter.read().unwrap().cache.as_ref().unwrap(),
            &cache
        ));
    }

    #[test]
    fn use_cache_reuses_adapter_and_swaps_handle() {
        let mut state = create_render_state();
        let source = display_node();
        let first = use_render_cache(
            &mut state,
            &source,
            Arc::new(RwLock::new(create_render_cache())),
        );
        let second_cache = Arc::new(RwLock::new(create_render_cache()));
        let second = use_render_cache(&mut state, &source, second_cache.clone());
        assert!(Arc::ptr_eq(&first, &second));
        assert!(Arc::ptr_eq(
            second.read().unwrap().cache.as_ref().unwrap(),
            &second_cache
        ));
    }

    #[test]
    fn use_cache_isolates_attachment_between_states() {
        let mut a = create_render_state();
        let b = create_render_state();
        let source = display_node();
        use_render_cache(
            &mut a,
            &source,
            Arc::new(RwLock::new(create_render_cache())),
        );
        assert!(get_render_proxy_adapter(&b, &source).is_none());
    }
}
