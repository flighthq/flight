use flight_node::NodeRef;

use crate::selection_state::{
    add_node_to_selection, clear_selection, is_node_selected, select_node, toggle_node_selection,
};
use crate::types::{SelectionModifierState, SelectionState};

#[cfg(test)]
mod sugar_tests {
    use std::any::Any;
    use std::sync::{Arc, RwLock};

    use flight_entity::{Entity, EntityRuntimeSlot};
    use flight_node::{Node, NodeFields, NodeRef, create_node};

    use super::*;
    use crate::{create_selection_state, get_selected_nodes, select_all_nodes};

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
    fn selection_state_apply_pointer_selection_policy_matches_the_free_function() {
        let a = create_selection_state();
        let b = create_selection_state();
        let selected = node("selected");
        a.apply_pointer_selection_policy(Some(&selected), &SelectionModifierState::default());
        apply_pointer_selection_policy(&b, Some(&selected), &SelectionModifierState::default());
        assert!(same_nodes(&selected_of(&a), &selected_of(&b)));
    }

    #[test]
    fn selection_state_apply_pointer_up_selection_policy_matches_the_free_function() {
        let a = create_selection_state();
        let b = create_selection_state();
        let first = node("first");
        let second = node("second");
        let selected = vec![first.clone(), second];
        select_all_nodes(&a, &selected);
        select_all_nodes(&b, &selected);
        a.apply_pointer_up_selection_policy(
            Some(&first),
            &SelectionModifierState::default(),
            false,
        );
        apply_pointer_up_selection_policy(
            &b,
            Some(&first),
            &SelectionModifierState::default(),
            false,
        );
        assert!(same_nodes(&selected_of(&a), &selected_of(&b)));
    }
}

pub fn apply_pointer_selection_policy(
    state: &SelectionState,
    hit: Option<&NodeRef>,
    modifiers: &SelectionModifierState,
) {
    if modifiers.alt_key {
        return;
    }

    let Some(hit) = hit else {
        if !has_toggle_modifier(modifiers) {
            clear_selection(state);
        }
        return;
    };

    if has_toggle_modifier(modifiers) {
        if modifiers.shift_key && !is_node_selected(state, hit) {
            add_node_to_selection(state, hit);
        } else {
            toggle_node_selection(state, hit);
        }
        return;
    }

    if !is_node_selected(state, hit) {
        select_node(state, hit);
    }
}

pub fn apply_pointer_up_selection_policy(
    state: &SelectionState,
    hit: Option<&NodeRef>,
    modifiers: &SelectionModifierState,
    did_drag: bool,
) {
    let Some(hit) = hit else {
        return;
    };
    if did_drag || has_any_modifier(modifiers) || !is_node_selected(state, hit) {
        return;
    }
    select_node(state, hit);
}

fn has_any_modifier(modifiers: &SelectionModifierState) -> bool {
    return modifiers.alt_key || has_toggle_modifier(modifiers);
}

fn has_toggle_modifier(modifiers: &SelectionModifierState) -> bool {
    return modifiers.ctrl_key || modifiers.meta_key || modifiers.shift_key;
}

impl SelectionState {
    pub fn apply_pointer_selection_policy(
        &self,
        hit: Option<&NodeRef>,
        modifiers: &SelectionModifierState,
    ) {
        apply_pointer_selection_policy(self, hit, modifiers);
    }

    pub fn apply_pointer_up_selection_policy(
        &self,
        hit: Option<&NodeRef>,
        modifiers: &SelectionModifierState,
        did_drag: bool,
    ) {
        apply_pointer_up_selection_policy(self, hit, modifiers, did_drag);
    }
}
