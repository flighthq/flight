use std::sync::{Arc, RwLock};

use flight_accessibility::contract::*;
use flight_geometry::create_rectangle;

fn ok() -> AccessibilityOperationOutcome {
    return AccessibilityOperationOutcome::Ok(AccessibilityOperationOutcomeOk {});
}

fn blocked(reason: AccessibilityOperationBlockReason) -> AccessibilityOperationOutcome {
    return AccessibilityOperationOutcome::Blocked(AccessibilityOperationOutcomeBlocked { reason });
}

fn capability() -> HostAccessibilityCapability {
    return HostAccessibilityCapability {
        provider: Arc::new(()),
        announce: Arc::new(|_message: &str, _liveness: AccessibilityLiveness| ok()),
        clear: Arc::new(ok),
        destroy: Arc::new(|| {}),
        remove_node: Arc::new(|_id: &str| ok()),
        set_focus: Arc::new(|_id: &str| ok()),
        set_node: Arc::new(|_node: &AccessibilityNode| ok()),
    };
}

mod accessibility_descriptor {
    use super::*;

    #[test]
    fn keeps_every_optional_field_absent() {
        let descriptor = AccessibilityDescriptor {
            label: None,
            role: None,
            tab_focusable: None,
        };
        assert!(descriptor.label.is_none());
        assert!(descriptor.role.is_none());
        assert!(descriptor.tab_focusable.is_none());
    }

    #[test]
    fn carries_the_source_fields_when_present() {
        let descriptor = AccessibilityDescriptor {
            label: Some("Save".to_string()),
            role: Some("button".to_string()),
            tab_focusable: Some(true),
        };
        assert_eq!(descriptor.label, Some("Save".to_string()));
        assert_eq!(descriptor.role, Some("button".to_string()));
        assert_eq!(descriptor.tab_focusable, Some(true));
    }
}

mod accessibility_node {
    use super::*;

    #[test]
    fn keeps_optional_fields_absent_and_only_the_required_fields() {
        let node = AccessibilityNode {
            id: "subject".to_string(),
            role: "button".to_string(),
            label: None,
            description: None,
            value: None,
            parent_id: None,
            bounds: None,
            states: None,
        };
        assert_eq!(node.id, "subject");
        assert_eq!(node.role, "button");
        assert!(node.parent_id.is_none());
        assert!(node.states.is_none());
    }

    #[test]
    fn shares_the_bounds_rectangle_by_identity() {
        let bounds = Arc::new(RwLock::new(create_rectangle(1.0, 2.0, 3.0, 4.0)));
        let node = AccessibilityNode {
            id: "subject".to_string(),
            role: "slider".to_string(),
            label: Some("Volume".to_string()),
            description: None,
            value: Some("40".to_string()),
            parent_id: Some("root".to_string()),
            bounds: Some(bounds.clone()),
            states: None,
        };
        let copied = node.clone();
        assert!(Arc::ptr_eq(
            node.bounds.as_ref().expect("bounds are present"),
            copied.bounds.as_ref().expect("clone shares bounds")
        ));
        let rectangle = bounds.read().unwrap();
        assert_eq!(rectangle.width, 3.0);
    }
}

mod accessibility_operation_outcome {
    use super::*;

    #[test]
    fn distinguishes_the_ok_and_blocked_arms() {
        assert_eq!(ok(), ok());
        assert_ne!(ok(), blocked(AccessibilityOperationBlockReason::NoDom));
    }

    #[test]
    fn carries_the_block_reason_in_the_blocked_arm() {
        let outcome = blocked(AccessibilityOperationBlockReason::FocusNotMoved);
        assert_eq!(
            outcome,
            AccessibilityOperationOutcome::Blocked(AccessibilityOperationOutcomeBlocked {
                reason: AccessibilityOperationBlockReason::FocusNotMoved,
            })
        );
    }
}

mod accessibility_state {
    use super::*;

    #[test]
    fn keeps_only_the_declared_state_fields() {
        let state = AccessibilityState {
            disabled: Some(true),
            checked: None,
            expanded: None,
            selected: None,
            pressed: None,
            busy: None,
            hidden: None,
            readonly: None,
            required: Some(false),
            level: Some(2.0),
            value_min: Some(0.0),
            value_max: Some(100.0),
            value_now: Some(40.0),
        };
        assert_eq!(state.disabled, Some(true));
        assert_eq!(state.checked, None);
        assert_eq!(state.level, Some(2.0));
        assert_eq!(state.value_now, Some(40.0));
    }
}

mod get_accessibility_liveness_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_accessibility_liveness_string(AccessibilityLiveness::Polite),
            "polite"
        );
        assert_eq!(
            get_accessibility_liveness_string(AccessibilityLiveness::Assertive),
            "assertive"
        );
    }
}

mod get_accessibility_operation_block_reason_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_accessibility_operation_block_reason_string(
                AccessibilityOperationBlockReason::Destroyed
            ),
            "destroyed"
        );
        assert_eq!(
            get_accessibility_operation_block_reason_string(
                AccessibilityOperationBlockReason::FocusNotMoved
            ),
            "focus-not-moved"
        );
        assert_eq!(
            get_accessibility_operation_block_reason_string(
                AccessibilityOperationBlockReason::NoDom
            ),
            "no-dom"
        );
        assert_eq!(
            get_accessibility_operation_block_reason_string(
                AccessibilityOperationBlockReason::NodeNotFound
            ),
            "node-not-found"
        );
    }
}

mod host_accessibility_capabilities {
    use super::*;

    #[test]
    fn keeps_the_tree_slot_optional() {
        let empty = HostAccessibilityCapabilities { tree: None };
        assert!(empty.tree.is_none());
        let populated = HostAccessibilityCapabilities {
            tree: Some(capability()),
        };
        assert!(populated.tree.is_some());
    }
}

mod parse_accessibility_liveness {
    use super::*;

    #[test]
    fn round_trips_every_value() {
        for value in [
            AccessibilityLiveness::Polite,
            AccessibilityLiveness::Assertive,
        ] {
            assert_eq!(
                parse_accessibility_liveness(get_accessibility_liveness_string(value)),
                Some(value)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_accessibility_liveness("urgent"), None);
    }
}

mod parse_accessibility_operation_block_reason {
    use super::*;

    #[test]
    fn round_trips_every_reason() {
        for reason in [
            AccessibilityOperationBlockReason::Destroyed,
            AccessibilityOperationBlockReason::FocusNotMoved,
            AccessibilityOperationBlockReason::NoDom,
            AccessibilityOperationBlockReason::NodeNotFound,
        ] {
            assert_eq!(
                parse_accessibility_operation_block_reason(
                    get_accessibility_operation_block_reason_string(reason)
                ),
                Some(reason)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_accessibility_operation_block_reason("ok"), None);
    }
}

mod provider_identity {
    use super::*;

    #[test]
    fn clones_of_one_capability_share_the_provider_token() {
        let first = capability();
        let second = first.clone();
        assert!(Arc::ptr_eq(&first.provider, &second.provider));
    }

    #[test]
    fn distinct_providers_keep_distinct_tokens() {
        let first = capability();
        let second = capability();
        assert!(!Arc::ptr_eq(&first.provider, &second.provider));
    }
}
