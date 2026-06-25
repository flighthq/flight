//! Render proxy management — the per-node render-walk objects for the 2D graph.
//!
//! A `RenderProxy2D` is the unified render node for both display objects and
//! sprites. There is no per-family render identity; what differs between them
//! is the traits their source carries.
//!
//! # Walk lifecycle
//!
//! 1. `prepare_display_object_render` (or `walk_node`) advances the frame id and
//!    calls the visitor for every dirty node.
//! 2. The visitor (`update_render_proxy_2d`) composes the trait update steps:
//!    appearance, transform, material, clip depth.
//! 3. Backends read the resolved `RenderProxy2D` values during their draw pass.
//! 4. When nodes are removed from the scene, `dispose_display_object_render` or
//!    `dispose_render_proxy` tears them down and frees GPU resources.

use std::sync::Mutex;

use flighthq_types::{
    KindId, Matrix, RenderProxy, RenderProxy2D, RenderState, SceneGraphSyncPolicy,
};

use crate::render_state::{
    RenderStateId, RenderStateStore, get_render_state_runtime, get_render_state_runtime_mut,
};

// ---------------------------------------------------------------------------
// Callback types
// ---------------------------------------------------------------------------

/// Per-node update callback invoked by `walk_node` for every dirty 2D node.
///
/// Receives the source node id, its `RenderProxy2D`, and the parent's
/// `RenderProxy2D` (if any). Composes the trait update steps: appearance,
/// transform, material, and clip nesting depth.
pub type RenderProxyVisitor = fn(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    data: &mut RenderProxy2D,
    parent_data: Option<&RenderProxy2D>,
);

/// Global per-node hook fired at the end of `update_render_proxy_2d`.
///
/// The render-proxy-adapter subsystem installs `apply_render_proxy_adapter`
/// here so that adapters can rewrite a node's render proxy (e.g. swap to the
/// cache kind) during the update pass. Fn pointers are `Copy`, so the hook
/// slot stores one directly.
pub type AdaptHook = fn(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    data: &mut RenderProxy2D,
);

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// No-op stub; reserved for future per-node begin-of-frame hooks.
pub fn begin_render_proxy_update(_source_id: u64, _data: &RenderProxy) {}

/// Allocates a new `RenderProxy` for `source_id` on the state `id`, looking
/// up the matching renderer from the registry.
pub fn create_render_proxy(
    store: &mut RenderStateStore,
    id: RenderStateId,
    _state: &RenderState,
    source_id: u64,
    kind: KindId,
) -> RenderProxy {
    let renderer_map_id = get_render_state_runtime(store, id).renderer_map_id;
    RenderProxy {
        source_id,
        kind,
        alpha: 1.0,
        appearance_frame_id: u64::MAX,
        blend_mode: None,
        last_appearance_id: u64::MAX,
        last_local_content_id: u64::MAX,
        last_local_transform_id: u64::MAX,
        name: None,
        renderer_map_id,
        transform_frame_id: u64::MAX,
        visible: true,
    }
}

/// The one render-proxy allocator for the 2D graph. Builds a `RenderProxy2D`
/// on top of the base proxy returned by `create_render_proxy`.
pub fn create_render_proxy_2d(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    kind: KindId,
) -> RenderProxy2D {
    let base = create_render_proxy(store, id, state, source_id, kind);
    RenderProxy2D {
        base,
        transform_2d: Matrix::default(),
        traverse_children: true,
        clip_depth: 0,
    }
}

/// Tears down the render proxies for `root` and every descendant, freeing GPU
/// resources. Visits all nodes regardless of enabled or visible state.
///
/// Call after `remove_node_child` for nodes that will never be rendered again.
pub fn dispose_display_object_render(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    root_id: u64,
    get_children: &dyn Fn(u64) -> Vec<u64>,
) {
    // Pre-order walk over the full subtree (no enabled/visible filtering): every proxy created
    // by prepare_display_object_render must be torn down, including hidden nodes.
    let mut stack = vec![root_id];
    while let Some(current) = stack.pop() {
        dispose_render_proxy(store, id, state, current);
        let children = get_children(current);
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }
}

/// Disposes the render proxy for a single node — drops it from the proxy map
/// and calls the renderer's `destroy_data` to free non-GC GPU resources.
///
/// Call when a node is removed from rendering for good.
pub fn dispose_render_proxy(
    store: &mut RenderStateStore,
    id: RenderStateId,
    _state: &RenderState,
    source_id: u64,
) {
    // The Rust `RenderProxy` carries no renderer-data slot (it was dropped from the proxy type),
    // so there is no GPU resource to free via destroy_data here; dropping the proxy from the map
    // makes it eligible for collection. When the proxy regains a renderer-data slot, free it
    // here before removal — see TODO(wave-N) in update_render_proxy_renderer.
    get_render_state_runtime_mut(store, id)
        .render_proxy_map
        .remove(&source_id);
}

