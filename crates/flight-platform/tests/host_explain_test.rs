use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_platform::contract::*;

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

fn empty_platform() -> HostPlatformCapabilities {
    return HostPlatformCapabilities { info: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_platform_capability() -> HostPlatformCapability {
    return HostPlatformCapability {
        provider: Arc::new(()),
        get_info: Arc::new(|_| unreachable!("fixture")),
    };
}

mod explain_host_platform_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_platform_capabilities(&mut out, &empty_platform());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "platform".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostPlatformCapability".to_string(),
                group: "platform".to_string(),
                is_present: false,
                slot: "info".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_info_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut platform = empty_platform();
        platform.info = Some(fixture_host_platform_capability());
        let mut out = composed_so_far();
        explain_host_platform_capabilities(&mut out, &platform);
        assert_eq!(out.groups[1].slots, vec!["info".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostPlatformCapability".to_string(),
                group: "platform".to_string(),
                is_present: true,
                slot: "info".to_string(),
            },]
        );
    }
}
