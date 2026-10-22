use flight_host::{HostCapabilityGroupExplanation, HostExplanation};
use flight_protocol::contract::*;

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

fn empty_protocol() -> HostProtocolCapabilities {
    return HostProtocolCapabilities {
        default: None,
        launch: None,
        open: None,
        registration: None,
        registration_query: None,
        unregistration: None,
    };
}

mod explain_host_protocol_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_protocol_capabilities(&mut out, &empty_protocol());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "protocol".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}