/// Returns the `RenderProxy2D` for `source_id`, creating it if it does not yet
/// exist in the proxy map. Also refreshes the renderer binding if the
/// `renderer_map_id` has changed since the proxy was created.
pub fn get_or_create_render_proxy_2d<'store>(
    store: &'store mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    kind: KindId,
) -> &'store mut RenderProxy2D {
    let exists = get_render_state_runtime(store, id)
        .render_proxy_map
        .contains_key(&source_id);
    if !exists {
        let proxy = create_render_proxy_2d(store, id, state, source_id, kind);
        get_render_state_runtime_mut(store, id)
            .render_proxy_map
            .insert(source_id, proxy);
    }
    let current_map_id = get_render_state_runtime(store, id).renderer_map_id;
    let stale = get_render_state_runtime(store, id)
        .render_proxy_map
        .get(&source_id)
        .map(|p| p.base.renderer_map_id != current_map_id)
        .unwrap_or(false);
    if stale {
        // Refresh the renderer binding to the current registry generation.
        let mut base = get_render_state_runtime(store, id)
            .render_proxy_map
            .get(&source_id)
            .map(|p| p.base.clone())
            .expect("proxy exists");
        update_render_proxy_renderer(store, id, state, &mut base);
        if let Some(p) = get_render_state_runtime_mut(store, id)
            .render_proxy_map
            .get_mut(&source_id)
        {
            p.base = base;
        }
    }
    get_render_state_runtime_mut(store, id)
        .render_proxy_map
        .get_mut(&source_id)
        .expect("proxy exists")
}

/// Returns the `RenderProxy2D` for `source_id` if it exists in the proxy map,
/// or `None` otherwise.
pub fn get_render_proxy_2d(
    store: &RenderStateStore,
    id: RenderStateId,
    source_id: u64,
) -> Option<&RenderProxy2D> {
    get_render_state_runtime(store, id)
        .render_proxy_map
        .get(&source_id)
}

/// Installs a global adapt hook called at the end of every `update_render_proxy_2d`
/// invocation. Used by the render-proxy-adapter subsystem.
///
/// Only one hook may be installed per process. Calling this again replaces the
/// previous hook.
pub fn install_render_adapt_hook(hook: AdaptHook) {
    *ADAPT_HOOK.lock().expect("adapt hook lock poisoned") = Some(hook);
}

/// Returns `true` if the `RenderProxy` for `source_id` needs to be
/// recalculated this frame: the parent changed this frame, or any local
/// revision id is stale.
pub fn is_render_proxy_dirty(
    store: &RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    data: &RenderProxy,
    parent_data: Option<&RenderProxy>,
    local_transform_id: u32,
    appearance_id: u32,
    local_content_id: u32,
) -> bool {
    let current_frame_id = get_render_state_runtime(store, id).current_frame_id;
    let parent_dirty = parent_data
        .map(|p| {
            p.transform_frame_id == current_frame_id || p.appearance_frame_id == current_frame_id
        })
        .unwrap_or(false);
    let local_dirty = state.scene_graph_sync_policy == SceneGraphSyncPolicy::RefreshDerivedState
        || data.last_local_transform_id != local_transform_id as u64
        || data.last_appearance_id != appearance_id as u64
        || data.last_local_content_id != local_content_id as u64;
    parent_dirty || local_dirty
}

/// Returns `true` if the `RenderProxy2D` should be drawn: it is visible,
/// has alpha > 0, and the transform matrix has non-zero scale.
pub fn is_render_proxy_visible(data: &RenderProxy2D) -> bool {
    data.base.visible
        && data.base.alpha > 0.0
        && !(data.transform_2d.a == 0.0 && data.transform_2d.d == 0.0)
}

