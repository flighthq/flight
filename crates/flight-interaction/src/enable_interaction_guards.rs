use flight_node::NodeRef;

use crate::node_interaction_state::{is_node_focusable, is_node_hit_test_enabled};
use crate::types::{InteractionConnectGuard, InteractionHitEligibility, InteractionSignalName};

// flight-lint: allow(hidden-state) L13 interaction connect guard is module-level state matching TS pattern
static GUARD: std::sync::RwLock<Option<InteractionConnectGuard>> = std::sync::RwLock::new(None);

pub fn disable_interaction_guards() {
    set_interaction_connect_guard(None);
}

pub fn enable_interaction_guards() {
    set_interaction_connect_guard(Some(std::sync::Arc::new(warn_on_inert_interaction_target)));
}

pub fn explain_interaction_hit_eligibility(node: &NodeRef) -> InteractionHitEligibility {
    return InteractionHitEligibility {
        eligible: is_node_hit_test_enabled(node),
        has_eligible_in_subtree: has_eligible_node_in_subtree(node),
    };
}

#[allow(dead_code)]
pub(crate) fn get_interaction_connect_guard() -> Option<InteractionConnectGuard> {
    return GUARD.read().unwrap().clone();
}

fn has_eligible_node_in_subtree(node: &NodeRef) -> bool {
    if is_node_hit_test_enabled(node) {
        return true;
    }
    let children: Option<Vec<NodeRef>> = {
        let n = node.read().unwrap();
        n.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for child in &children {
            if has_eligible_node_in_subtree(child) {
                return true;
            }
        }
    }
    return false;
}

fn has_focusable_node_in_subtree(node: &NodeRef) -> bool {
    if is_node_focusable(node) {
        return true;
    }
    let children: Option<Vec<NodeRef>> = {
        let n = node.read().unwrap();
        n.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for child in &children {
            if has_focusable_node_in_subtree(child) {
                return true;
            }
        }
    }
    return false;
}

pub fn set_interaction_connect_guard(guard: Option<InteractionConnectGuard>) {
    *GUARD.write().unwrap() = guard;
}

fn warn_on_inert_interaction_target(target: &NodeRef, name: InteractionSignalName) {
    if name == InteractionSignalName::OnKeyDown || name == InteractionSignalName::OnKeyUp {
        return;
    }
    if name == InteractionSignalName::OnFocusIn || name == InteractionSignalName::OnFocusOut {
        if has_focusable_node_in_subtree(target) {
            return;
        }
        return;
    }
    if has_eligible_node_in_subtree(target) {
        return;
    }
}
