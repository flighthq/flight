//! flight-compiler: nullable-options

use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_node::NodeRef;
use flight_signals::{create_signal, emit_signal};

use crate::selection_compat::SelectionSignals;
use crate::types::*;

#[cfg(test)]
/// flight-compiler: rust-only — Rust-only extension-method parity tests.
mod sugar_tests {
    use std::any::Any;
    use std::sync::{Arc, RwLock};

    use flight_entity::{Entity, EntityRuntimeSlot};
    use flight_node::{Node, NodeFields, NodeRef, create_node};

    use super::*;

    #[derive(Default)]
    struct TestNode {
        fields: NodeFields,
    }

    impl Entity for TestNode {
        fn entity_runtime(&self) -> &EntityRuntimeSlot {
            return self.fields.entity_runtime();
        }

        fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
            return self.fields.entity_runtime_mut();
        }
    }

    impl Node for TestNode {
        fn node_fields(&self) -> &NodeFields {
            return &self.fields;
        }

        fn node_fields_mut(&mut self) -> &mut NodeFields {
            return &mut self.fields;
        }

        fn as_any(&self) -> &dyn Any {
            return self;
        }

        fn as_any_mut(&mut self) -> &mut dyn Any {
            return self;
        }
    }

    fn node(name: &str) -> NodeRef {
        let node: TestNode = create_node(name.to_string());
        return Arc::new(RwLock::new(node));
    }

    fn selected_of(state: &SelectionState) -> Vec<NodeRef> {
        let mut out = Vec::new();
        get_selected_nodes_core(&mut out, state);
        return out;
    }

    fn method_selected(state: &SelectionState) -> Vec<NodeRef> {
        let mut out = Vec::new();
        state.selected_nodes(&mut out);
        return out;
    }

    fn same_nodes(a: &[NodeRef], b: &[NodeRef]) -> bool {
        return a.len() == b.len() && a.iter().zip(b).all(|(a, b)| Arc::ptr_eq(a, b));
    }

    #[test]
    fn selection_state_active_node_matches_get_active_node() {
        let state = SelectionState::new();
        let selected = node("selected");
        select_node_core(&state, &selected);
        assert!(same_optional_node(
            &state.active_node(),
            &get_active_node_core(&state)
        ));
    }

    #[test]
    fn selection_state_add_node_matches_add_node_to_selection() {
        let a = SelectionState::new();
        let b = create_selection_state_core();
        let selected = node("selected");
        a.add_node(&selected);
        add_node_to_selection_core(&b, &selected);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_clear_matches_clear_selection() {
        let a = SelectionState::new();
        let b = create_selection_state_core();
        let selected = node("selected");
        select_node_core(&a, &selected);
        select_node_core(&b, &selected);
        a.clear();
        clear_selection_core(&b);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_has_selection_matches_has_selection() {
        let state = SelectionState::new();
        assert_eq!(state.has_selection(), has_selection_core(&state));
    }

    #[test]
    fn selection_state_is_node_selected_matches_is_node_selected() {
        let state = SelectionState::new();
        let selected = node("selected");
        select_node_core(&state, &selected);
        assert_eq!(
            state.is_node_selected(&selected),
            is_node_selected_core(&state, &selected)
        );
    }

    #[test]
    fn selection_state_new_matches_create_selection_state() {
        let a = SelectionState::new();
        let b = create_selection_state_core();
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_remove_node_matches_remove_node_from_selection() {
        let a = SelectionState::new();
        let b = create_selection_state_core();
        let selected = node("selected");
        select_node_core(&a, &selected);
        select_node_core(&b, &selected);
        a.remove_node(&selected);
        remove_node_from_selection_core(&b, &selected);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_select_all_nodes_matches_select_all_nodes() {
        let a = SelectionState::new();
        let b = create_selection_state_core();
        let first = node("first");
        let second = node("second");
        let candidates = vec![first, second];
        a.select_all_nodes(&candidates);
        select_all_nodes_core(&b, &candidates);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_select_node_matches_select_node() {
        let a = SelectionState::new();
        let b = create_selection_state_core();
        let selected = node("selected");
        a.select_node(&selected);
        select_node_core(&b, &selected);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_selected_nodes_matches_get_selected_nodes() {
        let state = SelectionState::new();
        assert!(same_nodes(&method_selected(&state), &selected_of(&state)));
    }

    #[test]
    fn selection_state_selection_count_matches_get_selection_count() {
        let state = SelectionState::new();
        assert_eq!(state.selection_count(), get_selection_count_core(&state));
    }

    #[test]
    fn selection_state_signals_matches_get_selection_signals() {
        let state = SelectionState::new();
        let method = state.signals();
        let free = get_selection_signals_core(&state);
        assert!(Arc::ptr_eq(&method.on_change.data, &free.on_change.data));
        assert!(Arc::ptr_eq(
            &method.on_active_change.data,
            &free.on_active_change.data
        ));
    }

    #[test]
    fn selection_state_toggle_node_matches_toggle_node_selection() {
        let a = SelectionState::new();
        let b = create_selection_state_core();
        let selected = node("selected");
        a.toggle_node(&selected);
        toggle_node_selection_core(&b, &selected);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }
}

pub fn create_selection_state_core() -> SelectionState {
    let mut out: SelectionState = allocate_entity();
    initialize_selection_state_core(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction initializer required by the Rust IR
pub fn initialize_selection_state_core(out: &mut SelectionState) {
    out.state = flight_entity::Ref::new(std::sync::RwLock::new(SelectionStateRuntime {
        active_node: None,
        selected_node_set: Vec::new(),
        selected_nodes: Vec::new(),
        signals: SelectionSignals {
            on_active_change: create_signal(),
            on_change: create_signal(),
        },
    }));
}

struct SelectionMutation {
    previous_active_node: Option<NodeRef>,
}

struct SelectionChangeEvent {
    selected_nodes: Vec<NodeRef>,
}

struct ActiveChangeEvent {
    active_node: Option<NodeRef>,
}

fn add_node_mutation(
    runtime: &mut SelectionStateRuntime,
    node: &NodeRef,
) -> Option<SelectionMutation> {
    if contains_node(&runtime.selected_node_set, node) {
        return None;
    }
    let previous_active_node = runtime.active_node.clone();
    runtime.selected_nodes.push(node.clone());
    runtime.selected_node_set.push(node.clone());
    runtime.active_node = Some(node.clone());
    return Some(SelectionMutation {
        previous_active_node,
    });
}

fn clear_selection_mutation(runtime: &mut SelectionStateRuntime) -> Option<SelectionMutation> {
    if runtime.selected_nodes.is_empty() {
        return None;
    }
    let previous_active_node = runtime.active_node.clone();
    runtime.selected_nodes.clear();
    runtime.selected_node_set.clear();
    runtime.active_node = None;
    return Some(SelectionMutation {
        previous_active_node,
    });
}

pub fn add_node_to_selection_core(state: &SelectionState, node: &NodeRef) {
    let mutation = add_node_mutation(&mut state.state.write().unwrap(), node);
    if mutation.is_none() {
        return;
    }
    emit_selection_changes(state, mutation.unwrap().previous_active_node);
}

pub fn clear_selection_core(state: &SelectionState) {
    let mutation = clear_selection_mutation(&mut state.state.write().unwrap());
    if mutation.is_none() {
        return;
    }
    emit_selection_changes(state, mutation.unwrap().previous_active_node);
}

fn contains_node(nodes: &[NodeRef], node: &NodeRef) -> bool {
    return nodes.iter().any(|selected| Arc::ptr_eq(selected, node));
}

fn last_node(nodes: &[NodeRef]) -> Option<NodeRef> {
    if nodes.is_empty() {
        return None;
    }
    return Some(nodes[nodes.len() - 1].clone());
}

fn emit_selection_changes(state: &SelectionState, previous_active_node: Option<NodeRef>) {
    let change_event: Option<SelectionChangeEvent> = {
        let runtime = state.state.read().unwrap();
        let selected_nodes: &Vec<NodeRef> = &runtime.selected_nodes;
        if runtime.signals.on_change.data.read().unwrap().is_some() {
            Some(SelectionChangeEvent {
                selected_nodes: selected_nodes.clone(),
            })
        } else {
            None
        }
    };
    if let Some(event) = change_event {
        let signals = get_selection_signals_core(state);
        emit_signal(&signals.on_change, &event.selected_nodes);
    }

    let active_event: Option<ActiveChangeEvent> = {
        let runtime = state.state.read().unwrap();
        if same_optional_node(&previous_active_node, &runtime.active_node) {
            None
        } else {
            Some(ActiveChangeEvent {
                active_node: runtime.active_node.clone(),
            })
        }
    };
    if let Some(event) = active_event {
        let signals = get_selection_signals_core(state);
        emit_signal(&signals.on_active_change, &event.active_node);
    }
}

pub fn get_active_node_core(state: &SelectionState) -> Option<NodeRef> {
    return state.state.read().unwrap().active_node.clone();
}

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the selection fills a caller-owned out, cleared first
pub fn get_selected_nodes_core(out: &mut Vec<NodeRef>, state: &SelectionState) {
    out.clear();
    let selected_nodes = state.state.read().unwrap().selected_nodes.clone();
    for node in selected_nodes {
        out.push(node);
    }
}

pub fn get_selection_count_core(state: &SelectionState) -> usize {
    return state.state.read().unwrap().selected_nodes.len();
}

pub fn get_selection_signals_core(state: &SelectionState) -> SelectionSignals {
    return state.state.read().unwrap().signals.clone();
}

pub fn has_selection_core(state: &SelectionState) -> bool {
    return !state.state.read().unwrap().selected_nodes.is_empty();
}

pub fn is_node_selected_core(state: &SelectionState, node: &NodeRef) -> bool {
    return contains_node(&state.state.read().unwrap().selected_node_set, node);
}

fn remove_node_mutation(
    runtime: &mut SelectionStateRuntime,
    node: &NodeRef,
) -> Option<SelectionMutation> {
    if !contains_node(&runtime.selected_node_set, node) {
        return None;
    }
    let previous_active_node = runtime.active_node.clone();
    let selected_node_set: &mut Vec<NodeRef> = &mut runtime.selected_node_set;
    selected_node_set.retain(|selected| !Arc::ptr_eq(selected, node));
    let selected_nodes: &mut Vec<NodeRef> = &mut runtime.selected_nodes;
    selected_nodes.retain(|selected| !Arc::ptr_eq(selected, node));
    if same_optional_node(&runtime.active_node, &Some(node.clone())) {
        runtime.active_node = last_node(&runtime.selected_nodes);
    }
    return Some(SelectionMutation {
        previous_active_node,
    });
}

pub fn remove_node_from_selection_core(state: &SelectionState, node: &NodeRef) {
    let mutation = remove_node_mutation(&mut state.state.write().unwrap(), node);
    if mutation.is_none() {
        return;
    }
    emit_selection_changes(state, mutation.unwrap().previous_active_node);
}

fn same_node_list(a: &[NodeRef], b: &[NodeRef]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    for index in 0..a.len() {
        if !Arc::ptr_eq(&a[index], &b[index]) {
            return false;
        }
    }
    return true;
}

fn same_optional_node(a: &Option<NodeRef>, b: &Option<NodeRef>) -> bool {
    if let Some(a_node) = a {
        if let Some(b_node) = b {
            return Arc::ptr_eq(a_node, b_node);
        }
        return false;
    }
    return b.is_none();
}

fn replace_selection_mutation(
    runtime: &mut SelectionStateRuntime,
    selected_nodes: Vec<NodeRef>,
) -> Option<SelectionMutation> {
    if same_node_list(&runtime.selected_nodes, &selected_nodes) {
        return None;
    }
    let previous_active_node = runtime.active_node.clone();
    runtime.selected_node_set = selected_nodes.clone();
    runtime.selected_nodes = selected_nodes;
    runtime.active_node = last_node(&runtime.selected_nodes);
    return Some(SelectionMutation {
        previous_active_node,
    });
}

pub fn select_all_nodes_core(state: &SelectionState, candidates: &[NodeRef]) {
    let mut selected_nodes: Vec<NodeRef> = Vec::new();
    for candidate in candidates {
        if !contains_node(&selected_nodes, candidate) {
            selected_nodes.push(candidate.clone());
        }
    }

    let mutation = replace_selection_mutation(&mut state.state.write().unwrap(), selected_nodes);
    if mutation.is_none() {
        return;
    }
    emit_selection_changes(state, mutation.unwrap().previous_active_node);
}

pub fn select_node_core(state: &SelectionState, node: &NodeRef) {
    let mutation =
        replace_selection_mutation(&mut state.state.write().unwrap(), vec![node.clone()]);
    if mutation.is_none() {
        return;
    }
    emit_selection_changes(state, mutation.unwrap().previous_active_node);
}

pub fn toggle_node_selection_core(state: &SelectionState, node: &NodeRef) {
    if is_node_selected_core(state, node) {
        remove_node_from_selection_core(state, node);
    } else {
        add_node_to_selection_core(state, node);
    }
}

impl SelectionState {
    pub fn new() -> Self {
        return create_selection_state_core();
    }

    pub fn active_node(&self) -> Option<NodeRef> {
        return get_active_node_core(self);
    }

    pub fn add_node(&self, node: &NodeRef) {
        add_node_to_selection_core(self, node);
    }

    pub fn clear(&self) {
        clear_selection_core(self);
    }

    pub fn has_selection(&self) -> bool {
        return has_selection_core(self);
    }

    pub fn is_node_selected(&self, node: &NodeRef) -> bool {
        return is_node_selected_core(self, node);
    }

    pub fn remove_node(&self, node: &NodeRef) {
        remove_node_from_selection_core(self, node);
    }

    pub fn select_all_nodes(&self, candidates: &[NodeRef]) {
        select_all_nodes_core(self, candidates);
    }

    pub fn select_node(&self, node: &NodeRef) {
        select_node_core(self, node);
    }

    pub fn selected_nodes(&self, out: &mut Vec<NodeRef>) {
        get_selected_nodes_core(out, self);
    }

    pub fn selection_count(&self) -> usize {
        return get_selection_count_core(self);
    }

    pub fn signals(&self) -> SelectionSignals {
        return get_selection_signals_core(self);
    }

    pub fn toggle_node(&self, node: &NodeRef) {
        toggle_node_selection_core(self, node);
    }
}
