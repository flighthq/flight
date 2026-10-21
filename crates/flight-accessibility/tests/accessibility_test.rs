use std::sync::{Arc, Mutex, RwLock};

use flight_accessibility::contract::*;
use flight_entity::Ref;
use flight_geometry::{Rectangle, create_rectangle};

struct FakeResults {
    announce: AccessibilityOperationOutcome,
    clear: AccessibilityOperationOutcome,
    remove_node: AccessibilityOperationOutcome,
    set_focus: AccessibilityOperationOutcome,
    set_node: AccessibilityOperationOutcome,
}

struct Fake {
    capability: HostAccessibilityCapability,
    announced: Arc<Mutex<Vec<(String, AccessibilityLiveness)>>>,
    cleared: Arc<Mutex<usize>>,
    destroyed: Arc<Mutex<usize>>,
    removed: Arc<Mutex<Vec<String>>>,
    focused: Arc<Mutex<Vec<String>>>,
    nodes: Arc<Mutex<Vec<usize>>>,
    node_labels: Arc<Mutex<Vec<Option<String>>>>,
    node_bounds: Arc<Mutex<Vec<Option<Ref<Rectangle>>>>>,
}

fn ok() -> AccessibilityOperationOutcome {
    return AccessibilityOperationOutcome::Ok(AccessibilityOperationOutcomeOk {});
}

fn blocked(reason: AccessibilityOperationBlockReason) -> AccessibilityOperationOutcome {
    return AccessibilityOperationOutcome::Blocked(AccessibilityOperationOutcomeBlocked { reason });
}

fn all_ok() -> FakeResults {
    return FakeResults {
        announce: ok(),
        clear: ok(),
        remove_node: ok(),
        set_focus: ok(),
        set_node: ok(),
    };
}

