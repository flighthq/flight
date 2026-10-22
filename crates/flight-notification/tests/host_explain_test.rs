use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_notification::contract::*;

// An entry another group's explainer already appended: each explainer appends after it.
fn composed_so_far() -> HostExplanation {
    return HostExplanation {
        capabilities: Vec::new(),
        groups: vec![HostCapabilityGroupExplanation {
            group: "earlier".to_string(),
            slots: Vec::new(),
        }],
    };
}

fn empty_notification() -> HostNotificationCapabilities {
    return HostNotificationCapabilities {
        action: None,
        active_list: None,
        click: None,
        close: None,
        delivery: None,
        dismiss: None,
        lifecycle: None,
        permission: None,
        received: None,
        reply: None,
        scheduling: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_notification_permission_capability() -> HostNotificationPermissionCapability {
    return HostNotificationPermissionCapability {
        get_permission: Arc::new(|| unreachable!("fixture")),
        request_permission: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
    };
}

mod explain_host_notification_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_notification_capabilities(&mut out, &empty_notification());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "notification".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostNotificationPermissionCapability".to_string(),
                group: "notification".to_string(),
                is_present: false,
                slot: "permission".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_permission_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut notification = empty_notification();
        notification.permission = Some(fixture_host_notification_permission_capability());
        let mut out = composed_so_far();
        explain_host_notification_capabilities(&mut out, &notification);
        assert_eq!(out.groups[1].slots, vec!["permission".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostNotificationPermissionCapability".to_string(),
                group: "notification".to_string(),
                is_present: true,
                slot: "permission".to_string(),
            },]
        );
    }
}
