use flight_entity::{EntityRuntimeSlot, get_entity_id};
use flight_geometry::create_matrix;
use flight_node::{
    NodeRef, get_node_appearance_revision, get_node_children_revision,
    get_node_local_content_revision, get_node_local_transform_revision, get_node_parent,
    get_node_parent_reference_revision,
};

use crate::{
    RenderProxies2D, RenderProxy, RenderProxy2D, RenderProxyVisit, RenderRegistryTable,
    RenderState, Scene3DGraphSyncPolicy, update_render_proxy_2d_transform,
    update_render_proxy_appearance, update_render_proxy_material,
};

/// Allocates the render proxy for `source` (TS `createRenderProxy`), resolving its renderer and
/// renderer data during construction. D23: `source` is defining content and `state` the D5 context
/// (Principal 06d7a025).
pub fn create_render_proxy<S: RenderState>(state: &mut S, source: &NodeRef) -> RenderProxy<S> {
    let renderer = resolve_render_proxy_renderer(state, &node_kind(source));
    let renderer_data = renderer.and_then(|value| (value.create_data)(state, source));
    return RenderProxy {
        runtime: EntityRuntimeSlot::default(),
        source: source.clone(),
        kind: node_kind(source),
        next: None,
        alpha: 1.0,
        appearance_frame_id: -1,
        blend_mode: Some(flight_materials::BLEND_MODE_NORMAL.to_string()),
        color_scale_bias: None,
        color_matrix: None,
        material: None,
        material_data: None,
        last_appearance_id: -1,
        last_children_id: -1,
        last_local_content_id: -1,
        last_local_transform_id: -1,
        last_parent_reference_id: -1,
        name: None,
        renderer,
        renderer_data,
        renderer_data_source_id: node_id(source),
        renderer_map_id: state.render_runtime().renderer_map_id,
        transform_frame_id: -1,
        visible: true,
    };
}

/// The one render-node allocator for the 2D graph (TS `createRenderProxy2D`): a render proxy plus
/// the 2D transform, child traversal and clip depth every 2D node carries.
pub fn create_render_proxy_2d<S: RenderState>(state: &mut S, source: &NodeRef) -> RenderProxy2D<S> {
    return RenderProxy2D {
        proxy: create_render_proxy(state, source),
        transform_2d: create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        traverse_children: true,
        clip_depth: 0,
    };
}

/// Constructs a render proxy for `source` in place (TS `initializeRenderProxy`), keeping the
/// receiver's entity identity (D12).
pub fn initialize_render_proxy<S: RenderState>(
    out: &mut RenderProxy<S>,
    state: &mut S,
    source: &NodeRef,
) {
    let runtime = std::mem::take(&mut out.runtime);
    *out = create_render_proxy(state, source);
    out.runtime = runtime;
}

/// Constructs a 2D render proxy for `source` in place, the per-layer seam of
/// `create_render_proxy_2d`: the base proxy layer, then the 2D fields.
// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source's createRenderProxy2D
pub fn initialize_render_proxy_2d<S: RenderState>(
    out: &mut RenderProxy2D<S>,
    state: &mut S,
    source: &NodeRef,
) {
    initialize_render_proxy(&mut out.proxy, state, source);
    out.transform_2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    out.traverse_children = true;
    out.clip_depth = 0;
}

