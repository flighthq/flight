use std::sync::{Arc, RwLock};

use flight_entity::UnknownValue;
use flight_node::NodeRef;

use crate::types::{Cursor, HitArea, NodeInteractionState};

// flight-lint: allow(contract-vocabulary) D5: NodeInteractionState stored in Unknown slot requires Arc<RwLock> for shared mutable access
pub type NodeInteractionStateRef = Arc<RwLock<NodeInteractionState>>;

pub fn create_node_interaction_state() -> NodeInteractionState {
    let mut out = NodeInteractionState {
        children_hit_test_enabled: true,
        cursor: None,
        focusable: false,
        hit_area: None,
        hit_test_enabled: false,
        pointer_double_click_enabled: false,
        tab_index: -1,
    };
    initialize_node_interaction_state(&mut out);
    return out;
}

pub fn initialize_node_interaction_state(out: &mut NodeInteractionState) {
    out.children_hit_test_enabled = true;
    out.cursor = None;
    out.focusable = false;
    out.hit_area = None;
    out.hit_test_enabled = false;
    out.pointer_double_click_enabled = false;
    out.tab_index = -1;
}

pub fn are_node_children_hit_test_enabled(source: &NodeRef) -> bool {
    return match get_node_interaction_state(source) {
        Some(s) => s.read().unwrap().children_hit_test_enabled,
        None => true,
    };
}

pub fn enable_node_interaction_state(source: &NodeRef) -> NodeInteractionStateRef {
    let existing = get_node_interaction_state(source);
    if let Some(state) = existing {
        return state;
    }
    let state: NodeInteractionStateRef = Arc::new(RwLock::new(create_node_interaction_state()));
    let mut node = source.write().unwrap();
    let runtime = node.node_runtime_mut();
    runtime.interaction_state = Some(Arc::new(state.clone()) as UnknownValue);
    return state;
}

pub fn get_node_cursor(source: &NodeRef) -> Option<Cursor> {
    return get_node_interaction_state(source).and_then(|s| s.read().unwrap().cursor.clone());
}

pub fn get_node_hit_area(source: &NodeRef) -> Option<NodeInteractionStateRef> {
    let state = get_node_interaction_state(source);
    return match &state {
        Some(s) if s.read().unwrap().hit_area.is_some() => state,
        _ => None,
    };
}

// flight-lint: allow(conform-extra) L13: Rust-side predicate for callers that only need has/has-not
pub fn get_node_hit_area_is_some(source: &NodeRef) -> bool {
    return get_node_interaction_state(source)
        .map_or(false, |s| s.read().unwrap().hit_area.is_some());
}

pub fn get_node_interaction_state(source: &NodeRef) -> Option<NodeInteractionStateRef> {
    let node = source.read().unwrap();
    let runtime = node.node_runtime();
    return runtime
        .interaction_state
        .as_ref()
        .and_then(|u| u.downcast_ref::<NodeInteractionStateRef>())
        .cloned();
}

pub fn get_node_tab_index(source: &NodeRef) -> i32 {
    return get_node_interaction_state(source).map_or(-1, |s| s.read().unwrap().tab_index);
}

pub fn is_node_focusable(source: &NodeRef) -> bool {
    return get_node_interaction_state(source).map_or(false, |s| s.read().unwrap().focusable);
}

pub fn is_node_hit_test_enabled(source: &NodeRef) -> bool {
    return get_node_interaction_state(source)
        .map_or(false, |s| s.read().unwrap().hit_test_enabled);
}

pub fn is_node_pointer_double_click_enabled(source: &NodeRef) -> bool {
    return get_node_interaction_state(source)
        .map_or(false, |s| s.read().unwrap().pointer_double_click_enabled);
}

pub fn set_node_children_hit_test_enabled(source: &NodeRef, enabled: bool) {
    enable_node_interaction_state(source)
        .write()
        .unwrap()
        .children_hit_test_enabled = enabled;
}

pub fn set_node_cursor(source: &NodeRef, cursor: Option<Cursor>) {
    enable_node_interaction_state(source)
        .write()
        .unwrap()
        .cursor = cursor;
}

pub fn set_node_focusable(source: &NodeRef, focusable: bool) {
    enable_node_interaction_state(source)
        .write()
        .unwrap()
        .focusable = focusable;
}

pub fn set_node_hit_area(source: &NodeRef, hit_area: Option<HitArea>) {
    enable_node_interaction_state(source)
        .write()
        .unwrap()
        .hit_area = hit_area;
}

pub fn set_node_hit_test_enabled(source: &NodeRef, enabled: bool) {
    enable_node_interaction_state(source)
        .write()
        .unwrap()
        .hit_test_enabled = enabled;
}

pub fn set_node_pointer_double_click_enabled(source: &NodeRef, enabled: bool) {
    enable_node_interaction_state(source)
        .write()
        .unwrap()
        .pointer_double_click_enabled = enabled;
}

pub fn set_node_tab_index(source: &NodeRef, tab_index: i32) {
    enable_node_interaction_state(source)
        .write()
        .unwrap()
        .tab_index = tab_index;
}
