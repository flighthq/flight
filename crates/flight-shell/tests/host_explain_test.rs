use flight_host::{HostCapabilityGroupExplanation, HostExplanation};
use flight_shell::contract::*;

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

fn empty_shell() -> HostShellCapabilities {
    return HostShellCapabilities {
        beep: None,
        external: None,
        path_open: None,
        path_reveal: None,
        process: None,
        shortcut_link: None,
        trash: None,
    };
}

mod explain_host_shell_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_shell_capabilities(&mut out, &empty_shell());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "shell".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}
