//! Reusable child ordering over the node graph (TS `nodeOrderList.ts`).

use std::cmp::Ordering;
use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_signals::emit_signal;

use crate::types::*;

/// Allocates an empty order list (TS `createNodeOrderList`).
pub fn create_node_order_list() -> NodeOrderList {
    let mut out: NodeOrderList = allocate_entity();
    initialize_node_order_list(&mut out);
    return out;
}

/// Resets a list to its empty valid window (TS `initializeNodeOrderList`).
pub fn initialize_node_order_list(out: &mut NodeOrderList) {
    out.entry_count = 0;
    out.nodes = Vec::new();
    out.sort_keys = Vec::new();
}

/// Appends one entry to the valid window, reusing capacity past `entry_count` (TS
/// `addNodeOrderListEntry`). It does not check whether `node` is already entered.
// flight-lint: allow(f64) D1: the sort key is the source JS number, preserved exactly for ordering and subtraction
pub fn add_node_order_list_entry(list: &mut NodeOrderList, node: &NodeRef, sort_key: f64) {
    let entry_count = list.entry_count;
    if entry_count < list.nodes.len() {
        list.nodes[entry_count] = node.clone();
        list.sort_keys[entry_count] = sort_key;
    } else {
        list.nodes.push(node.clone());
        list.sort_keys.push(sort_key);
    }
    list.entry_count = entry_count + 1;
}

/// Reorders `target`'s existing children so the list's members sit in ascending sort-key order
/// (TS `applyNodeOrderList`). Membership is never changed: members are permuted among the slots
/// they already occupy, and entries that are not children of `target` are ignored.
pub fn apply_node_order_list(target: &NodeRef, list: &NodeOrderList) {
    let children = {
        let guard = target.read().unwrap();
        guard.node_runtime().children.clone()
    };
    let Some(children) = children else {
        return;
    };
    if list.entry_count == 0 {
        return;
    }
    let mut members: Vec<usize> = Vec::new();
    let mut slots: Vec<usize> = Vec::new();
    for (slot, child) in children.iter().enumerate() {
        if let Some(entry) = find_node_order_list_entry_index(list, child) {
            slots.push(slot);
            members.push(entry);
        }
    }
    if members.len() < 2 {
        return;
    }
    members.sort_by(|left, right| {
        let left_key = list.sort_keys[*left];
        let right_key = list.sort_keys[*right];
        if left_key != right_key {
            return left_key.partial_cmp(&right_key).unwrap_or(Ordering::Equal);
        }
        return left.cmp(right);
    });
    let mut reordered = children.clone();
    let mut moved = false;
    for (index, slot) in slots.iter().enumerate() {
        let member = &list.nodes[members[index]];
        if !Arc::ptr_eq(&reordered[*slot], member) {
            reordered[*slot] = member.clone();
            moved = true;
        }
    }
    if !moved {
        return;
    }
    let signal = {
        let mut guard = target.write().unwrap();
        let runtime = guard.node_runtime_mut();
        runtime.children = Some(reordered);
        runtime.children_id = runtime.children_id.wrapping_add(1);
        runtime.node_signals.clone()
    };
    if let Some(signals) = signal {
        emit_signal(&signals.read().unwrap().on_children_order_changed, &());
    }
}

/// Empties the valid window without releasing capacity or references (TS `clearNodeOrderList`).
pub fn clear_node_order_list(list: &mut NodeOrderList) {
    list.entry_count = 0;
}

/// Empties the list and releases its node references (TS `disposeNodeOrderList`).
pub fn dispose_node_order_list(list: &mut NodeOrderList) {
    list.entry_count = 0;
    list.nodes.clear();
    list.sort_keys.clear();
}

/// Scans backwards so a node entered more than once reports the entry that wins at apply time.
fn find_node_order_list_entry_index(list: &NodeOrderList, node: &NodeRef) -> Option<usize> {
    let mut index = list.entry_count;
    while index > 0 {
        index -= 1;
        if Arc::ptr_eq(&list.nodes[index], node) {
            return Some(index);
        }
    }
    return None;
}

/// Calls `callback` for each entry in entry order; `false` stops early (TS
/// `forEachNodeOrderListEntry`).
// flight-lint: allow(f64) D1: entries expose the source JS-number sort key unchanged
pub fn for_each_node_order_list_entry(
    list: &NodeOrderList,
    callback: &mut dyn FnMut(&NodeRef, f64, usize) -> bool,
) {
    let mut index = 0;
    while index < list.entry_count {
        if !callback(&list.nodes[index], list.sort_keys[index], index) {
            return;
        }
        index += 1;
    }
}

