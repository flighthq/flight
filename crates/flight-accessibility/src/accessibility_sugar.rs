//! D18 sugar for the accessibility public lane: methods on the host capability record delegate to
//! the six public functions. Sugar contains no logic and no synthetic property behavior.

use crate::accessibility::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    struct Fake {
        capability: HostAccessibilityCapability,
        announced: Arc<Mutex<Vec<(String, AccessibilityLiveness)>>>,
        cleared: Arc<Mutex<usize>>,
        destroyed: Arc<Mutex<usize>>,
        removed: Arc<Mutex<Vec<String>>>,
        focused: Arc<Mutex<Vec<String>>>,
        nodes: Arc<Mutex<Vec<usize>>>,
    }

    fn ok<R>() -> AccessibilityOperationOutcome<R> {
        return AccessibilityOperationOutcome::Ok(AccessibilityOperationOutcomeOk {});
    }

    fn fake() -> Fake {
        let announced = Arc::new(Mutex::new(Vec::new()));
        let cleared = Arc::new(Mutex::new(0));
        let destroyed = Arc::new(Mutex::new(0));
        let removed = Arc::new(Mutex::new(Vec::new()));
        let focused = Arc::new(Mutex::new(Vec::new()));
        let nodes = Arc::new(Mutex::new(Vec::new()));
        let announced_for = announced.clone();
        let cleared_for = cleared.clone();
        let destroyed_for = destroyed.clone();
        let removed_for = removed.clone();
        let focused_for = focused.clone();
        let nodes_for = nodes.clone();
        let capability = HostAccessibilityCapability {
            provider: Arc::new(()),
            announce: Arc::new(move |message: &str, liveness: AccessibilityLiveness| {
                announced_for
                    .lock()
                    .unwrap()
                    .push((message.to_string(), liveness));
                return ok();
            }),
            clear: Arc::new(move || {
                *cleared_for.lock().unwrap() += 1;
                return ok();
            }),
            destroy: Arc::new(move || {
                *destroyed_for.lock().unwrap() += 1;
            }),
            remove_node: Arc::new(move |id: &str| {
                removed_for.lock().unwrap().push(id.to_string());
                return ok();
            }),
            set_focus: Arc::new(move |id: &str| {
                focused_for.lock().unwrap().push(id.to_string());
                return ok();
            }),
            set_node: Arc::new(move |node: &AccessibilityNode| {
                nodes_for
                    .lock()
                    .unwrap()
                    .push(node as *const AccessibilityNode as usize);
                return ok();
            }),
        };
        return Fake {
            capability,
            announced,
            cleared,
            destroyed,
            removed,
            focused,
            nodes,
        };
    }

    fn node(id: &str) -> AccessibilityNode {
        return AccessibilityNode {
            id: id.to_string(),
            role: "button".to_string(),
            label: None,
            description: None,
            value: None,
            parent_id: None,
            bounds: None,
            states: None,
        };
    }

    #[test]
    fn announce_method_matches_announce_accessibility() {
        let method_fake = fake();
        let free_fake = fake();
        let method_result = method_fake
            .capability
            .announce("saved", Some(AccessibilityLiveness::Assertive));
        let free_result = announce_accessibility(
            &free_fake.capability,
            "saved",
            Some(AccessibilityLiveness::Assertive),
        );
        assert_eq!(method_result, free_result);
        assert_eq!(
            *method_fake.announced.lock().unwrap(),
            *free_fake.announced.lock().unwrap()
        );
    }

    #[test]
    fn clear_method_matches_clear_accessibility_tree() {
        let method_fake = fake();
        let free_fake = fake();
        assert_eq!(
            method_fake.capability.clear(),
            clear_accessibility_tree(&free_fake.capability)
        );
        assert_eq!(
            *method_fake.cleared.lock().unwrap(),
            *free_fake.cleared.lock().unwrap()
        );
    }

    #[test]
    fn destroy_method_matches_destroy_accessibility() {
        let method_fake = fake();
        let free_fake = fake();
        method_fake.capability.destroy();
        destroy_accessibility(&free_fake.capability);
        assert_eq!(
            *method_fake.destroyed.lock().unwrap(),
            *free_fake.destroyed.lock().unwrap()
        );
    }

    #[test]
    fn remove_node_method_matches_remove_accessibility_node() {
        let method_fake = fake();
        let free_fake = fake();
        assert_eq!(
            method_fake.capability.remove_node("missing"),
            remove_accessibility_node(&free_fake.capability, "missing")
        );
        assert_eq!(
            *method_fake.removed.lock().unwrap(),
            *free_fake.removed.lock().unwrap()
        );
    }

    #[test]
    fn set_focus_method_matches_set_accessibility_focus() {
        let method_fake = fake();
        let free_fake = fake();
        assert_eq!(
            method_fake.capability.set_focus("subject"),
            set_accessibility_focus(&free_fake.capability, "subject")
        );
        assert_eq!(
            *method_fake.focused.lock().unwrap(),
            *free_fake.focused.lock().unwrap()
        );
    }

    #[test]
    fn set_node_method_matches_set_accessibility_node() {
        let method_fake = fake();
        let free_fake = fake();
        let method_node = node("method");
        let free_node = node("free");
        assert_eq!(
            method_fake.capability.set_node(&method_node),
            set_accessibility_node(&free_fake.capability, &free_node)
        );
        assert_eq!(
            method_fake.nodes.lock().unwrap()[0],
            &method_node as *const AccessibilityNode as usize
        );
        assert_eq!(
            free_fake.nodes.lock().unwrap()[0],
            &free_node as *const AccessibilityNode as usize
        );
    }
}

// ============================================================================
// D18 sugar: capability methods delegate to the free functions
// ============================================================================

impl HostAccessibilityCapability {
    pub fn announce(
        &self,
        message: &str,
        liveness: Option<AccessibilityLiveness>,
    ) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
        return announce_accessibility(self, message, liveness);
    }

    pub fn clear(&self) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
        return clear_accessibility_tree(self);
    }

    pub fn destroy(&self) {
        return destroy_accessibility(self);
    }

    pub fn remove_node(
        &self,
        id: &str,
    ) -> AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason> {
        return remove_accessibility_node(self, id);
    }

    pub fn set_focus(
        &self,
        id: &str,
    ) -> AccessibilityOperationOutcome<AccessibilityOperationBlockReason> {
        return set_accessibility_focus(self, id);
    }

    pub fn set_node(
        &self,
        node: &AccessibilityNode,
    ) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
        return set_accessibility_node(self, node);
    }
}
