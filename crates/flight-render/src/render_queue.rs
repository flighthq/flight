use flight_entity::{allocate_entity, get_entity_id};
use flight_node::NodeRef;

use crate::{
    RenderProxies2D, RenderProxy, RenderQueue, RenderQueueEntry, RenderSortKey, RenderState,
    get_render_proxy_2d,
};

pub fn create_render_queue() -> RenderQueue {
    let mut out: RenderQueue = allocate_entity();
    initialize_render_queue(&mut out);
    return out;
}

pub fn initialize_render_queue(out: &mut RenderQueue) {
    out.entries.clear();
    out.entry_count = 0;
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn build_render_queue<S: RenderState>(
    _state: &S,
    proxies: &RenderProxies2D<S>,
    source: &NodeRef,
    out: &mut RenderQueue,
) {
    clear_render_queue(out);
    let mut stack = vec![source.clone()];
    let mut scene_order = 0;
    while let Some(current) = stack.pop() {
        let Some(proxy) = get_render_proxy_2d(proxies, &current) else {
            continue;
        };
        if !proxy.visible {
            continue;
        }
        if proxy.renderer.is_some() {
            push_render_queue_entry(out, &proxy.proxy, scene_order);
        }
        scene_order += 1;
        let children = current
            .read()
            .unwrap()
            .node_runtime()
            .children
            .clone()
            .unwrap_or_default();
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }
}

pub fn clear_render_queue(queue: &mut RenderQueue) {
    queue.entry_count = 0;
}

pub fn compare_render_queue_entries(a: &RenderQueueEntry, b: &RenderQueueEntry) -> i32 {
    return a.sort_key - b.sort_key;
}

pub fn pack_render_sort_key(layer: i32, depth: f32, is_transparent: bool) -> RenderSortKey {
    let layer_bits = layer.clamp(0, 32767) << 16;
    let transparent_bit = if is_transparent { 1 << 15 } else { 0 };
    let depth_bits = (depth * 32767.0).round().clamp(0.0, 32767.0) as i32 & 0x7fff;
    return layer_bits | transparent_bit | depth_bits;
}

pub fn push_render_queue_entry<S: RenderState>(
    queue: &mut RenderQueue,
    proxy: &RenderProxy<S>,
    sort_key: RenderSortKey,
) {
    let entry = RenderQueueEntry {
        proxy: get_entity_id(proxy),
        sort_key,
    };
    if queue.entry_count < queue.entries.len() {
        queue.entries[queue.entry_count] = entry;
    } else {
        queue.entries.push(entry);
    }
    queue.entry_count += 1;
}

pub fn sort_render_queue(
    queue: &mut RenderQueue,
    compare: Option<fn(&RenderQueueEntry, &RenderQueueEntry) -> i32>,
) {
    let compare = compare.unwrap_or(compare_render_queue_entries);
    queue.entries[..queue.entry_count].sort_by(|a, b| compare(a, b).cmp(&0));
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
