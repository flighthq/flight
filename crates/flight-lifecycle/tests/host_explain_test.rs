use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_lifecycle::contract::*;

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

fn empty_lifecycle() -> HostLifecycleCapabilities {
    return HostLifecycleCapabilities { state: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_lifecycle_capability() -> HostLifecycleCapability {
    return HostLifecycleCapability {
        get_state: Arc::new(|| unreachable!("fixture")),
        subscribe: Arc::new(|_| unreachable!("fixture")),
        get_launch_kind: None,
        subscribe_memory_warning: None,
    };
}

mod explain_host_lifecycle_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_lifecycle_capabilities(&mut out, &empty_lifecycle());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "lifecycle".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostLifecycleCapability".to_string(),
                group: "lifecycle".to_string(),
                is_present: false,
                slot: "state".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_state_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut lifecycle = empty_lifecycle();
        lifecycle.state = Some(fixture_host_lifecycle_capability());
        let mut out = composed_so_far();
        explain_host_lifecycle_capabilities(&mut out, &lifecycle);
        assert_eq!(out.groups[1].slots, vec!["state".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostLifecycleCapability".to_string(),
                group: "lifecycle".to_string(),
                is_present: true,
                slot: "state".to_string(),
            },]
        );
    }
}