fn clone_render_proxy_2d<S: RenderState>(source: &RenderProxy2D<S>) -> RenderProxy2D<S> {
    return RenderProxy2D {
        proxy: RenderProxy {
            runtime: EntityRuntimeSlot::default(),
            source: source.source.clone(),
            kind: source.kind.clone(),
            next: source.next,
            alpha: source.alpha,
            appearance_frame_id: source.appearance_frame_id,
            blend_mode: source.blend_mode.clone(),
            color_scale_bias: source.color_scale_bias.clone(),
            color_matrix: source.color_matrix,
            material: source.material.clone(),
            material_data: source.material_data.clone(),
            last_appearance_id: source.last_appearance_id,
            last_children_id: source.last_children_id,
            last_local_content_id: source.last_local_content_id,
            last_local_transform_id: source.last_local_transform_id,
            last_parent_reference_id: source.last_parent_reference_id,
            name: source.name.clone(),
            renderer: source.renderer,
            renderer_data: source.renderer_data.clone(),
            renderer_data_source_id: source.renderer_data_source_id,
            renderer_map_id: source.renderer_map_id,
            transform_frame_id: source.transform_frame_id,
            visible: source.visible,
        },
        transform_2d: source.transform_2d.clone(),
        traverse_children: source.traverse_children,
        clip_depth: source.clip_depth,
    };
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn dispose_render_proxy<S: RenderState>(
    state: &mut S,
    proxies: &mut RenderProxies2D<S>,
    source: &NodeRef,
) {
    let id = node_id(source);
    let Some(index) = proxies.by_uid.remove(&id) else {
        return;
    };
    let Some(mut proxy) = proxies.entries[index].take() else {
        return;
    };
    if let Some(data) = proxy.renderer_data.take()
        && let Some(destroy) = proxy.renderer.and_then(|renderer| renderer.destroy_data)
    {
        destroy(state, data);
    }
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn dispose_scene_2d_render<S: RenderState>(
    state: &mut S,
    proxies: &mut RenderProxies2D<S>,
    root: &NodeRef,
) {
    let mut stack = vec![root.clone()];
    while let Some(current) = stack.pop() {
        let children = node_children(&current);
        dispose_render_proxy(state, proxies, &current);
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }
}

fn ensure_proxy_index<S: RenderState>(
    state: &mut S,
    proxies: &mut RenderProxies2D<S>,
    source: &NodeRef,
) -> usize {
    let id = node_id(source);
    let index = match proxies.by_uid.get(&id).copied() {
        Some(index) => index,
        None => {
            let index = proxies.entries.len();
            proxies
                .entries
                .push(Some(create_render_proxy_2d(state, source)));
            proxies.by_uid.insert(id, index);
            index
        }
    };
    let update = proxies.entries[index]
        .as_ref()
        .is_some_and(|proxy| proxy.renderer_map_id != state.render_runtime().renderer_map_id);
    if update {
        let mut proxy = proxies.entries[index].take().unwrap();
        update_render_proxy_renderer(state, &mut proxy.proxy);
        proxies.entries[index] = Some(proxy);
    }
    return index;
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn get_or_create_render_proxy_2d<'a, S: RenderState>(
    state: &mut S,
    proxies: &'a mut RenderProxies2D<S>,
    source: &NodeRef,
) -> &'a mut RenderProxy2D<S> {
    let id = node_id(source);
    let index = match proxies.by_uid.get(&id).copied() {
        Some(index) => index,
        None => {
            let index = proxies.entries.len();
            proxies
                .entries
                .push(Some(create_render_proxy_2d(state, source)));
            proxies.by_uid.insert(id, index);
            index
        }
    };
    let should_update = proxies.entries[index]
        .as_ref()
        .is_some_and(|proxy| proxy.renderer_map_id != state.render_runtime().renderer_map_id);
    if should_update {
        let mut proxy = proxies.entries[index].take().unwrap();
        update_render_proxy_renderer(state, &mut proxy.proxy);
        proxies.entries[index] = Some(proxy);
    }
    return proxies.entries[index].as_mut().unwrap();
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn get_render_proxy_2d<'a, S: RenderState>(
    proxies: &'a RenderProxies2D<S>,
    source: &NodeRef,
) -> Option<&'a RenderProxy2D<S>> {
    let index = *proxies.by_uid.get(&node_id(source))?;
    return proxies.entries.get(index)?.as_ref();
}