/// The sort key `node` is entered with, or `None` when it has no entry (TS
/// `getNodeOrderListEntrySortKey`).
// flight-lint: allow(f64) D1: the source returns the JS-number sort key or null
pub fn get_node_order_list_entry_sort_key(list: &NodeOrderList, node: &NodeRef) -> Option<f64> {
    return find_node_order_list_entry_index(list, node).map(|index| list.sort_keys[index]);
}

/// Whether `node` has an entry (TS `hasNodeOrderListEntry`).
pub fn has_node_order_list_entry(list: &NodeOrderList, node: &NodeRef) -> bool {
    return find_node_order_list_entry_index(list, node).is_some();
}

/// Shared by the above/below verbs: `node` takes `target`'s sort key and its entry lands on the
/// named side of `target`'s.
fn insert_node_order_list_entry_beside(
    list: &mut NodeOrderList,
    node: &NodeRef,
    target: &NodeRef,
    offset: usize,
) {
    if Arc::ptr_eq(node, target) {
        return;
    }
    if find_node_order_list_entry_index(list, target).is_none() {
        return;
    }
    if let Some(existing) = find_node_order_list_entry_index(list, node) {
        remove_node_order_list_entry_at_index(list, existing);
    }
    let target_index = find_node_order_list_entry_index(list, target).unwrap();
    let sort_key = list.sort_keys[target_index];
    let at = target_index + offset;
    add_node_order_list_entry(list, node, sort_key);
    let mut index = list.entry_count - 1;
    while index > at {
        list.nodes[index] = list.nodes[index - 1].clone();
        list.sort_keys[index] = list.sort_keys[index - 1];
        index -= 1;
    }
    list.nodes[at] = node.clone();
    list.sort_keys[at] = sort_key;
}

/// Removes `node`'s entry, shifting later entries down (TS `removeNodeOrderListEntry`).
pub fn remove_node_order_list_entry(list: &mut NodeOrderList, node: &NodeRef) -> bool {
    let Some(index) = find_node_order_list_entry_index(list, node) else {
        return false;
    };
    remove_node_order_list_entry_at_index(list, index);
    return true;
}

fn remove_node_order_list_entry_at_index(list: &mut NodeOrderList, index: usize) {
    let last = list.entry_count - 1;
    let mut position = index;
    while position < last {
        list.nodes[position] = list.nodes[position + 1].clone();
        list.sort_keys[position] = list.sort_keys[position + 1];
        position += 1;
    }
    list.entry_count = last;
}

/// Enters `node` at `sort_key`, replacing an existing entry in place (TS
/// `setNodeOrderListEntry`).
// flight-lint: allow(f64) D1: re-keying assigns the source JS-number sort key
pub fn set_node_order_list_entry(list: &mut NodeOrderList, node: &NodeRef, sort_key: f64) {
    let Some(index) = find_node_order_list_entry_index(list, node) else {
        add_node_order_list_entry(list, node, sort_key);
        return;
    };
    list.sort_keys[index] = sort_key;
}

/// Enters `node` immediately above `target`; does nothing when `target` has no entry (TS
/// `setNodeOrderListEntryAbove`).
pub fn set_node_order_list_entry_above(list: &mut NodeOrderList, node: &NodeRef, target: &NodeRef) {
    insert_node_order_list_entry_beside(list, node, target, 1);
}

/// Enters `node` immediately below `target`; does nothing when `target` has no entry (TS
/// `setNodeOrderListEntryBelow`).
pub fn set_node_order_list_entry_below(list: &mut NodeOrderList, node: &NodeRef, target: &NodeRef) {
    insert_node_order_list_entry_beside(list, node, target, 0);
}

/// Refills the list from `source`'s current children, each entered at its child index (TS
/// `setNodeOrderListFromNodeChildren`).
// flight-lint: allow(f64) D1: child indices become source JS-number sort keys
pub fn set_node_order_list_from_node_children(list: &mut NodeOrderList, source: &NodeRef) {
    list.entry_count = 0;
    let children = {
        let guard = source.read().unwrap();
        guard.node_runtime().children.clone()
    };
    let Some(children) = children else {
        return;
    };
    for (index, child) in children.iter().enumerate() {
        add_node_order_list_entry(list, child, index as f64);
    }
}

/// Exchanges the sort keys of two entered nodes (TS `swapNodeOrderListEntries`).
pub fn swap_node_order_list_entries(list: &mut NodeOrderList, node_a: &NodeRef, node_b: &NodeRef) {
    let Some(index_a) = find_node_order_list_entry_index(list, node_a) else {
        return;
    };
    let Some(index_b) = find_node_order_list_entry_index(list, node_b) else {
        return;
    };
    let sort_key_a = list.sort_keys[index_a];
    list.sort_keys[index_a] = list.sort_keys[index_b];
    list.sort_keys[index_b] = sort_key_a;
}
