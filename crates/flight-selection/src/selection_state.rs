use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_node::NodeRef;
use flight_signals::emit_signal;

use crate::types::*;

#[cfg(test)]
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
        let node: TestNode = create_node(name.to_string(), None);
        return Arc::new(RwLock::new(node));
    }

    fn selected_of(state: &SelectionState) -> Vec<NodeRef> {
        let mut out = Vec::new();
        get_selected_nodes(&mut out, state);
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
        select_node(&state, &selected);
        assert!(same_optional_node(
            &state.active_node(),
            &get_active_node(&state)
        ));
    }

    #[test]
    fn selection_state_add_node_matches_add_node_to_selection() {
        let a = SelectionState::new();
        let b = create_selection_state();
        let selected = node("selected");
        a.add_node(&selected);
        add_node_to_selection(&b, &selected);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_clear_matches_clear_selection() {
        let a = SelectionState::new();
        let b = create_selection_state();
        let selected = node("selected");
        select_node(&a, &selected);
        select_node(&b, &selected);
        a.clear();
        clear_selection(&b);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_has_selection_matches_has_selection() {
        let state = SelectionState::new();
        assert_eq!(state.has_selection(), has_selection(&state));
    }

    #[test]
    fn selection_state_is_node_selected_matches_is_node_selected() {
        let state = SelectionState::new();
        let selected = node("selected");
        select_node(&state, &selected);
        assert_eq!(
            state.is_node_selected(&selected),
            is_node_selected(&state, &selected)
        );
    }

    #[test]
    fn selection_state_new_matches_create_selection_state() {
        let a = SelectionState::new();
        let b = create_selection_state();
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_remove_node_matches_remove_node_from_selection() {
        let a = SelectionState::new();
        let b = create_selection_state();
        let selected = node("selected");
        select_node(&a, &selected);
        select_node(&b, &selected);
        a.remove_node(&selected);
        remove_node_from_selection(&b, &selected);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_select_all_nodes_matches_select_all_nodes() {
        let a = SelectionState::new();
        let b = create_selection_state();
        let first = node("first");
        let second = node("second");
        let candidates = vec![first, second];
        a.select_all_nodes(&candidates);
        select_all_nodes(&b, &candidates);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_select_node_matches_select_node() {
        let a = SelectionState::new();
        let b = create_selection_state();
        let selected = node("selected");
        a.select_node(&selected);
        select_node(&b, &selected);
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
        assert_eq!(state.selection_count(), get_selection_count(&state));
    }

    #[test]
    fn selection_state_signals_matches_get_selection_signals() {
        let state = SelectionState::new();
        let method = state.signals();
        let free = get_selection_signals(&state);
        assert!(Arc::ptr_eq(&method.on_change.data, &free.on_change.data));
        assert!(Arc::ptr_eq(
            &method.on_active_change.data,
            &free.on_active_change.data
        ));
    }

    #[test]
    fn selection_state_toggle_node_matches_toggle_node_selection() {
        let a = SelectionState::new();
        let b = create_selection_state();
        let selected = node("selected");
        a.toggle_node(&selected);
        toggle_node_selection(&b, &selected);
        assert!(same_nodes(&method_selected(&a), &selected_of(&b)));
    }
}

pub fn create_selection_state() -> SelectionState {
    let mut out: SelectionState = allocate_entity();
    initialize_selection_state(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction initializer required by the Rust IR
pub fn initialize_selection_state(out: &mut SelectionState) {
    out.state = flight_entity::Ref::new(std::sync::RwLock::new(SelectionStateRuntime::default()));
}

pub fn add_node_to_selection(state: &SelectionState, node: &NodeRef) {
    let previous_active_node = {
        let mut runtime = state.state.write().unwrap();
        if contains_node(&runtime.selected_node_set, node) {
            return;
        }
        let previous_active_node = runtime.active_node.clone();
        runtime.selected_nodes.push(node.clone());
        runtime.selected_node_set.push(node.clone());
        runtime.active_node = Some(node.clone());
        previous_active_node
    };
    emit_selection_changes(state, previous_active_node);
}

pub fn clear_selection(state: &SelectionState) {
    let previous_active_node = {
        let mut runtime = state.state.write().unwrap();
        if runtime.selected_nodes.is_empty() {
            return;
        }
        let previous_active_node = runtime.active_node.clone();
        runtime.selected_nodes.clear();
        runtime.selected_node_set.clear();
        runtime.active_node = None;
        previous_active_node
    };
    emit_selection_changes(state, previous_active_node);
}

fn contains_node(nodes: &[NodeRef], node: &NodeRef) -> bool {
    return nodes.iter().any(|selected| Arc::ptr_eq(selected, node));
}

fn emit_selection_changes(state: &SelectionState, previous_active_node: Option<NodeRef>) {
    let change_event = {
        let runtime = state.state.read().unwrap();
        if runtime.signals.on_change.data.read().unwrap().is_some() {
            Some((
                runtime.signals.on_change.clone(),
                runtime.selected_nodes.clone(),
            ))
        } else {
            None
        }
    };
    if let Some((signal, selected_nodes)) = change_event {
        emit_signal(&signal, &selected_nodes);
    }

    let active_event = {
        let runtime = state.state.read().unwrap();
        if same_optional_node(&previous_active_node, &runtime.active_node) {
            None
        } else {
            Some((
                runtime.signals.on_active_change.clone(),
                runtime.active_node.clone(),
            ))
        }
    };
    if let Some((signal, active_node)) = active_event {
        emit_signal(&signal, &active_node);
    }
}

pub fn get_active_node(state: &SelectionState) -> Option<NodeRef> {
    return state.state.read().unwrap().active_node.clone();
}

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the selection fills a caller-owned out, cleared first
pub fn get_selected_nodes(out: &mut Vec<NodeRef>, state: &SelectionState) {
    out.clear();
    out.extend(state.state.read().unwrap().selected_nodes.iter().cloned());
}

pub fn get_selection_count(state: &SelectionState) -> usize {
    return state.state.read().unwrap().selected_nodes.len();
}

pub fn get_selection_signals(state: &SelectionState) -> SelectionSignals {
    return state.state.read().unwrap().signals.clone();
}

pub fn has_selection(state: &SelectionState) -> bool {
    return !state.state.read().unwrap().selected_nodes.is_empty();
}

pub fn is_node_selected(state: &SelectionState, node: &NodeRef) -> bool {
    return contains_node(&state.state.read().unwrap().selected_node_set, node);
}

pub fn remove_node_from_selection(state: &SelectionState, node: &NodeRef) {
    let previous_active_node = {
        let mut runtime = state.state.write().unwrap();
        if !contains_node(&runtime.selected_node_set, node) {
            return;
        }
        let previous_active_node = runtime.active_node.clone();
        runtime
            .selected_node_set
            .retain(|selected| !Arc::ptr_eq(selected, node));
        runtime
            .selected_nodes
            .retain(|selected| !Arc::ptr_eq(selected, node));
        if same_optional_node(&runtime.active_node, &Some(node.clone())) {
            runtime.active_node = runtime.selected_nodes.last().cloned();
        }
        previous_active_node
    };
    emit_selection_changes(state, previous_active_node);
}

fn same_node_list(a: &[NodeRef], b: &[NodeRef]) -> bool {
    return a.len() == b.len() && a.iter().zip(b).all(|(a, b)| Arc::ptr_eq(a, b));
}

fn same_optional_node(a: &Option<NodeRef>, b: &Option<NodeRef>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        (None, None) => true,
        _ => false,
    };
}

pub fn select_all_nodes(state: &SelectionState, candidates: &[NodeRef]) {
    let mut selected_nodes: Vec<NodeRef> = Vec::new();
    for candidate in candidates {
        if !contains_node(&selected_nodes, candidate) {
            selected_nodes.push(candidate.clone());
        }
    }

    let previous_active_node = {
        let mut runtime = state.state.write().unwrap();
        if same_node_list(&runtime.selected_nodes, &selected_nodes) {
            return;
        }
        let previous_active_node = runtime.active_node.clone();
        runtime.selected_node_set = selected_nodes.clone();
        runtime.selected_nodes = selected_nodes;
        runtime.active_node = runtime.selected_nodes.last().cloned();
        previous_active_node
    };
    emit_selection_changes(state, previous_active_node);
}

pub fn select_node(state: &SelectionState, node: &NodeRef) {
    let previous_active_node = {
        let mut runtime = state.state.write().unwrap();
        if runtime.selected_nodes.len() == 1 && Arc::ptr_eq(&runtime.selected_nodes[0], node) {
            return;
        }
        let previous_active_node = runtime.active_node.clone();
        runtime.selected_node_set = vec![node.clone()];
        runtime.selected_nodes = vec![node.clone()];
        runtime.active_node = Some(node.clone());
        previous_active_node
    };
    emit_selection_changes(state, previous_active_node);
}

pub fn toggle_node_selection(state: &SelectionState, node: &NodeRef) {
    if is_node_selected(state, node) {
        remove_node_from_selection(state, node);
    } else {
        add_node_to_selection(state, node);
    }
}

impl SelectionState {
    pub fn new() -> Self {
        return create_selection_state();
    }

    pub fn active_node(&self) -> Option<NodeRef> {
        return get_active_node(self);
    }

    pub fn add_node(&self, node: &NodeRef) {
        add_node_to_selection(self, node);
    }

    pub fn clear(&self) {
        clear_selection(self);
    }

    pub fn has_selection(&self) -> bool {
        return has_selection(self);
    }

    pub fn is_node_selected(&self, node: &NodeRef) -> bool {
        return is_node_selected(self, node);
    }

    pub fn remove_node(&self, node: &NodeRef) {
        remove_node_from_selection(self, node);
    }

    pub fn select_all_nodes(&self, candidates: &[NodeRef]) {
        select_all_nodes(self, candidates);
    }

    pub fn select_node(&self, node: &NodeRef) {
        select_node(self, node);
    }

    pub fn selected_nodes(&self, out: &mut Vec<NodeRef>) {
        get_selected_nodes(out, self);
    }

    pub fn selection_count(&self) -> usize {
        return get_selection_count(self);
    }

    pub fn signals(&self) -> SelectionSignals {
        return get_selection_signals(self);
    }

    pub fn toggle_node(&self, node: &NodeRef) {
        toggle_node_selection(self, node);
    }
}