// flight-lint: allow(conform-params) `fn` is a Rust keyword, so the TS callback parameter is named `function`
pub fn install_render_adapt_hook<S: RenderState>(
    state: &mut S,
    function: fn(&mut S, &NodeRef, &mut RenderProxy2D<S>),
) {
    state.render_runtime_mut().render_adapt_hook = Some(function);
}

pub fn is_render_proxy_dirty<S: RenderState>(
    state: &S,
    source: &NodeRef,
    data: &RenderProxy<S>,
    parent_data: Option<&RenderProxy<S>>,
) -> bool {
    let current_frame_id = state.render_runtime().current_frame_id as i64;
    let parent_dirty = parent_data.is_some_and(|parent| {
        parent.transform_frame_id == current_frame_id
            || parent.appearance_frame_id == current_frame_id
    });
    let renderer_dirty = data.renderer.is_some_and(|renderer| {
        renderer
            .is_dirty
            .is_some_and(|is_dirty| is_dirty(state, source, data.renderer_data.as_ref()))
    });
    let (children, parent_reference, local_transform, appearance, local_content) = {
        let source = source.read().unwrap();
        (
            get_node_children_revision(&*source),
            get_node_parent_reference_revision(&*source),
            get_node_local_transform_revision(&*source),
            get_node_appearance_revision(&*source),
            get_node_local_content_revision(&*source),
        )
    };
    let hierarchy_dirty = data.last_children_id != children as i64
        || data.last_parent_reference_id != parent_reference as i64;
    let local_dirty = state.render_state().scene_graph_sync_policy
        == Scene3DGraphSyncPolicy::RefreshDerivedState
        || data.last_local_transform_id != local_transform as i64
        || data.last_appearance_id != appearance as i64
        || data.last_local_content_id != local_content as i64;
    return parent_dirty || renderer_dirty || hierarchy_dirty || local_dirty;
}

pub fn is_render_proxy_visible<S: RenderState>(data: &RenderProxy2D<S>) -> bool {
    return data.visible
        && data.alpha > 0.0
        && !(data.transform_2d.a == 0.0 && data.transform_2d.d == 0.0);
}

fn node_children(source: &NodeRef) -> Vec<NodeRef> {
    return source
        .read()
        .unwrap()
        .node_runtime()
        .children
        .clone()
        .unwrap_or_default();
}

fn node_id(source: &NodeRef) -> u64 {
    return get_entity_id(&*source.read().unwrap());
}

fn node_kind(source: &NodeRef) -> String {
    return source.read().unwrap().node_fields().kind.clone();
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn prepare_scene_2d_render<S: RenderState>(
    state: &mut S,
    proxies: &mut RenderProxies2D<S>,
    source: &NodeRef,
) -> bool {
    return walk_node(state, proxies, source, update_render_proxy_2d::<S>);
}

fn resolve_render_proxy_renderer<S: RenderState>(
    state: &mut S,
    kind: &str,
) -> Option<&'static crate::NodeRenderer<S>> {
    if let Some(renderer) = state
        .render_registries()
        .node_renderers
        .entries
        .get(kind)
        .copied()
    {
        return Some(renderer);
    }
    crate::emit_render_registry_miss(state, RenderRegistryTable::NodeRenderer, kind.to_string());
    return None;
}

pub fn update_node_clip<S: RenderState>(
    _state: &mut S,
    source: &NodeRef,
    data: &mut RenderProxy2D<S>,
    parent_data: Option<&RenderProxy2D<S>>,
) {
    let parent_depth = parent_data.map(|parent| parent.clip_depth).unwrap_or(0);
    let has_clip = source
        .read()
        .unwrap()
        .as_clip_node()
        .is_some_and(|node| node.clip_view().clip.is_some());
    data.clip_depth = parent_depth + u32::from(has_clip);
}