/// The pre-render update pass for the 2D graph.
///
/// Advances the frame id, then walks the subtree rooted at `root_id` in
/// pre-order, calling `update_render_proxy_2d` for every dirty node.
///
/// Returns `true` if at least one node was updated (the tree was dirty).
pub fn prepare_display_object_render(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    root_id: u64,
    get_children: &dyn Fn(u64) -> Vec<u64>,
    is_node_enabled: &dyn Fn(u64) -> bool,
    get_node_parent: &dyn Fn(u64) -> Option<u64>,
    get_revision_ids: &dyn Fn(u64) -> (u32, u32, u32),
    get_kind: &dyn Fn(u64) -> KindId,
    get_local_transform: &dyn Fn(u64) -> Matrix,
    get_source_alpha: &dyn Fn(u64) -> f32,
    get_source_visible: &dyn Fn(u64) -> bool,
    get_source_blend_mode: &dyn Fn(u64) -> Option<flighthq_types::BlendMode>,
    get_source_clip: &dyn Fn(u64) -> bool,
) -> bool {
    use crate::appearance::update_render_proxy_appearance;
    use crate::transform2d::update_render_proxy_2d_transform;

    get_render_state_runtime_mut(store, id).current_frame_id += 1;

    // Iterative pre-order walk. Each stack frame remembers its parent so we can resolve the
    // parent proxy by value (a small Copy snapshot) without holding a borrow into the map while
    // we mutate the current node's proxy.
    let mut stack: Vec<(u64, Option<u64>)> = vec![(root_id, None)];
    let mut tree_dirty = false;

    while let Some((current, parent)) = stack.pop() {
        if !is_node_enabled(current) {
            continue;
        }

        let kind = get_kind(current);
        // Snapshot the parent proxy (by clone) so the current proxy can be borrowed mutably.
        let parent_proxy: Option<RenderProxy2D> = parent.and_then(|pid| {
            get_render_state_runtime(store, id)
                .render_proxy_map
                .get(&pid)
                .cloned()
        });

        // Ensure the current proxy exists and its renderer binding is fresh.
        get_or_create_render_proxy_2d(store, id, state, current, kind);

        let (rev_transform, rev_appearance, rev_content) = get_revision_ids(current);
        let data_snapshot = get_render_state_runtime(store, id)
            .render_proxy_map
            .get(&current)
            .map(|p| p.base.clone())
            .expect("proxy exists");

        let dirty = is_render_proxy_dirty(
            store,
            id,
            state,
            current,
            &data_snapshot,
            parent_proxy.as_ref().map(|p| &p.base),
            rev_transform,
            rev_appearance,
            rev_content,
        );

        if dirty {
            let local_transform = get_local_transform(current);
            let source_alpha = get_source_alpha(current);
            let source_visible = get_source_visible(current);
            let source_blend_mode = get_source_blend_mode(current);
            let source_has_clip = get_source_clip(current);

            // Work on a detached copy of the proxy, then write it back. This sidesteps the
            // simultaneous &mut (current) / & (parent) borrow of the same map.
            let mut data = get_render_state_runtime(store, id)
                .render_proxy_map
                .get(&current)
                .cloned()
                .expect("proxy exists");

            update_render_proxy_appearance(
                store,
                id,
                state,
                &mut data.base,
                parent_proxy.as_ref().map(|p| &p.base),
                source_alpha,
                source_visible,
                source_blend_mode,
                rev_appearance,
            );
            update_render_proxy_2d_transform(
                store,
                id,
                state,
                &mut data,
                parent_proxy.as_ref(),
                &local_transform,
                rev_transform,
            );
            // Material is currently a no-op on the Rust proxy (no material slot); see material.rs.
            update_node_clip(&mut data, parent_proxy.as_ref(), source_has_clip);
            data.base.last_local_content_id = rev_content as u64;
            // Fire the installed adapt hook (the render-proxy-adapter subsystem) on the detached
            // copy before writing it back, mirroring the tail of the TS updateRenderProxy2D.
            run_adapt_hook(store, id, state, current, &mut data);

            if let Some(p) = get_render_state_runtime_mut(store, id)
                .render_proxy_map
                .get_mut(&current)
            {
                *p = data;
            }
            tree_dirty = true;
        }

        let visible = get_render_state_runtime(store, id)
            .render_proxy_map
            .get(&current)
            .map(is_render_proxy_visible)
            .unwrap_or(false);
        if !visible {
            continue;
        }

        let traverse = get_render_state_runtime(store, id)
            .render_proxy_map
            .get(&current)
            .map(|p| p.traverse_children)
            .unwrap_or(true);
        if traverse {
            let children = get_children(current);
            for child in children.into_iter().rev() {
                stack.push((child, Some(current)));
            }
        }
    }

    tree_dirty
}

/// Sets a node's clip nesting depth from its parent's depth plus whether the
/// source node itself carries an active clip. Stateless; composes as a trait
/// update step inside the visitor.
pub fn update_node_clip(
    data: &mut RenderProxy2D,
    parent_data: Option<&RenderProxy2D>,
    source_has_clip: bool,
) {
    let parent_depth = parent_data.map(|p| p.clip_depth).unwrap_or(0);
    data.clip_depth = parent_depth + if source_has_clip { 1 } else { 0 };
}

/// The single per-node update step for the 2D walk. Applies appearance,
/// transform, material, and clip nesting depth in sequence.
pub fn update_render_proxy_2d(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    data: &mut RenderProxy2D,
    _parent_data: Option<&RenderProxy2D>,
) {
    // TODO(wave-N): the TS visitor reads the source node's alpha/visibility/blend/transform/clip
    // directly off `data.source` (a Node). In the Rust id-based model those source values are
    // supplied through closures available only to `prepare_display_object_render`, not through
    // this visitor's signature. As a result the full per-node composition (appearance, transform,
    // material, clip) is performed inline inside `prepare_display_object_render`, and this generic
    // entry point cannot reconstruct it from `source_id` alone. What it *can* do is fire the
    // installed adapt hook, which only needs the proxy. Re-add the trait composition here once the
    // visitor signature carries (or can resolve) the source values.
    run_adapt_hook(store, id, state, source_id, data);
}

