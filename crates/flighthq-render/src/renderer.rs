//! Renderer registration — binds `Renderer` implementations to `KindId`s on a
//! `RenderState`.
//!
//! Mask renderers were retired (a mask is now a path `ClipRegion` realized by
//! the backend clip hooks), so only the kind→renderer map and the clip hooks
//! are managed here.

use std::sync::Arc;

use flighthq_types::{KindId, RenderState, Renderer};

use crate::render_state::{RenderStateId, RenderStateStore, get_render_state_runtime_mut};

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Copies all registered renderers *and* the display-object clip hooks from
/// `source` into `target`, replacing any existing registrations.
pub fn copy_all_renderers_from_render_state(
    store: &mut RenderStateStore,
    target: RenderStateId,
    source: RenderStateId,
) {
    // The TS source additionally copies the display-object clip hooks, but the Rust
    // `RenderState` does not yet carry a clip-hooks field, so only the renderer registry
    // is copied. With no extra state to forward, this is currently identical to
    // copy_renderers_from_render_state.
    copy_renderers_from_render_state(store, target, source);
}

/// Copies the kind→renderer registrations from `source` into `target`.
/// Does **not** copy clip hooks.
pub fn copy_renderers_from_render_state(
    store: &mut RenderStateStore,
    target: RenderStateId,
    source: RenderStateId,
) {
    // Snapshot the source registrations first (cloning Arc handles) so the subsequent
    // mutable borrow of `target` does not conflict with the shared borrow of `source`.
    let entries: Vec<(KindId, Arc<dyn Renderer>)> = get_render_state_runtime_mut(store, source)
        .renderer_map
        .iter()
        .map(|(kind, renderer)| (*kind, renderer.clone()))
        .collect();
    for (kind, renderer) in entries {
        register_renderer(store, target, kind, renderer);
    }
}

/// A no-op `create_data` implementation for renderers that need no per-node
/// data. Returns `None`.
pub fn noop_renderer_data(
    _state: &RenderState,
    _source_id: u64,
) -> Option<Box<dyn flighthq_types::RendererData>> {
    None
}

/// Registers `renderer` for `kind` on the state identified by `id`.
///
/// If the same renderer object is already registered for the same kind, the
/// call is a no-op (the `renderer_map_id` is not bumped). Otherwise,
/// `renderer_map_id` advances so that proxies know to re-query their renderer.
pub fn register_renderer(
    store: &mut RenderStateStore,
    id: RenderStateId,
    kind: KindId,
    renderer: Arc<dyn Renderer>,
) {
    let runtime = get_render_state_runtime_mut(store, id);
    if let Some(existing) = runtime.renderer_map.get(&kind) {
        if Arc::ptr_eq(existing, &renderer) {
            return;
        }
    }
    runtime.renderer_map_id = runtime.renderer_map_id.wrapping_add(1);
    runtime.renderer_map.insert(kind, renderer);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render_state::{RenderStateStore, create_render_state, get_render_state_runtime};

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

    // copy_all_renderers_from_render_state

    #[test]
    fn copy_all_renderers_from_render_state_copies_registrations() {
        let mut store = RenderStateStore::new();
        let source = create_render_state(&mut store, None);
        let target = create_render_state(&mut store, None);
        let kind = KindId::new();
        let renderer: Arc<dyn Renderer> = Arc::new(NoopRenderer);
        register_renderer(&mut store, source, kind, renderer.clone());

        copy_all_renderers_from_render_state(&mut store, target, source);

        let copied = get_render_state_runtime(&store, target)
            .renderer_map
            .get(&kind)
            .expect("renderer copied to target");
        assert!(Arc::ptr_eq(copied, &renderer));
    }

    #[test]
    fn copy_all_renderers_from_render_state_is_noop_when_source_empty() {
        let mut store = RenderStateStore::new();
        let source = create_render_state(&mut store, None);
        let target = create_render_state(&mut store, None);
        copy_all_renderers_from_render_state(&mut store, target, source);
        assert_eq!(
            get_render_state_runtime(&store, target).renderer_map.len(),
            0
        );
    }

    // copy_renderers_from_render_state

    #[test]
    fn copy_renderers_from_render_state_copies_all_registrations() {
        let mut store = RenderStateStore::new();
        let source = create_render_state(&mut store, None);
        let target = create_render_state(&mut store, None);
        let kind = KindId::new();
        let renderer: Arc<dyn Renderer> = Arc::new(NoopRenderer);
        register_renderer(&mut store, source, kind, renderer.clone());

        copy_renderers_from_render_state(&mut store, target, source);

        let copied = get_render_state_runtime(&store, target)
            .renderer_map
            .get(&kind)
            .expect("renderer copied to target");
        assert!(Arc::ptr_eq(copied, &renderer));
    }

    #[test]
    fn copy_renderers_from_render_state_is_noop_when_source_empty() {
        let mut store = RenderStateStore::new();
        let source = create_render_state(&mut store, None);
        let target = create_render_state(&mut store, None);
        copy_renderers_from_render_state(&mut store, target, source);
        assert_eq!(
            get_render_state_runtime(&store, target).renderer_map.len(),
            0
        );
    }

    #[test]
    fn copy_renderers_from_render_state_does_not_affect_source_map_id() {
        let mut store = RenderStateStore::new();
        let source = create_render_state(&mut store, None);
        let target = create_render_state(&mut store, None);
        let kind = KindId::new();
        register_renderer(&mut store, source, kind, Arc::new(NoopRenderer));
        let source_id_before = get_render_state_runtime(&store, source).renderer_map_id;
        copy_renderers_from_render_state(&mut store, target, source);
        assert_eq!(
            get_render_state_runtime(&store, source).renderer_map_id,
            source_id_before
        );
    }

    // register_renderer

    #[test]
    fn register_renderer_increments_map_id() {
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
        let kind = KindId::new();
        let map_id_before = get_render_state_runtime_mut(&mut store, id).renderer_map_id;
        register_renderer(&mut store, id, kind, Arc::new(NoopRenderer));
        let map_id_after = get_render_state_runtime_mut(&mut store, id).renderer_map_id;
        assert_ne!(map_id_before, map_id_after);
    }

    #[test]
    fn register_renderer_same_renderer_is_noop() {
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
        let kind = KindId::new();
        let renderer = Arc::new(NoopRenderer);
        register_renderer(&mut store, id, kind, renderer.clone());
        let map_id_after_first = get_render_state_runtime_mut(&mut store, id).renderer_map_id;
        register_renderer(&mut store, id, kind, renderer.clone());
        let map_id_after_second = get_render_state_runtime_mut(&mut store, id).renderer_map_id;
        assert_eq!(map_id_after_first, map_id_after_second);
    }

    // noop_renderer_data

    #[test]
    fn noop_renderer_data_returns_none() {
        let state = RenderState::default();
        assert!(noop_renderer_data(&state, 0).is_none());
    }
}
