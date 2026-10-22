use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_socket::contract::*;

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

fn empty_socket() -> HostSocketCapabilities {
    return HostSocketCapabilities { connection: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_socket_capability() -> HostSocketCapability {
    return HostSocketCapability {
        provider: Arc::new(()),
        open_socket: Arc::new(|_, _| unreachable!("fixture")),
        open_tcp_socket: None,
    };
}

mod explain_host_socket_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_socket_capabilities(&mut out, &empty_socket());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "socket".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostSocketCapability".to_string(),
                group: "socket".to_string(),
                is_present: false,
                slot: "connection".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_connection_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut socket = empty_socket();
        socket.connection = Some(fixture_host_socket_capability());
        let mut out = composed_so_far();
        explain_host_socket_capabilities(&mut out, &socket);
        assert_eq!(out.groups[1].slots, vec!["connection".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostSocketCapability".to_string(),
                group: "socket".to_string(),
                is_present: true,
                slot: "connection".to_string(),
            },]
        );
    }
}