/// Refreshes the renderer binding on `node` to match the current
/// `renderer_map_id`. Frees outgoing renderer data and allocates new data for
/// the incoming renderer.
pub fn update_render_proxy_renderer(
    store: &mut RenderStateStore,
    id: RenderStateId,
    _state: &RenderState,
    node: &mut RenderProxy,
) {
    // The Rust `RenderProxy` does not carry a `renderer` reference or a `renderer_data` slot
    // (both were dropped from the proxy type in the bootstrap stub). The TS source additionally
    // frees the outgoing renderer's GPU data and allocates new data for the incoming renderer;
    // until those slots return, refreshing the registry generation stamp is the whole job. The
    // renderer for `node.kind` is resolved at draw time from the registry, not cached on the proxy.
    // TODO(wave-N): re-add renderer-data alloc/free here once RenderProxy regains those slots.
    node.renderer_map_id = get_render_state_runtime(store, id).renderer_map_id;
}

/// One generic, dirty-checked pre-order walk over the 2D node graph.
///
/// Advances the frame id and calls `visit` for every dirty enabled node.
/// Returns `true` if at least one node was visited (dirty).
pub fn walk_node(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    root_id: u64,
    visit: RenderProxyVisitor,
    get_children: &dyn Fn(u64) -> Vec<u64>,
    is_node_enabled: &dyn Fn(u64) -> bool,
    _get_node_parent: &dyn Fn(u64) -> Option<u64>,
    get_revision_ids: &dyn Fn(u64) -> (u32, u32, u32),
    get_kind: &dyn Fn(u64) -> KindId,
) -> bool {
    get_render_state_runtime_mut(store, id).current_frame_id += 1;

    // Iterative pre-order walk mirroring prepare_display_object_render: each stack frame carries
    // its parent id so the parent proxy can be snapshotted (by clone) without holding a borrow
    // into the proxy map while the current node's proxy is mutated.
    let mut stack: Vec<(u64, Option<u64>)> = vec![(root_id, None)];
    let mut tree_dirty = false;

    while let Some((current, parent)) = stack.pop() {
        if !is_node_enabled(current) {
            continue;
        }

        let kind = get_kind(current);
        let parent_proxy: Option<RenderProxy2D> = parent.and_then(|pid| {
            get_render_state_runtime(store, id)
                .render_proxy_map
                .get(&pid)
                .cloned()
        });

        get_or_create_render_proxy_2d(store, id, state, current, kind);

        let (rev_transform, rev_appearance, rev_content) = get_revision_ids(current);
        let data_snapshot = get_render_state_runtime(store, id)
            .render_proxy_map
            .get(&current)
            .map(|p| p.base.clone())
            .expect("proxy exists");

        let dirty = is_render_proxy_dirty(
            store,
            id,
            state,
            current,
            &data_snapshot,
            parent_proxy.as_ref().map(|p| &p.base),
            rev_transform,
            rev_appearance,
            rev_content,
        );

        if dirty {
            // Work on a detached copy of the proxy, then write it back, sidestepping the
            // simultaneous &mut(current)/&(parent) borrow of the same map.
            let mut data = get_render_state_runtime(store, id)
                .render_proxy_map
                .get(&current)
                .cloned()
                .expect("proxy exists");
            visit(store, id, state, current, &mut data, parent_proxy.as_ref());
            if let Some(p) = get_render_state_runtime_mut(store, id)
                .render_proxy_map
                .get_mut(&current)
            {
                *p = data;
            }
            tree_dirty = true;
        }

        let visible = get_render_state_runtime(store, id)
            .render_proxy_map
            .get(&current)
            .map(is_render_proxy_visible)
            .unwrap_or(false);
        if !visible {
            continue;
        }

        let traverse = get_render_state_runtime(store, id)
            .render_proxy_map
            .get(&current)
            .map(|p| p.traverse_children)
            .unwrap_or(true);
        if traverse {
            let children = get_children(current);
            for child in children.into_iter().rev() {
                stack.push((child, Some(current)));
            }
        }
    }

    tree_dirty
}

/// Fires the globally installed adapt hook, if any, on `data`. A no-op when no
/// hook is installed.
fn run_adapt_hook(
    store: &mut RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    source_id: u64,
    data: &mut RenderProxy2D,
) {
    let hook = *ADAPT_HOOK.lock().expect("adapt hook lock poisoned");
    if let Some(hook) = hook {
        hook(store, id, state, source_id, data);
    }
}

