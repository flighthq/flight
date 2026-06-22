//! Backend-agnostic render cache helpers.
//!
//! A `RenderCache` is a lightweight handle. The backend allocates and stores its
//! own GPU render target keyed by this handle when the cache is first refreshed.
//!
//! A `RenderCacheAdapter` is a `RenderProxyAdapter` that substitutes the cache
//! handle for the source node during the render-walk update pass so the cached
//! result is composited instead of re-traversing the subtree.

use flighthq_geometry::multiply_matrix;
use flighthq_signals::emit_signal;
use flighthq_types::{
    KindId, Matrix, MatrixLike, RenderCache, RenderCacheAdapterSignals, RenderProxy2D,
    RenderProxyAdapter, RenderState, Renderer,
};

use crate::render_proxy_adapter::{get_render_proxy_adapter, set_render_proxy_adapter};
use crate::render_state::{RenderStateId, RenderStateStore, get_render_state_runtime_mut};
use crate::renderer::register_renderer;

use std::sync::Arc;

// ---------------------------------------------------------------------------
// RenderCacheAdapter
// ---------------------------------------------------------------------------

/// A `RenderProxyAdapter` that composites a cache handle instead of re-walking
/// the source subtree.
pub struct RenderCacheAdapter {
    /// The cache handle to composite, or `None` to render the source normally.
    pub cache: Option<RenderCache>,
    /// Optional signals. `None` until `enable_render_cache_adapter_signals` is called.
    pub signals: Option<RenderCacheAdapterSignals>,
}

impl RenderCacheAdapter {
    /// Creates a new adapter with an optional initial cache handle.
    pub fn new(cache: Option<RenderCache>) -> Self {
        Self {
            cache,
            signals: None,
        }
    }
}

impl RenderProxyAdapter for RenderCacheAdapter {
    fn adapt(
        &self,
        _state: &RenderState,
        _source_id: u64,
        node: &mut RenderProxy2D,
    ) -> Option<bool> {
        if let Some(signals) = &self.signals {
            emit_signal(&signals.on_prepare, &());
        }
        let attached = self.cache.as_ref()?;
        // Switch the render node to the cache renderer and fold in the cache's placement transform.
        // The cache renderer resolves this adapter's handle via get_render_proxy_cache.
        node.base.kind = *RENDER_CACHE_KIND;
        let current = matrix_to_like(&node.transform_2d);
        let cache_transform = matrix_to_like(&attached.transform);
        let mut result = MatrixLike::default();
        multiply_matrix(&mut result, &current, &cache_transform);
        copy_matrix_like_to_matrix(&mut node.transform_2d, &result);
        Some(false)
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}

// ---------------------------------------------------------------------------
// RenderCacheKind
// ---------------------------------------------------------------------------

/// The `KindId` used for render cache nodes in the renderer registry.
///
/// Backends register their cache renderer under this id.
pub static RENDER_CACHE_KIND: std::sync::LazyLock<KindId> = std::sync::LazyLock::new(KindId::new);

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a backend-agnostic cache handle with an identity transform.
pub fn create_render_cache() -> RenderCache {
    RenderCache {
        kind: *RENDER_CACHE_KIND,
        transform: Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        },
    }
}

/// Creates a `RenderCacheAdapter` with an optional initial cache handle.
pub fn create_render_cache_adapter(cache: Option<RenderCache>) -> RenderCacheAdapter {
    RenderCacheAdapter::new(cache)
}

/// Opts an adapter into the `on_prepare` signal, emitted each time the adapter
/// is consulted during the update pass — a hook for refreshing the cache lazily.
pub fn enable_render_cache_adapter_signals(adapter: &mut RenderCacheAdapter) {
    // Idempotent: allocate the signal group only once.
    if adapter.signals.is_none() {
        adapter.signals = Some(RenderCacheAdapterSignals::default());
    }
}

/// Resolves the cache handle a cache renderer should composite for a render
/// node by reading the adapter attached to `source_id`. Returns `None` if no
/// cache adapter is registered.
pub fn get_render_proxy_cache(
    store: &RenderStateStore,
    id: RenderStateId,
    source_id: u64,
) -> Option<&RenderCache> {
    let adapter = get_render_proxy_adapter(store, id, source_id)?;
    let cache_adapter = adapter.as_any().downcast_ref::<RenderCacheAdapter>()?;
    cache_adapter.cache.as_ref()
}

/// Returns `true` if `source` is a `RenderCache` (its kind matches
/// `RENDER_CACHE_KIND`).
pub fn is_render_cache(source: &RenderCache) -> bool {
    source.kind == *RENDER_CACHE_KIND
}

