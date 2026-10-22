use std::sync::Arc;

use flight_entity::Ref;
use flight_node::contract::NodeRevisionState;
use flight_node::{NodeRef, get_node_parent, get_node_world_bounds_rectangle};
use flight_signals::{connect_signal, disconnect_signal, emit_signal};

use crate::interaction_manager::get_interaction_signals;
use crate::node_interaction_state::{get_node_tab_index, is_node_focusable};
use crate::types::{
    FocusDirection, FocusEventData, FocusManager, FocusManagerOptions, KeyboardEventData,
};

const DIRECTION_EPSILON: f32 = 0.0001;

pub fn create_focus_manager(root: NodeRef, options: &FocusManagerOptions) -> FocusManager {
    return FocusManager {
        focused: None,
        root,
        wrap: options.wrap.unwrap_or(true),
    };
}

pub fn initialize_focus_manager(
    out: &mut FocusManager,
    root: NodeRef,
    options: &FocusManagerOptions,
) {
    out.focused = None;
    out.root = root;
    out.wrap = options.wrap.unwrap_or(true);
}

fn arrow_key_direction(key: &str) -> Option<FocusDirection> {
    return match key {
        "ArrowDown" => Some(FocusDirection::Down),
        "ArrowLeft" => Some(FocusDirection::Left),
        "ArrowRight" => Some(FocusDirection::Right),
        "ArrowUp" => Some(FocusDirection::Up),
        _ => None,
    };
}

// The source's validate, same-target and commit steps, shared by both entries so they cannot drift.
fn begin_focus_transition(manager: &mut FocusManager, node: &Option<NodeRef>) -> FocusTransition {
    if let Some(n) = node
        && !is_node_focusable(n)
    {
        return FocusTransition::Rejected;
    }
    let previous = manager.focused.clone();
    let same = match (&previous, node) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        (None, None) => true,
        _ => false,
    };
    if same {
        return FocusTransition::Unchanged;
    }
    manager.focused = node.clone();
    return FocusTransition::Changed(previous);
}

pub fn clear_focus(manager: &mut FocusManager) {
    set_focused_node(manager, None);
}

fn collect_focus_stops(node: &NodeRef, out: &mut Vec<NodeRef>) {
    {
        let n = node.read().unwrap();
        if !n.node_fields().enabled {
            return;
        }
    }
    if is_node_focusable(node) {
        out.push(node.clone());
    }
    let children: Option<Vec<NodeRef>> = {
        let n = node.read().unwrap();
        n.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for child in &children {
            collect_focus_stops(child, out);
        }
    }
}

// flight-lint: allow(conform-params) D5: returns Arc<dyn Fn> dispose closure; manager is Arc<RwLock> for shared capture by signal slot
// flight-lint: allow(contract-vocabulary) D5: RwLock is required for shared mutable access from signal slot callbacks
pub fn connect_focus_navigation(
    input: &crate::types::FocusNavigationInput,
    manager: Arc<std::sync::RwLock<FocusManager>>,
    options: &crate::types::FocusNavigationOptions,
) -> Arc<dyn Fn() + Send + Sync> {
    let arrow_keys = options.arrow_keys.unwrap_or(false);
    let mgr = manager.clone();
    let slot: Arc<dyn Fn(&KeyboardEventData) + Send + Sync> =
        Arc::new(move |data: &KeyboardEventData| {
            if data.key == "Tab" {
                let mut m = mgr.write().unwrap();
                if data.shift_key {
                    focus_previous_node(&mut m);
                } else {
                    focus_next_node(&mut m);
                }
                return;
            }
            if !arrow_keys {
                return;
            }
            if let Some(direction) = arrow_key_direction(&data.key) {
                let mut m = mgr.write().unwrap();
                focus_node_in_direction(&mut m, direction);
            }
        });
    let slot_id = connect_signal(&input.on_key_down, slot, None);
    let signal = input.on_key_down.clone();
    return Arc::new(move || {
        disconnect_signal(&signal, slot_id);
    });
}

fn direction_score(direction: FocusDirection, ox: f32, oy: f32, cx: f32, cy: f32) -> f32 {
    let dx = cx - ox;
    let dy = cy - oy;
    let (along, perpendicular) = match direction {
        FocusDirection::Right => (dx, dy),
        FocusDirection::Left => (-dx, dy),
        FocusDirection::Down => (dy, dx),
        FocusDirection::Up => (-dy, dx),
    };
    if along <= DIRECTION_EPSILON {
        return f32::INFINITY;
    }
    return along + 2.0 * perpendicular.abs();
}

fn emit_focus_signal(
    target: &NodeRef,
    root: &NodeRef,
    name: FocusSignalName,
    related_target: &Option<NodeRef>,
) {
    let mut data = FocusEventData::new();
    data.related_target = related_target.clone();
    data.target = Some(target.clone());
    let mut current: Option<NodeRef> = Some(target.clone());
    while let Some(ref node) = current {
        data.current_target = Some(node.clone());
        let signals = get_interaction_signals(node);
        if let Some(ref sigs) = signals {
            // Copy the shared signal handle out so no node guard is held while slots run.
            let signal = {
                let sigs_guard = sigs.read().unwrap();
                match name {
                    FocusSignalName::OnFocusIn => sigs_guard.on_focus_in.clone(),
                    FocusSignalName::OnFocusOut => sigs_guard.on_focus_out.clone(),
                }
            };
            emit_signal(&signal, &data);
        }
        if Arc::ptr_eq(node, root) {
            break;
        }
        current = get_node_parent(node);
    }
}