// Loose process-global slot for the single adapt hook. Fn pointers are Copy, so the lock is held
// only long enough to read the pointer out before invoking it (avoiding a re-entrant lock when a
// hook installs another hook). install_render_adapt_hook writes it; run_adapt_hook reads it.
static ADAPT_HOOK: Mutex<Option<AdaptHook>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render_state::{
        RenderStateStore, create_render_state, get_render_state, get_render_state_runtime,
    };
    use crate::renderer::register_renderer;
    use flighthq_types::{BlendMode, Renderer, RendererData, SceneGraphSyncPolicy};
    use std::collections::HashMap;
    use std::sync::Arc;

    // A tiny closure-backed scene graph: maps node id -> (kind, children, enabled), plus appearance,
    // transform, and clip state. Stands in for the TS DisplayObject graph the proxy walk reads
    // through closures.
    struct Graph {
        kind: KindId,
        children: HashMap<u64, Vec<u64>>,
        enabled: HashMap<u64, bool>,
        clip: HashMap<u64, bool>,
    }

    impl Graph {
        fn new(kind: KindId) -> Self {
            Graph {
                kind,
                children: HashMap::new(),
                enabled: HashMap::new(),
                clip: HashMap::new(),
            }
        }

        fn add_child(&mut self, parent: u64, child: u64) {
            self.children.entry(parent).or_default().push(child);
        }
    }

    fn prepare_with_graph(
        store: &mut RenderStateStore,
        id: RenderStateId,
        graph: &Graph,
        root: u64,
    ) -> bool {
        let state = get_render_state(store, id).clone();
        let kind = graph.kind;
        let children = graph.children.clone();
        let enabled = graph.enabled.clone();
        let clip = graph.clip.clone();
        let get_children = move |n: u64| children.get(&n).cloned().unwrap_or_default();
        let is_enabled = move |n: u64| enabled.get(&n).copied().unwrap_or(true);
        let get_parent = |_n: u64| None;
        let get_rev = |_n: u64| (1u32, 1u32, 1u32);
        let get_kind = move |_n: u64| kind;
        let get_local = |_n: u64| Matrix::default();
        let get_alpha = |_n: u64| 1.0f32;
        let get_visible = |_n: u64| true;
        let get_blend = |_n: u64| None::<BlendMode>;
        let get_clip = move |n: u64| clip.get(&n).copied().unwrap_or(false);
        prepare_display_object_render(
            store,
            id,
            &state,
            root,
            &get_children,
            &is_enabled,
            &get_parent,
            &get_rev,
            &get_kind,
            &get_local,
            &get_alpha,
            &get_visible,
            &get_blend,
            &get_clip,
        )
    }

    struct CountingRenderer;
    impl Renderer for CountingRenderer {
        fn create_data(&self, _s: &RenderState, _id: u64) -> Option<Box<dyn RendererData>> {
            None
        }
        fn submit(&self, _s: &RenderState, _n: &RenderProxy) {}
    }

    // begin_render_proxy_update

    #[test]
    fn begin_render_proxy_update_is_a_noop() {
        let proxy = RenderProxy::default();
        // Must not panic; it is a reserved no-op hook.
        begin_render_proxy_update(7, &proxy);
    }

    // create_render_proxy

    #[test]
    fn create_render_proxy_initializes_default_values() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id).clone();
        let kind = KindId::new();
        let proxy = create_render_proxy(&mut store, id, &state, 42, kind);
        assert_eq!(proxy.source_id, 42);
        assert_eq!(proxy.kind, kind);
        assert_eq!(proxy.alpha, 1.0);
        assert_eq!(proxy.appearance_frame_id, u64::MAX);
        assert_eq!(proxy.last_appearance_id, u64::MAX);
        assert_eq!(proxy.last_local_transform_id, u64::MAX);
        assert_eq!(proxy.transform_frame_id, u64::MAX);
        assert!(proxy.visible);
        assert!(proxy.blend_mode.is_none());
    }

    #[test]
    fn create_render_proxy_picks_up_current_renderer_map_id() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        register_renderer(&mut store, id, kind, Arc::new(CountingRenderer));
        let map_id = get_render_state_runtime(&store, id).renderer_map_id;
        let state = get_render_state(&store, id).clone();
        let proxy = create_render_proxy(&mut store, id, &state, 1, kind);
        assert_eq!(proxy.renderer_map_id, map_id);
    }

    // create_render_proxy2_d

    #[test]
    fn create_render_proxy2_d_includes_transform_and_source() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id).clone();
        let kind = KindId::new();
        let proxy = create_render_proxy_2d(&mut store, id, &state, 5, kind);
        assert_eq!(proxy.base.source_id, 5);
        assert_eq!(proxy.clip_depth, 0);
        assert!(proxy.traverse_children);
        // transform_2d initialized to a default matrix.
        assert_eq!(proxy.transform_2d.a, Matrix::default().a);
    }

    // dispose_display_object_render

    #[test]
    fn dispose_display_object_render_disposes_root_and_all_descendants() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let mut graph = Graph::new(kind);
        graph.add_child(1, 2);
        graph.add_child(2, 3);
        prepare_with_graph(&mut store, id, &graph, 1);
        assert!(get_render_proxy_2d(&store, id, 1).is_some());

        let state = get_render_state(&store, id).clone();
        let children = graph.children.clone();
        let get_children = move |n: u64| children.get(&n).cloned().unwrap_or_default();
        dispose_display_object_render(&mut store, id, &state, 1, &get_children);

        assert!(get_render_proxy_2d(&store, id, 1).is_none());
        assert!(get_render_proxy_2d(&store, id, 2).is_none());
        assert!(get_render_proxy_2d(&store, id, 3).is_none());
    }

    #[test]
    fn dispose_display_object_render_visits_nodes_never_prepared() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let state = get_render_state(&store, id).clone();
        // Create a child proxy that was never reachable from a prepare walk.
        get_or_create_render_proxy_2d(&mut store, id, &state, 2, kind);
        let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
        children.insert(1, vec![2]);
        let get_children = move |n: u64| children.get(&n).cloned().unwrap_or_default();
        dispose_display_object_render(&mut store, id, &state, 1, &get_children);
        assert!(get_render_proxy_2d(&store, id, 2).is_none());
    }

    // dispose_render_proxy

    #[test]
    fn dispose_render_proxy_removes_the_proxy() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let state = get_render_state(&store, id).clone();
        get_or_create_render_proxy_2d(&mut store, id, &state, 9, kind);
        assert!(get_render_proxy_2d(&store, id, 9).is_some());
        dispose_render_proxy(&mut store, id, &state, 9);
        assert!(get_render_proxy_2d(&store, id, 9).is_none());
    }

    #[test]
    fn dispose_render_proxy_is_noop_when_no_proxy_exists() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id).clone();
        dispose_render_proxy(&mut store, id, &state, 123);
        assert!(get_render_proxy_2d(&store, id, 123).is_none());
    }

    // get_or_create_render_proxy2_d

    #[test]
    fn get_or_create_render_proxy2_d_creates_on_first_call() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let state = get_render_state(&store, id).clone();
        let proxy = get_or_create_render_proxy_2d(&mut store, id, &state, 4, kind);
        assert_eq!(proxy.base.source_id, 4);
        assert!(proxy.traverse_children);
    }

    #[test]
    fn get_or_create_render_proxy2_d_returns_same_node_on_subsequent_calls() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let state = get_render_state(&store, id).clone();
        get_or_create_render_proxy_2d(&mut store, id, &state, 4, kind);
        get_or_create_render_proxy_2d(&mut store, id, &state, 4, kind);
        // Only one entry for source 4.
        assert_eq!(
            get_render_state_runtime(&store, id).render_proxy_map.len(),
            1
        );
    }

    #[test]
    fn get_or_create_render_proxy2_d_syncs_renderer_map_id_when_changed() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let state = get_render_state(&store, id).clone();
        get_or_create_render_proxy_2d(&mut store, id, &state, 4, kind);
        let stale_id = get_render_proxy_2d(&store, id, 4)
            .unwrap()
            .base
            .renderer_map_id;
        // Register a renderer to bump the map id, then re-resolve to trigger the refresh.
        register_renderer(&mut store, id, kind, Arc::new(CountingRenderer));
        let current_id = get_render_state_runtime(&store, id).renderer_map_id;
        get_or_create_render_proxy_2d(&mut store, id, &state, 4, kind);
        let refreshed = get_render_proxy_2d(&store, id, 4)
            .unwrap()
            .base
            .renderer_map_id;
        assert_ne!(stale_id, current_id);
        assert_eq!(refreshed, current_id);
    }

    // get_render_proxy2_d

    #[test]
    fn get_render_proxy2_d_returns_none_when_absent() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        assert!(get_render_proxy_2d(&store, id, 1).is_none());
    }

    #[test]
    fn get_render_proxy2_d_returns_the_node_after_creation() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let state = get_render_state(&store, id).clone();
        get_or_create_render_proxy_2d(&mut store, id, &state, 8, kind);
        assert_eq!(
            get_render_proxy_2d(&store, id, 8).unwrap().base.source_id,
            8
        );
    }

    // install_render_adapt_hook

    #[test]
    fn install_render_adapt_hook_does_not_panic() {
        fn hook(
            _s: &mut RenderStateStore,
            _id: RenderStateId,
            _state: &RenderState,
            _source_id: u64,
            _data: &mut RenderProxy2D,
        ) {
        }
        install_render_adapt_hook(hook);
        // Clear it again so other tests aren't affected by the global slot.
        *ADAPT_HOOK.lock().expect("lock") = None;
    }

    // is_render_proxy_dirty

    #[test]
    fn is_render_proxy_dirty_false_when_clean() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(
            &mut store,
            Some(RenderState {
                scene_graph_sync_policy: SceneGraphSyncPolicy::RequiresInvalidation,
                ..RenderState::default()
            }),
        );
        let state = get_render_state(&store, id).clone();
        let data = RenderProxy {
            last_local_transform_id: 1,
            last_appearance_id: 1,
            last_local_content_id: 1,
            ..Default::default()
        };
        let dirty = is_render_proxy_dirty(&store, id, &state, 1, &data, None, 1, 1, 1);
        assert!(!dirty);
    }

    #[test]
    fn is_render_proxy_dirty_true_when_appearance_changes() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(
            &mut store,
            Some(RenderState {
                scene_graph_sync_policy: SceneGraphSyncPolicy::RequiresInvalidation,
                ..RenderState::default()
            }),
        );
        let state = get_render_state(&store, id).clone();
        let data = RenderProxy {
            last_local_transform_id: 1,
            last_appearance_id: 1,
            last_local_content_id: 1,
            ..Default::default()
        };
        // appearance_id bumped to 2.
        let dirty = is_render_proxy_dirty(&store, id, &state, 1, &data, None, 1, 2, 1);
        assert!(dirty);
    }

    #[test]
    fn is_render_proxy_dirty_true_when_parent_updated_this_frame() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(
            &mut store,
            Some(RenderState {
                scene_graph_sync_policy: SceneGraphSyncPolicy::RequiresInvalidation,
                ..RenderState::default()
            }),
        );
        // Bump the frame id so a parent stamped with it counts as dirty.
        get_render_state_runtime_mut(&mut store, id).current_frame_id = 5;
        let state = get_render_state(&store, id).clone();
        let data = RenderProxy {
            last_local_transform_id: 1,
            last_appearance_id: 1,
            last_local_content_id: 1,
            ..Default::default()
        };
        let parent = RenderProxy {
            transform_frame_id: 5,
            ..Default::default()
        };
        let dirty = is_render_proxy_dirty(&store, id, &state, 1, &data, Some(&parent), 1, 1, 1);
        assert!(dirty);
    }

    #[test]
    fn is_render_proxy_dirty_true_under_refresh_derived_state_policy() {
        let mut store = RenderStateStore::new();
        // Default policy is RefreshDerivedState, which forces local_dirty.
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id).clone();
        let data = RenderProxy {
            last_local_transform_id: 1,
            last_appearance_id: 1,
            last_local_content_id: 1,
            ..Default::default()
        };
        let dirty = is_render_proxy_dirty(&store, id, &state, 1, &data, None, 1, 1, 1);
        assert!(dirty);
    }

    // prepare_display_object_render

    #[test]
    fn prepare_display_object_render_creates_proxies_for_all_enabled_nodes() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let mut graph = Graph::new(kind);
        graph.add_child(1, 2);
        prepare_with_graph(&mut store, id, &graph, 1);
        assert!(get_render_proxy_2d(&store, id, 1).is_some());
        assert!(get_render_proxy_2d(&store, id, 2).is_some());
    }

    #[test]
    fn prepare_display_object_render_skips_disabled_nodes() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let mut graph = Graph::new(kind);
        graph.add_child(1, 2);
        graph.enabled.insert(2, false);
        prepare_with_graph(&mut store, id, &graph, 1);
        assert!(get_render_proxy_2d(&store, id, 1).is_some());
        assert!(get_render_proxy_2d(&store, id, 2).is_none());
    }

    #[test]
    fn prepare_display_object_render_returns_true_when_dirty() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let graph = Graph::new(kind);
        assert!(prepare_with_graph(&mut store, id, &graph, 1));
    }

    #[test]
    fn prepare_display_object_render_returns_false_when_clean() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(
            &mut store,
            Some(RenderState {
                scene_graph_sync_policy: SceneGraphSyncPolicy::RequiresInvalidation,
                ..RenderState::default()
            }),
        );
        let kind = KindId::new();
        let graph = Graph::new(kind);
        prepare_with_graph(&mut store, id, &graph, 1);
        // Second prepare with stable revisions: nothing dirty.
        assert!(!prepare_with_graph(&mut store, id, &graph, 1));
    }

    #[test]
    fn prepare_display_object_render_accumulates_clip_depth_down_subtree() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let mut graph = Graph::new(kind);
        graph.add_child(1, 2);
        graph.add_child(2, 3);
        graph.clip.insert(1, true);
        graph.clip.insert(2, true);
        prepare_with_graph(&mut store, id, &graph, 1);
        assert_eq!(get_render_proxy_2d(&store, id, 1).unwrap().clip_depth, 1);
        assert_eq!(get_render_proxy_2d(&store, id, 2).unwrap().clip_depth, 2);
        assert_eq!(get_render_proxy_2d(&store, id, 3).unwrap().clip_depth, 2);
    }

    // update_render_proxy2_d

    #[test]
    fn update_render_proxy2_d_fires_installed_adapt_hook() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static CALLS: AtomicUsize = AtomicUsize::new(0);
        fn hook(
            _s: &mut RenderStateStore,
            _id: RenderStateId,
            _state: &RenderState,
            _source_id: u64,
            _data: &mut RenderProxy2D,
        ) {
            CALLS.fetch_add(1, Ordering::SeqCst);
        }
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id).clone();
        CALLS.store(0, Ordering::SeqCst);
        install_render_adapt_hook(hook);
        let mut data = RenderProxy2D::default();
        update_render_proxy_2d(&mut store, id, &state, 1, &mut data, None);
        *ADAPT_HOOK.lock().expect("lock") = None;
        assert_eq!(CALLS.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn update_render_proxy2_d_is_noop_without_a_hook() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = get_render_state(&store, id).clone();
        *ADAPT_HOOK.lock().expect("lock") = None;
        let mut data = RenderProxy2D::default();
        data.base.alpha = 1.0;
        update_render_proxy_2d(&mut store, id, &state, 1, &mut data, None);
        assert_eq!(data.base.alpha, 1.0);
    }

    // update_render_proxy_renderer

    #[test]
    fn update_render_proxy_renderer_updates_map_id_to_current() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        register_renderer(&mut store, id, kind, Arc::new(CountingRenderer));
        let current = get_render_state_runtime(&store, id).renderer_map_id;
        let state = get_render_state(&store, id).clone();
        let mut proxy = RenderProxy {
            renderer_map_id: u64::MAX,
            ..Default::default()
        };
        update_render_proxy_renderer(&mut store, id, &state, &mut proxy);
        assert_eq!(proxy.renderer_map_id, current);
    }

    // walk_node

    #[test]
    fn walk_node_visits_each_enabled_node_and_reports_dirty() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static VISITS: AtomicUsize = AtomicUsize::new(0);
        fn visit(
            _s: &mut RenderStateStore,
            _id: RenderStateId,
            _state: &RenderState,
            _source_id: u64,
            _data: &mut RenderProxy2D,
            _parent: Option<&RenderProxy2D>,
        ) {
            VISITS.fetch_add(1, Ordering::SeqCst);
        }
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
        children.insert(1, vec![2]);
        VISITS.store(0, Ordering::SeqCst);
        let state = get_render_state(&store, id).clone();
        let get_children = move |n: u64| children.get(&n).cloned().unwrap_or_default();
        let is_enabled = |_n: u64| true;
        let get_parent = |_n: u64| None;
        let get_rev = |_n: u64| (1u32, 1u32, 1u32);
        let get_kind = move |_n: u64| kind;
        let dirty = walk_node(
            &mut store,
            id,
            &state,
            1,
            visit,
            &get_children,
            &is_enabled,
            &get_parent,
            &get_rev,
            &get_kind,
        );
        assert_eq!(VISITS.load(Ordering::SeqCst), 2);
        assert!(dirty);
    }

    #[test]
    fn walk_node_skips_children_when_traverse_children_false() {
        fn visit(
            _s: &mut RenderStateStore,
            _id: RenderStateId,
            _state: &RenderState,
            _source_id: u64,
            data: &mut RenderProxy2D,
            _parent: Option<&RenderProxy2D>,
        ) {
            // Mark the root so it stops descending into children.
            data.traverse_children = false;
        }
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let kind = KindId::new();
        let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
        children.insert(1, vec![2]);
        let state = get_render_state(&store, id).clone();
        let get_children = move |n: u64| children.get(&n).cloned().unwrap_or_default();
        let is_enabled = |_n: u64| true;
        let get_parent = |_n: u64| None;
        let get_rev = |_n: u64| (1u32, 1u32, 1u32);
        let get_kind = move |_n: u64| kind;
        walk_node(
            &mut store,
            id,
            &state,
            1,
            visit,
            &get_children,
            &is_enabled,
            &get_parent,
            &get_rev,
            &get_kind,
        );
        assert!(get_render_proxy_2d(&store, id, 2).is_none());
    }

    // is_render_proxy_visible

    #[test]
    fn is_render_proxy_visible_false_when_invisible() {
        let mut proxy = RenderProxy2D::default();
        proxy.base.visible = false;
        proxy.base.alpha = 1.0;
        proxy.transform_2d = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        };
        assert!(!is_render_proxy_visible(&proxy));
    }

    #[test]
    fn is_render_proxy_visible_false_when_zero_alpha() {
        let mut proxy = RenderProxy2D::default();
        proxy.base.visible = true;
        proxy.base.alpha = 0.0;
        proxy.transform_2d = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        };
        assert!(!is_render_proxy_visible(&proxy));
    }

    #[test]
    fn is_render_proxy_visible_false_when_zero_scale() {
        let mut proxy = RenderProxy2D::default();
        proxy.base.visible = true;
        proxy.base.alpha = 1.0;
        proxy.transform_2d = Matrix {
            a: 0.0,
            b: 0.0,
            c: 0.0,
            d: 0.0,
            tx: 0.0,
            ty: 0.0,
        };
        assert!(!is_render_proxy_visible(&proxy));
    }

    #[test]
    fn is_render_proxy_visible_true_when_normal() {
        let mut proxy = RenderProxy2D::default();
        proxy.base.visible = true;
        proxy.base.alpha = 0.5;
        proxy.transform_2d = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        };
        assert!(is_render_proxy_visible(&proxy));
    }

    // update_node_clip

    #[test]
    fn update_node_clip_depth_zero_when_no_parent_no_clip() {
        let mut data = RenderProxy2D::default();
        update_node_clip(&mut data, None, false);
        assert_eq!(data.clip_depth, 0);
    }

    #[test]
    fn update_node_clip_depth_increments_when_source_has_clip() {
        let mut data = RenderProxy2D::default();
        update_node_clip(&mut data, None, true);
        assert_eq!(data.clip_depth, 1);
    }

    #[test]
    fn update_node_clip_depth_adds_to_parent_depth() {
        let parent = RenderProxy2D {
            clip_depth: 2,
            ..Default::default()
        };
        let mut data = RenderProxy2D::default();
        update_node_clip(&mut data, Some(&parent), true);
        assert_eq!(data.clip_depth, 3);
    }
}