/// Returns `true` if `adapter` is a `RenderCacheAdapter`.
///
/// Implemented by downcasting the trait object.
pub fn is_render_cache_adapter(adapter: &dyn RenderProxyAdapter) -> bool {
    adapter.as_any().is::<RenderCacheAdapter>()
}

/// Registers `renderer` as the cache renderer for `RENDER_CACHE_KIND` on
/// state `id`.
pub fn register_render_cache_renderer(
    store: &mut RenderStateStore,
    id: RenderStateId,
    renderer: Arc<dyn Renderer>,
) {
    register_renderer(store, id, *RENDER_CACHE_KIND, renderer);
}

/// Attaches `cache` to `source_id` on state `id`. Subsequent renders
/// composite the cache instead of re-walking the subtree. Reuses an existing
/// `RenderCacheAdapter` on the source if present. Returns a reference to the
/// adapter.
pub fn use_render_cache(
    store: &mut RenderStateStore,
    id: RenderStateId,
    source_id: u64,
    cache: RenderCache,
) -> &mut RenderCacheAdapter {
    // Reuse an existing cache adapter on the source if present; otherwise install a fresh one.
    let is_cache_adapter = get_render_proxy_adapter(store, id, source_id)
        .map(is_render_cache_adapter)
        .unwrap_or(false);
    if !is_cache_adapter {
        set_render_proxy_adapter(
            store,
            id,
            source_id,
            Some(Box::new(create_render_cache_adapter(Some(cache.clone())))),
        );
    }
    let adapter = get_render_state_runtime_mut(store, id)
        .render_proxy_adapter_map
        .get_mut(&source_id)
        .expect("adapter just ensured")
        .as_any_mut()
        .downcast_mut::<RenderCacheAdapter>()
        .expect("adapter is a RenderCacheAdapter");
    adapter.cache = Some(cache);
    adapter
}

#[inline]
fn copy_matrix_like_to_matrix(out: &mut Matrix, source: &MatrixLike) {
    out.a = source.a;
    out.b = source.b;
    out.c = source.c;
    out.d = source.d;
    out.tx = source.tx;
    out.ty = source.ty;
}