pub fn focus_next_node(manager: &mut FocusManager) -> Option<NodeRef> {
    return step_focus(manager, 1);
}

pub fn focus_node_in_direction(
    manager: &mut FocusManager,
    direction: FocusDirection,
) -> Option<NodeRef> {
    let current = match &manager.focused {
        Some(n) => n.clone(),
        None => return None,
    };
    let order = get_focus_order(manager);
    let mut revisions = NodeRevisionState::default();
    let current_bounds = get_node_world_bounds_rectangle(&current, &mut revisions);
    let origin_x = current_bounds.x + current_bounds.width / 2.0;
    let origin_y = current_bounds.y + current_bounds.height / 2.0;
    let mut best: Option<NodeRef> = None;
    let mut best_score = f32::INFINITY;
    for candidate in &order {
        if Arc::ptr_eq(candidate, &current) {
            continue;
        }
        let cand_bounds = get_node_world_bounds_rectangle(candidate, &mut revisions);
        let cx = cand_bounds.x + cand_bounds.width / 2.0;
        let cy = cand_bounds.y + cand_bounds.height / 2.0;
        let score = direction_score(direction, origin_x, origin_y, cx, cy);
        if score < best_score {
            best_score = score;
            best = Some(candidate.clone());
        }
    }
    if let Some(ref node) = best {
        set_focused_node(manager, Some(node.clone()));
    }
    return best;
}

fn focus_order_key(node: &NodeRef) -> f32 {
    let tab_index = get_node_tab_index(node);
    if tab_index < 0 {
        return f32::INFINITY;
    }
    return tab_index as f32;
}

pub fn focus_previous_node(manager: &mut FocusManager) -> Option<NodeRef> {
    return step_focus(manager, -1);
}

// flight-lint: allow(conform-params) D5: returns Vec instead of out-parameter for Rust ergonomics
pub fn get_focus_order(manager: &FocusManager) -> Vec<NodeRef> {
    let mut out = Vec::new();
    collect_focus_stops(&manager.root, &mut out);
    out.sort_by(|a, b| focus_order_key(a).partial_cmp(&focus_order_key(b)).unwrap());
    return out;
}

pub fn get_focused_node(manager: &FocusManager) -> Option<NodeRef> {
    return manager.focused.clone();
}

pub fn is_node_focused(manager: &FocusManager, node: &NodeRef) -> bool {
    return match &manager.focused {
        Some(f) => Arc::ptr_eq(f, node),
        None => false,
    };
}

pub fn set_focused_node(manager: &mut FocusManager, node: Option<NodeRef>) -> bool {
    let previous = match begin_focus_transition(manager, &node) {
        FocusTransition::Rejected => return false,
        FocusTransition::Unchanged => return true,
        FocusTransition::Changed(previous) => previous,
    };
    if let Some(ref prev) = previous {
        emit_focus_signal(prev, &manager.root, FocusSignalName::OnFocusOut, &node);
    }
    if let Some(ref new_node) = node {
        emit_focus_signal(
            new_node,
            &manager.root,
            FocusSignalName::OnFocusIn,
            &previous,
        );
    }
    return true;
}

/// `set_focused_node` for a manager shared with its own focus callbacks (TS `setFocusedNode`). The
/// manager guard is held only to validate and commit the new target and to read the root for each
/// emission; it is released before any callback runs, so a callback may read the manager or re-enter
/// any focus function. As in the source, nothing is written after the callbacks: a nested focus
/// change made by a callback is the final state.
// flight-lint: allow(conform-extra) D5 native shared-Ref projection of TS setFocusedNode: callbacks reach the canonical manager handle, so no guard may span them
pub fn set_focused_node_ref(manager: &Ref<FocusManager>, node: Option<NodeRef>) -> bool {
    let previous = {
        let mut guard = manager.write().unwrap();
        match begin_focus_transition(&mut guard, &node) {
            FocusTransition::Rejected => return false,
            FocusTransition::Unchanged => return true,
            FocusTransition::Changed(previous) => previous,
        }
    };
    if let Some(ref prev) = previous {
        let root = manager.read().unwrap().root.clone();
        emit_focus_signal(prev, &root, FocusSignalName::OnFocusOut, &node);
    }
    if let Some(ref new_node) = node {
        let root = manager.read().unwrap().root.clone();
        emit_focus_signal(new_node, &root, FocusSignalName::OnFocusIn, &previous);
    }
    return true;
}

fn step_focus(manager: &mut FocusManager, delta: i32) -> Option<NodeRef> {
    let order = get_focus_order(manager);
    if order.is_empty() {
        return None;
    }
    let current = &manager.focused;
    let from = match current {
        Some(c) => order.iter().position(|n| Arc::ptr_eq(n, c)),
        None => None,
    };
    let index = match from {
        None => {
            if delta > 0 {
                0
            } else {
                order.len() - 1
            }
        }
        Some(f) => {
            let next = f as i32 + delta;
            if next < 0 || next >= order.len() as i32 {
                if !manager.wrap {
                    return None;
                }
                ((next + order.len() as i32) % order.len() as i32) as usize
            } else {
                next as usize
            }
        }
    };
    let next = order[index].clone();
    set_focused_node(manager, Some(next.clone()));
    return Some(next);
}

enum FocusTransition {
    Changed(Option<NodeRef>),
    Rejected,
    Unchanged,
}

enum FocusSignalName {
    OnFocusIn,
    OnFocusOut,
}