pub fn update_render_proxy_2d<S: RenderState>(
    state: &mut S,
    source: &NodeRef,
    data: &mut RenderProxy2D<S>,
    parent_data: Option<&RenderProxy2D<S>>,
) {
    let parent_reference_id = {
        let source = source.read().unwrap();
        get_node_parent_reference_revision(&*source)
    };
    if data.last_parent_reference_id != parent_reference_id as i64 {
        data.last_appearance_id = -1;
        data.last_local_transform_id = -1;
    }
    update_render_proxy_appearance(
        state,
        &mut data.proxy,
        parent_data.map(|parent| &parent.proxy),
    );
    update_render_proxy_2d_transform(state, data, parent_data);
    update_render_proxy_material(
        state,
        &mut data.proxy,
        parent_data.map(|parent| &parent.proxy),
    );
    if let Some(resolve) = state.render_registries().color_adjustments {
        resolve(
            state,
            &mut data.proxy,
            parent_data.map(|parent| &parent.proxy),
        );
    }
    update_node_clip(state, source, data, parent_data);
    let (children, local_content) = {
        let source = source.read().unwrap();
        (
            get_node_children_revision(&*source),
            get_node_local_content_revision(&*source),
        )
    };
    data.last_children_id = children as i64;
    data.last_local_content_id = local_content as i64;
    data.last_parent_reference_id = parent_reference_id as i64;
    if let Some(adapt) = state.render_runtime().render_adapt_hook {
        adapt(state, source, data);
    }
}

pub fn update_render_proxy_renderer<S: RenderState>(state: &mut S, node: &mut RenderProxy<S>) {
    let renderer = resolve_render_proxy_renderer(state, &node.kind);
    let source_id = node_id(&node.source);
    let renderer_changed = match (node.renderer, renderer) {
        (Some(a), Some(b)) => !std::ptr::eq(a, b),
        (None, None) => false,
        _ => true,
    };
    if renderer_changed || node.renderer_data_source_id != source_id {
        if let Some(data) = node.renderer_data.take()
            && let Some(destroy) = node.renderer.and_then(|value| value.destroy_data)
        {
            destroy(state, data);
        }
        node.renderer = renderer;
        node.renderer_data = renderer.and_then(|value| (value.create_data)(state, &node.source));
        node.renderer_data_source_id = source_id;
    }
    node.renderer_map_id = state.render_runtime().renderer_map_id;
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn walk_node<S: RenderState>(
    state: &mut S,
    proxies: &mut RenderProxies2D<S>,
    root: &NodeRef,
    visit: RenderProxyVisit<S>,
) -> bool {
    if let Some(guard) = state.render_registries().render_root_guard {
        guard(state, root);
    }
    state.render_runtime_mut().current_frame_id =
        state.render_runtime().current_frame_id.wrapping_add(1);
    let mut stack = vec![root.clone()];
    let mut tree_dirty = false;

    while let Some(current) = stack.pop() {
        if !current.read().unwrap().node_fields().enabled {
            continue;
        }
        let parent = if std::sync::Arc::ptr_eq(&current, root) {
            None
        } else {
            get_node_parent(&current)
        };
        let parent_proxy = parent
            .as_ref()
            .and_then(|source| get_render_proxy_2d(proxies, source).map(clone_render_proxy_2d));

        let index = ensure_proxy_index(state, proxies, &current);
        let mut data = proxies.entries[index].take().unwrap();
        if is_render_proxy_dirty(
            state,
            &current,
            &data.proxy,
            parent_proxy.as_ref().map(|parent| &parent.proxy),
        ) {
            visit(state, &current, &mut data, parent_proxy.as_ref());
            tree_dirty = true;
        }
        let visible = is_render_proxy_visible(&data);
        let traverse_children = data.traverse_children;
        proxies.entries[index] = Some(data);
        if !visible || !traverse_children {
            continue;
        }
        for child in node_children(&current).into_iter().rev() {
            stack.push(child);
        }
    }
    return tree_dirty;
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
