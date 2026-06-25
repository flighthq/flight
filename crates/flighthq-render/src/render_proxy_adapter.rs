//! Render proxy adapter — allows per-node overrides of the render walk.
//!
//! An adapter's `adapt` method is called during `update_render_proxy_2d`
//! (via the globally installed adapt hook). It may:
//! - mutate the `RenderProxy2D` (e.g. swap the `kind` to a cache kind), and
//! - return `Some(true)` to continue child traversal, `Some(false)` to skip
//!   children, or `None` to signal the default path.
//!
//! # Hook installation
//!
//! The adapt hook is installed lazily on the first call to
//! `set_render_proxy_adapter`. Only one hook slot exists per process; this
//! module owns it.

use std::sync::atomic::{AtomicBool, Ordering};

use flighthq_types::{RenderProxy2D, RenderProxyAdapter, RenderState};

use crate::render_proxy::{install_render_adapt_hook, update_render_proxy_renderer};
use crate::render_state::{
    RenderStateId, RenderStateStore, get_render_state_runtime, get_render_state_runtime_mut,
};

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Applies the adapter registered for `source_id` on state `id`.
///
/// If an adapter is present, calls `adapter.adapt`; if it returns a value,
/// also refreshes the renderer binding on `data` and sets `traverse_children`.
/// Falls back to `traverse_children = true` if no adapter is present.
///
/// This function is installed as the global adapt hook; do not call
/// `install_render_adapt_hook` separately.
pub fn apply_render_proxy_adapter(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    data: &mut RenderProxy2D,
) {
    // Consult the adapter, if any. It mutates `data` (e.g. swapping the kind) and returns the
    // traverse decision; a None result means "render normally" and leaves traverse_children true.
    let result = match get_render_state_runtime(store, id)
        .render_proxy_adapter_map
        .get(&source_id)
    {
        Some(adapter) => adapter.adapt(state, source_id, data),
        None => None,
    };
    let mut traverse_children = true;
    if let Some(result) = result {
        traverse_children = result;
        update_render_proxy_renderer(store, id, state, &mut data.base);
    }
    data.traverse_children = traverse_children;
}

/// Returns the `RenderProxyAdapter` registered for `source_id` on state `id`,
/// or `None` if none is registered.
pub fn get_render_proxy_adapter(
    store: &RenderStateStore,
    id: RenderStateId,
    source_id: u64,
) -> Option<&dyn RenderProxyAdapter> {
    get_render_state_runtime(store, id)
        .render_proxy_adapter_map
        .get(&source_id)
        .map(|boxed| boxed.as_ref())
}

/// Registers `adapter` for `source_id` on state `id`, or removes any existing
/// registration when `adapter` is `None`.
///
/// Installs the global adapt hook on the first call.
pub fn set_render_proxy_adapter(
    store: &mut RenderStateStore,
    id: RenderStateId,
    source_id: u64,
    adapter: Option<Box<dyn RenderProxyAdapter>>,
) {
    if !ADAPTER_HOOK_INSTALLED.swap(true, Ordering::SeqCst) {
        install_render_adapt_hook(apply_render_proxy_adapter);
    }
    let runtime = get_render_state_runtime_mut(store, id);
    match adapter {
        Some(adapter) => {
            runtime.render_proxy_adapter_map.insert(source_id, adapter);
        }
        None => {
            runtime.render_proxy_adapter_map.remove(&source_id);
        }
    }
    // The TS source additionally invalidates the node's appearance so the render walk re-evaluates
    // it. In the Rust id-based model the source node lives in the node arena (not on the render
    // state), so appearance invalidation is the caller's responsibility with the node arena in hand.
}

// One-time guard so the process-global adapt hook is installed lazily on first use, matching the
// TS `_installed` flag.
static ADAPTER_HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render_state::{RenderStateStore, create_render_state, get_render_state};

    struct ResultAdapter(Option<bool>);
    impl RenderProxyAdapter for ResultAdapter {
        fn adapt(&self, _s: &RenderState, _id: u64, _n: &mut RenderProxy2D) -> Option<bool> {
            self.0
        }
        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
        fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
            self
        }
    }

    // apply_render_proxy_adapter

    #[test]
    fn apply_render_proxy_adapter_sets_traverse_true_without_adapter() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        let mut data = RenderProxy2D {
            traverse_children: false,
            ..Default::default()
        };
        apply_render_proxy_adapter(&mut store, id, &state, 1, &mut data);
        assert!(data.traverse_children);
    }

    #[test]
    fn apply_render_proxy_adapter_sets_traverse_from_adapter_result() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id).clone();
        set_render_proxy_adapter(
            &mut store,
            id,
            1,
            Some(Box::new(ResultAdapter(Some(false)))),
        );
        let mut data = RenderProxy2D {
            traverse_children: true,
            ..Default::default()
        };
        apply_render_proxy_adapter(&mut store, id, &state, 1, &mut data);
        assert!(!data.traverse_children);
    }

    // get_render_proxy_adapter

    #[test]
    fn get_render_proxy_adapter_returns_none_by_default() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        assert!(get_render_proxy_adapter(&store, id, 42).is_none());
    }

    // set_render_proxy_adapter

    #[test]
    fn set_render_proxy_adapter_registers_and_removes() {
        struct DummyAdapter;
        impl RenderProxyAdapter for DummyAdapter {
            fn adapt(
                &self,
                _state: &RenderState,
                _source_id: u64,
                _node: &mut RenderProxy2D,
            ) -> Option<bool> {
                Some(true)
            }
            fn as_any(&self) -> &dyn std::any::Any {
                self
            }
            fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
                self
            }
        }

        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        set_render_proxy_adapter(&mut store, id, 42, Some(Box::new(DummyAdapter)));
        assert!(get_render_proxy_adapter(&store, id, 42).is_some());
        set_render_proxy_adapter(&mut store, id, 42, None);
        assert!(get_render_proxy_adapter(&store, id, 42).is_none());
    }
}
