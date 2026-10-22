use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};
use flight_geometry::{create_matrix, multiply_matrix};
use flight_node::NodeRef;
use flight_signals::{create_signal, emit_signal};

use crate::{
    NodeRenderer, RENDER_CACHE_KIND, RenderCache, RenderCacheAdapterSignals, RenderProxy2D,
    RenderProxyAdapter, RenderState, get_render_proxy_adapter, register_node_renderer,
    set_render_proxy_adapter,
};

pub use crate::RENDER_CACHE_KIND as RenderCacheKind;

pub fn create_render_cache() -> RenderCache {
    let mut out: RenderCache = allocate_entity();
    initialize_render_cache(&mut out);
    return out;
}

pub fn create_render_cache_adapter<S: RenderState>(
    cache: Option<Ref<RenderCache>>,
) -> Ref<RenderProxyAdapter<S>> {
    let mut adapter = RenderProxyAdapter {
        runtime: EntityRuntimeSlot::default(),
        adapt: adapt_render_cache::<S>,
        cache: None,
        signals: None,
        is_cache_adapter: false,
    };
    initialize_render_cache_adapter(&mut adapter, cache);
    return Arc::new(RwLock::new(adapter));
}

pub fn initialize_render_cache(out: &mut RenderCache) {
    out.kind = RENDER_CACHE_KIND.to_string();
    out.transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

pub fn initialize_render_cache_adapter<S: RenderState>(
    adapter: &mut RenderProxyAdapter<S>,
    cache: Option<Ref<RenderCache>>,
) {
    adapter.cache = cache;
    adapter.signals = None;
    adapter.adapt = adapt_render_cache::<S>;
    adapter.is_cache_adapter = true;
}

fn adapt_render_cache<S: RenderState>(
    adapter: &mut RenderProxyAdapter<S>,
    _state: &mut S,
    _source: &NodeRef,
    node: &mut RenderProxy2D<S>,
) -> Option<bool> {
    if let Some(signals) = &adapter.signals {
        emit_signal(&signals.on_prepare, &());
    }
    let cache = adapter.cache.as_ref()?.read().unwrap();
    node.kind = RENDER_CACHE_KIND.to_string();
    let current = node.transform_2d.clone();
    multiply_matrix(&mut node.transform_2d, &current, &cache.transform);
    return Some(false);
}

pub fn enable_render_cache_adapter_signals<S: RenderState>(adapter: &Ref<RenderProxyAdapter<S>>) {
    let mut adapter = adapter.write().unwrap();
    if adapter.signals.is_none() {
        adapter.signals = Some(RenderCacheAdapterSignals {
            on_prepare: create_signal(),
        });
    }
}

pub fn get_render_proxy_cache<S: RenderState>(
    state: &S,
    source: &NodeRef,
) -> Option<Ref<RenderCache>> {
    let adapter = get_render_proxy_adapter(state, source)?;
    let adapter = adapter.read().unwrap();
    if !is_render_cache_adapter(&adapter) {
        return None;
    }
    return adapter.cache.clone();
}

pub fn is_render_cache(source: &RenderCache) -> bool {
    return source.kind == RENDER_CACHE_KIND;
}

pub fn is_render_cache_adapter<S: RenderState>(value: &RenderProxyAdapter<S>) -> bool {
    return value.is_cache_adapter;
}

pub fn register_render_cache_node_renderer<S: RenderState>(
    state: &mut S,
    renderer: &'static NodeRenderer<S>,
) {
    register_node_renderer(state, RENDER_CACHE_KIND.to_string(), renderer);
}

pub fn use_render_cache<S: RenderState>(
    state: &mut S,
    source: &NodeRef,
    cache: Ref<RenderCache>,
) -> Ref<RenderProxyAdapter<S>> {
    if let Some(existing) = get_render_proxy_adapter(state, source)
        && existing.read().unwrap().is_cache_adapter
    {
        existing.write().unwrap().cache = Some(cache);
        return existing;
    }
    let adapter = create_render_cache_adapter(Some(cache));
    set_render_proxy_adapter(state, source, Some(adapter.clone()));
    return adapter;
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