#[inline]
fn matrix_to_like(m: &Matrix) -> MatrixLike {
    MatrixLike {
        a: m.a,
        b: m.b,
        c: m.c,
        d: m.d,
        tx: m.tx,
        ty: m.ty,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};

    use flighthq_signals::{SignalConnectOptions, connect_signal};

    use super::*;
    use crate::render_proxy_adapter::get_render_proxy_adapter;
    use crate::render_state::{RenderStateStore, create_render_state};

    // RenderCacheAdapter::adapt

    #[test]
    fn adapt_returns_none_when_no_cache_attached() {
        let adapter = create_render_cache_adapter(None);
        let state = RenderState::default();
        let mut data = RenderProxy2D::default();
        assert!(adapter.adapt(&state, 1, &mut data).is_none());
    }

    #[test]
    fn adapt_switches_kind_folds_transform_and_stops_traversal() {
        let mut cache = create_render_cache();
        cache.transform.tx = 7.0;
        let adapter = create_render_cache_adapter(Some(cache));
        let state = RenderState::default();
        let mut data = RenderProxy2D::default();
        let result = adapter.adapt(&state, 1, &mut data);
        assert_eq!(result, Some(false));
        assert_eq!(data.base.kind, *RENDER_CACHE_KIND);
        assert!((data.transform_2d.tx - 7.0).abs() < 1e-6);
    }

    #[test]
    fn adapt_emits_on_prepare_when_signals_enabled() {
        let mut adapter = create_render_cache_adapter(None);
        enable_render_cache_adapter_signals(&mut adapter);
        let count = Arc::new(AtomicU32::new(0));
        let count_clone = count.clone();
        let _guard = connect_signal(
            &adapter.signals.as_ref().unwrap().on_prepare,
            Arc::new(move |_: &()| {
                count_clone.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        let state = RenderState::default();
        let mut data = RenderProxy2D::default();
        adapter.adapt(&state, 1, &mut data);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    // create_render_cache

    #[test]
    fn create_render_cache_has_identity_transform() {
        let cache = create_render_cache();
        let m = cache.transform;
        assert!((m.a - 1.0).abs() < 1e-6);
        assert!(m.b.abs() < 1e-6);
        assert!(m.c.abs() < 1e-6);
        assert!((m.d - 1.0).abs() < 1e-6);
        assert!(m.tx.abs() < 1e-6);
        assert!(m.ty.abs() < 1e-6);
    }

    #[test]
    fn create_render_cache_kind_matches_cache_kind() {
        let cache = create_render_cache();
        assert_eq!(cache.kind, *RENDER_CACHE_KIND);
    }

    // create_render_cache_adapter

    #[test]
    fn create_render_cache_adapter_with_none_has_no_cache() {
        let adapter = create_render_cache_adapter(None);
        assert!(adapter.cache.is_none());
    }

    #[test]
    fn create_render_cache_adapter_with_cache_stores_it() {
        let cache = create_render_cache();
        let adapter = create_render_cache_adapter(Some(cache));
        assert!(adapter.cache.is_some());
    }

    // enable_render_cache_adapter_signals

    #[test]
    fn enable_render_cache_adapter_signals_allocates_and_is_idempotent() {
        let mut adapter = create_render_cache_adapter(None);
        assert!(adapter.signals.is_none());
        enable_render_cache_adapter_signals(&mut adapter);
        assert!(adapter.signals.is_some());
        // Idempotent: a second call leaves the signal group in place.
        enable_render_cache_adapter_signals(&mut adapter);
        assert!(adapter.signals.is_some());
    }

    // get_render_proxy_cache

    #[test]
    fn get_render_proxy_cache_returns_none_by_default() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        assert!(get_render_proxy_cache(&store, id, 99).is_none());
    }

    #[test]
    fn get_render_proxy_cache_returns_attached_cache() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let cache = create_render_cache();
        let cache_kind = cache.kind;
        use_render_cache(&mut store, id, 5, cache);
        let resolved = get_render_proxy_cache(&store, id, 5).expect("cache attached");
        assert_eq!(resolved.kind, cache_kind);
    }

    // is_render_cache

    #[test]
    fn is_render_cache_true_for_render_cache_kind() {
        let cache = create_render_cache();
        assert!(is_render_cache(&cache));
    }

    #[test]
    fn is_render_cache_false_for_other_kind() {
        let cache = RenderCache {
            kind: KindId::new(),
            transform: Matrix::default(),
        };
        assert!(!is_render_cache(&cache));
    }

    // is_render_cache_adapter

    #[test]
    fn is_render_cache_adapter_true_for_cache_adapter() {
        let adapter = create_render_cache_adapter(None);
        assert!(is_render_cache_adapter(&adapter));
    }

    #[test]
    fn is_render_cache_adapter_false_for_other_adapter() {
        struct Other;
        impl RenderProxyAdapter for Other {
            fn adapt(&self, _s: &RenderState, _id: u64, _n: &mut RenderProxy2D) -> Option<bool> {
                None
            }
            fn as_any(&self) -> &dyn std::any::Any {
                self
            }
            fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
                self
            }
        }
        assert!(!is_render_cache_adapter(&Other));
    }

    // register_render_cache_renderer

    #[test]
    fn register_render_cache_renderer_registers_for_cache_kind() {
        struct NoopRenderer;
        impl Renderer for NoopRenderer {
            fn create_data(
                &self,
                _s: &RenderState,
                _id: u64,
            ) -> Option<Box<dyn flighthq_types::RendererData>> {
                None
            }
            fn submit(&self, _s: &RenderState, _n: &flighthq_types::RenderProxy) {}
        }
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        register_render_cache_renderer(&mut store, id, Arc::new(NoopRenderer));
        let runtime = crate::render_state::get_render_state_runtime(&store, id);
        assert!(runtime.renderer_map.contains_key(&*RENDER_CACHE_KIND));
    }

    // use_render_cache

    #[test]
    fn use_render_cache_attaches_adapter() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let cache = create_render_cache();
        use_render_cache(&mut store, id, 3, cache);
        let adapter = get_render_proxy_adapter(&store, id, 3).expect("adapter attached");
        assert!(is_render_cache_adapter(adapter));
    }

    #[test]
    fn use_render_cache_reuses_existing_adapter_and_swaps_handle() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let first = create_render_cache();
        let first_kind = first.kind;
        use_render_cache(&mut store, id, 3, first);
        let mut second = create_render_cache();
        second.transform.tx = 42.0;
        use_render_cache(&mut store, id, 3, second);
        // The swapped-in handle's transform is now resolved through the same adapter.
        let resolved = get_render_proxy_cache(&store, id, 3).expect("cache attached");
        assert_eq!(resolved.kind, first_kind);
        assert!((resolved.transform.tx - 42.0).abs() < 1e-6);
    }

    #[test]
    fn use_render_cache_isolates_between_render_states() {
        let mut store = RenderStateStore::new();
        let id_a = create_render_state(&mut store, None);
        let id_b = create_render_state(&mut store, None);
        use_render_cache(&mut store, id_a, 3, create_render_cache());
        assert!(get_render_proxy_adapter(&store, id_b, 3).is_none());
    }
}