fn fake(results: FakeResults) -> Fake {
    let announced = Arc::new(Mutex::new(Vec::new()));
    let cleared = Arc::new(Mutex::new(0));
    let destroyed = Arc::new(Mutex::new(0));
    let removed = Arc::new(Mutex::new(Vec::new()));
    let focused = Arc::new(Mutex::new(Vec::new()));
    let nodes = Arc::new(Mutex::new(Vec::new()));
    let node_labels = Arc::new(Mutex::new(Vec::new()));
    let node_bounds = Arc::new(Mutex::new(Vec::new()));
    let announced_for = announced.clone();
    let cleared_for = cleared.clone();
    let destroyed_for = destroyed.clone();
    let removed_for = removed.clone();
    let focused_for = focused.clone();
    let nodes_for = nodes.clone();
    let node_labels_for = node_labels.clone();
    let node_bounds_for = node_bounds.clone();
    let capability = HostAccessibilityCapability {
        provider: Arc::new(()),
        announce: Arc::new(move |message: &str, liveness: AccessibilityLiveness| {
            announced_for
                .lock()
                .unwrap()
                .push((message.to_string(), liveness));
            return results.announce;
        }),
        clear: Arc::new(move || {
            *cleared_for.lock().unwrap() += 1;
            return results.clear;
        }),
        destroy: Arc::new(move || {
            *destroyed_for.lock().unwrap() += 1;
        }),
        remove_node: Arc::new(move |id: &str| {
            removed_for.lock().unwrap().push(id.to_string());
            return results.remove_node;
        }),
        set_focus: Arc::new(move |id: &str| {
            focused_for.lock().unwrap().push(id.to_string());
            return results.set_focus;
        }),
        set_node: Arc::new(move |node: &AccessibilityNode| {
            nodes_for
                .lock()
                .unwrap()
                .push(node as *const AccessibilityNode as usize);
            node_labels_for.lock().unwrap().push(node.label.clone());
            node_bounds_for.lock().unwrap().push(node.bounds.clone());
            return results.set_node;
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
        node_labels,
        node_bounds,
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

mod announce_accessibility {
    use super::*;

    #[test]
    fn returns_the_provider_outcome_and_supplies_the_default_polite_liveness() {
        let fake = fake(all_ok());
        assert_eq!(
            announce_accessibility(&fake.capability, "saved", None),
            ok()
        );
        assert_eq!(
            *fake.announced.lock().unwrap(),
            vec![("saved".to_string(), AccessibilityLiveness::Polite)]
        );
    }

    #[test]
    fn uses_an_explicit_assertive_liveness() {
        let fake = fake(all_ok());
        announce_accessibility(
            &fake.capability,
            "error",
            Some(AccessibilityLiveness::Assertive),
        );
        assert_eq!(
            *fake.announced.lock().unwrap(),
            vec![("error".to_string(), AccessibilityLiveness::Assertive)]
        );
    }

    #[test]
    fn forwards_a_no_dom_outcome_unchanged() {
        let results = FakeResults {
            announce: blocked(AccessibilityOperationBlockReason::NoDom),
            ..all_ok()
        };
        let fake = fake(results);
        assert_eq!(
            announce_accessibility(&fake.capability, "saved", None),
            blocked(AccessibilityOperationBlockReason::NoDom)
        );
    }

    #[test]
    fn does_not_consult_another_provider() {
        let first = fake(all_ok());
        let second = fake(all_ok());
        announce_accessibility(&first.capability, "saved", None);
        assert_eq!(first.announced.lock().unwrap().len(), 1);
        assert!(second.announced.lock().unwrap().is_empty());
    }
}

mod clear_accessibility_tree {
    use super::*;

    #[test]
    fn returns_the_provider_outcome_and_clears_only_the_selected_provider() {
        let results = FakeResults {
            clear: blocked(AccessibilityOperationBlockReason::NoDom),
            ..all_ok()
        };
        let first = fake(results);
        let second = fake(all_ok());
        assert_eq!(
            clear_accessibility_tree(&first.capability),
            blocked(AccessibilityOperationBlockReason::NoDom)
        );
        assert_eq!(*first.cleared.lock().unwrap(), 1);
        assert_eq!(*second.cleared.lock().unwrap(), 0);
    }

    #[test]
    fn forwards_a_destroyed_outcome() {
        let results = FakeResults {
            clear: blocked(AccessibilityOperationBlockReason::Destroyed),
            ..all_ok()
        };
        let fake = fake(results);
        assert_eq!(
            clear_accessibility_tree(&fake.capability),
            blocked(AccessibilityOperationBlockReason::Destroyed)
        );
    }
}

mod destroy_accessibility {
    use super::*;

    #[test]
    fn destroys_the_selected_provider_and_no_other_provider() {
        let first = fake(all_ok());
        let second = fake(all_ok());
        destroy_accessibility(&first.capability);
        assert_eq!(*first.destroyed.lock().unwrap(), 1);
        assert_eq!(*second.destroyed.lock().unwrap(), 0);
    }
}

mod remove_accessibility_node {
    use super::*;

    #[test]
    fn forwards_the_node_id_and_returns_a_node_not_found_outcome() {
        let results = FakeResults {
            remove_node: blocked(AccessibilityOperationBlockReason::NodeNotFound),
            ..all_ok()
        };
        let fake = fake(results);
        assert_eq!(
            remove_accessibility_node(&fake.capability, "missing"),
            blocked(AccessibilityOperationBlockReason::NodeNotFound)
        );
        assert_eq!(*fake.removed.lock().unwrap(), vec!["missing".to_string()]);
    }

    #[test]
    fn forwards_a_destroyed_outcome_without_reaching_the_tree() {
        let results = FakeResults {
            remove_node: blocked(AccessibilityOperationBlockReason::Destroyed),
            ..all_ok()
        };
        let fake = fake(results);
        assert_eq!(
            remove_accessibility_node(&fake.capability, "subject"),
            blocked(AccessibilityOperationBlockReason::Destroyed)
        );
        assert_eq!(*fake.removed.lock().unwrap(), vec!["subject".to_string()]);
    }
}

mod set_accessibility_focus {
    use super::*;

    #[test]
    fn forwards_the_node_id_and_returns_a_focus_not_moved_outcome() {
        let results = FakeResults {
            set_focus: blocked(AccessibilityOperationBlockReason::FocusNotMoved),
            ..all_ok()
        };
        let fake = fake(results);
        assert_eq!(
            set_accessibility_focus(&fake.capability, "subject"),
            blocked(AccessibilityOperationBlockReason::FocusNotMoved)
        );
        assert_eq!(*fake.focused.lock().unwrap(), vec!["subject".to_string()]);
    }

    #[test]
    fn forwards_a_no_dom_outcome() {
        let results = FakeResults {
            set_focus: blocked(AccessibilityOperationBlockReason::NoDom),
            ..all_ok()
        };
        let fake = fake(results);
        assert_eq!(
            set_accessibility_focus(&fake.capability, "subject"),
            blocked(AccessibilityOperationBlockReason::NoDom)
        );
    }
}

mod set_accessibility_node {
    use super::*;

    #[test]
    fn publishes_only_through_the_explicitly_supplied_host() {
        let first = fake(all_ok());
        let second = fake(all_ok());
        let subject = node("subject");
        assert_eq!(set_accessibility_node(&first.capability, &subject), ok());
        assert_eq!(
            first.nodes.lock().unwrap()[0],
            &subject as *const AccessibilityNode as usize
        );
        assert!(second.nodes.lock().unwrap().is_empty());
    }

    #[test]
    fn preserves_optional_field_absence_and_shared_bounds_identity() {
        let fake = fake(all_ok());
        let bounds = Arc::new(RwLock::new(create_rectangle(1.0, 2.0, 3.0, 4.0)));
        let subject = AccessibilityNode {
            id: "subject".to_string(),
            role: "slider".to_string(),
            label: None,
            description: None,
            value: None,
            parent_id: None,
            bounds: Some(bounds.clone()),
            states: None,
        };
        set_accessibility_node(&fake.capability, &subject);
        assert_eq!(*fake.node_labels.lock().unwrap(), vec![None::<String>]);
        let received = fake.node_bounds.lock().unwrap();
        let received_bounds = received[0].as_ref().expect("bounds are forwarded");
        assert!(Arc::ptr_eq(received_bounds, &bounds));
    }

    #[test]
    fn forwards_a_destroyed_outcome() {
        let results = FakeResults {
            set_node: blocked(AccessibilityOperationBlockReason::Destroyed),
            ..all_ok()
        };
        let fake = fake(results);
        assert_eq!(
            set_accessibility_node(&fake.capability, &node("subject")),
            blocked(AccessibilityOperationBlockReason::Destroyed)
        );
    }
}
