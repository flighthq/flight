use flight_entity::get_entity_id;
use flight_node::{NodeRef, invalidate_node_appearance};

use crate::{RenderProxy2D, RenderProxyAdapter, RenderState, install_render_adapt_hook};

pub fn apply_render_proxy_adapter<S: RenderState>(
    state: &mut S,
    source: &NodeRef,
    data: &mut RenderProxy2D<S>,
) {
    let adapter = get_render_proxy_adapter(state, source);
    let mut traverse_children = true;
    if let Some(adapter) = adapter {
        let mut adapter = adapter.write().unwrap();
        let adapt = adapter.adapt;
        if let Some(result) = adapt(&mut adapter, state, source, data) {
            traverse_children = result;
            crate::update_render_proxy_renderer(state, &mut data.proxy);
        }
    }
    data.traverse_children = traverse_children;
}

pub fn get_render_proxy_adapter<S: RenderState>(
    state: &S,
    source: &NodeRef,
) -> Option<flight_entity::Ref<RenderProxyAdapter<S>>> {
    return state
        .render_runtime()
        .render_proxy_adapter_map
        .get(&node_id(source))
        .cloned();
}

fn node_id(source: &NodeRef) -> u64 {
    return get_entity_id(&*source.read().unwrap());
}

pub fn set_render_proxy_adapter<S: RenderState>(
    state: &mut S,
    source: &NodeRef,
    adapter: Option<flight_entity::Ref<RenderProxyAdapter<S>>>,
) {
    let expected: fn(&mut S, &NodeRef, &mut RenderProxy2D<S>) = apply_render_proxy_adapter::<S>;
    let installed = state.render_runtime().render_adapt_hook;
    if !installed.is_some_and(|hook| std::ptr::fn_addr_eq(hook, expected)) {
        install_render_adapt_hook(state, expected);
    }
    let id = node_id(source);
    if let Some(adapter) = adapter {
        state
            .render_runtime_mut()
            .render_proxy_adapter_map
            .insert(id, adapter);
    } else {
        state
            .render_runtime_mut()
            .render_proxy_adapter_map
            .remove(&id);
    }
    invalidate_node_appearance(source);
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
