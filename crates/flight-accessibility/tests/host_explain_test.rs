use flight_accessibility::contract::*;
use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

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

fn empty_accessibility() -> HostAccessibilityCapabilities {
    return HostAccessibilityCapabilities { tree: None };
}

mod explain_host_accessibility_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_accessibility_capabilities(&mut out, &empty_accessibility());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "accessibility".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}
