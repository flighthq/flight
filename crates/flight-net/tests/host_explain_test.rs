use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_net::contract::*;

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

fn empty_net() -> HostNetCapabilities {
    return HostNetCapabilities { http: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_net_capability() -> HostNetCapability {
    return HostNetCapability {
        provider: Arc::new(()),
        send_net_request: Arc::new(|_, _| unreachable!("fixture")),
    };
}

mod explain_host_net_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_net_capabilities(&mut out, &empty_net());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "net".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostNetCapability".to_string(),
                group: "net".to_string(),
                is_present: false,
                slot: "http".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_http_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut net = empty_net();
        net.http = Some(fixture_host_net_capability());
        let mut out = composed_so_far();
        explain_host_net_capabilities(&mut out, &net);
        assert_eq!(out.groups[1].slots, vec!["http".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostNetCapability".to_string(),
                group: "net".to_string(),
                is_present: true,
                slot: "http".to_string(),
            },]
        );
    }
}
