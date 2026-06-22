//! Render state store and runtime — allocates and resolves `RenderState`
//! instances along with their package-private machinery (frame counters,
//! proxy maps, renderer registry).

use std::collections::HashMap;
use std::sync::Arc;

use flighthq_types::{KindId, RenderProxy2D, RenderProxyAdapter, RenderState, Renderer};

// ---------------------------------------------------------------------------
// RenderStateId
// ---------------------------------------------------------------------------

/// Opaque handle to a `RenderState` entry in a [`RenderStateStore`].
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub struct RenderStateId(pub u64);

// ---------------------------------------------------------------------------
// RenderStateRuntime
// ---------------------------------------------------------------------------

/// Package-private machinery attached to every `RenderState`.
///
/// The render path writes this object every frame; all fields are intentionally
/// mutable.
pub struct RenderStateRuntime {
    /// Monotonically increasing counter advanced by one at the start of each
    /// `walk_node` call (i.e., each `prepare_display_object_render` call).
    pub current_frame_id: u64,
    /// Maps `source` node ids to their resolved `RenderProxy2D`.
    pub render_proxy_map: HashMap<u64, RenderProxy2D>,
    /// Maps `source` node ids to their `RenderProxyAdapter`.
    pub render_proxy_adapter_map: HashMap<u64, Box<dyn RenderProxyAdapter>>,
    /// Renderer registry: kind → renderer.
    pub renderer_map: HashMap<KindId, Arc<dyn Renderer>>,
    /// Monotonically increasing counter bumped each time `renderer_map` changes.
    pub renderer_map_id: u64,
    /// Scratch stack for the iterative tree-walk; reused each frame.
    pub temp_stack: Vec<u64>,
}

impl RenderStateRuntime {
    /// Creates an empty runtime with default values.
    pub fn new() -> Self {
        Self {
            current_frame_id: 0,
            render_proxy_map: HashMap::new(),
            render_proxy_adapter_map: HashMap::new(),
            renderer_map: HashMap::new(),
            renderer_map_id: 0,
            temp_stack: Vec::new(),
        }
    }
}

impl Default for RenderStateRuntime {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// RenderStateStore
// ---------------------------------------------------------------------------

/// Arena that owns `RenderState` values and their runtimes.
///
/// One `RenderStateStore` per application; backends keep a reference to the
/// `RenderStateId` they were created for.
pub struct RenderStateStore {
    next_id: u64,
    states: HashMap<u64, RenderState>,
    runtimes: HashMap<u64, RenderStateRuntime>,
}

impl RenderStateStore {
    /// Creates an empty store.
    pub fn new() -> Self {
        Self {
            next_id: 1,
            states: HashMap::new(),
            runtimes: HashMap::new(),
        }
    }
}

impl Default for RenderStateStore {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Allocates a new `RenderState` with its runtime in `store`, returning its
/// id. `partial` carries optional field overrides — any field left as `None`
/// uses the type's default.
pub fn create_render_state(
    store: &mut RenderStateStore,
    partial: Option<RenderState>,
) -> RenderStateId {
    let id = store.next_id;
    store.next_id += 1;
    store.states.insert(id, partial.unwrap_or_default());
    store.runtimes.insert(id, RenderStateRuntime::new());
    RenderStateId(id)
}

/// Allocates and returns a fresh `RenderStateRuntime` with default values.
pub fn create_render_state_runtime() -> RenderStateRuntime {
    RenderStateRuntime::new()
}

/// Resolves a shared reference to the `RenderState` identified by `id`.
///
/// # Panics
///
/// Panics if `id` does not exist in `store` (programmer error).
pub fn get_render_state(store: &RenderStateStore, id: RenderStateId) -> &RenderState {
    store
        .states
        .get(&id.0)
        .expect("RenderStateId does not exist in store")
}

/// Resolves a mutable reference to the `RenderState` identified by `id`.
///
/// # Panics
///
/// Panics if `id` does not exist in `store` (programmer error).
pub fn get_render_state_mut(store: &mut RenderStateStore, id: RenderStateId) -> &mut RenderState {
    store
        .states
        .get_mut(&id.0)
        .expect("RenderStateId does not exist in store")
}

/// Resolves a shared reference to the `RenderStateRuntime` for `id`.
///
/// # Panics
///
/// Panics if `id` does not exist in `store` (programmer error).
pub fn get_render_state_runtime(
    store: &RenderStateStore,
    id: RenderStateId,
) -> &RenderStateRuntime {
    store
        .runtimes
        .get(&id.0)
        .expect("RenderStateId does not exist in store")
}

/// Resolves a mutable reference to the `RenderStateRuntime` for `id`.
///
/// # Panics
///
/// Panics if `id` does not exist in `store` (programmer error).
pub fn get_render_state_runtime_mut(
    store: &mut RenderStateStore,
    id: RenderStateId,
) -> &mut RenderStateRuntime {
    store
        .runtimes
        .get_mut(&id.0)
        .expect("RenderStateId does not exist in store")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // create_render_state

    #[test]
    fn create_render_state_returns_unique_ids() {
        let mut store = RenderStateStore::new();
        let id_a = create_render_state(&mut store, None);
        let id_b = create_render_state(&mut store, None);
        assert_ne!(id_a, id_b);
    }

    // create_render_state_runtime

    #[test]
    fn create_render_state_runtime_starts_at_frame_zero() {
        let rt = create_render_state_runtime();
        assert_eq!(rt.current_frame_id, 0);
    }

    // get_render_state / get_render_state_mut

    #[test]
    fn get_render_state_resolves_after_create() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id);
        assert!(state.allow_smoothing);
    }

    #[test]
    fn get_render_state_mut_allows_mutation() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        get_render_state_mut(&mut store, id).allow_smoothing = false;
        assert!(!get_render_state(&store, id).allow_smoothing);
    }

    // get_render_state_runtime / get_render_state_runtime_mut

    #[test]
    fn get_render_state_runtime_starts_empty() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let rt = get_render_state_runtime(&store, id);
        assert!(rt.renderer_map.is_empty());
        assert_eq!(rt.renderer_map_id, 0);
    }
}
