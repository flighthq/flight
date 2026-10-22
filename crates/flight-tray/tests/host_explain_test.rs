use flight_host::{HostCapabilityGroupExplanation, HostExplanation};
use flight_tray::contract::*;

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

fn empty_tray() -> HostTrayCapabilities {
    return HostTrayCapabilities {
        balloon: None,
        balloon_events: None,
        bounds: None,
        double_click_policy: None,
        drop_events: None,
        image: None,
        interaction_events: None,
        lifecycle: None,
        menu: None,
        menu_selection_events: None,
        popup_menu: None,
        pressed_image: None,
        template_image: None,
        title: None,
        tooltip: None,
    };
}

mod explain_host_tray_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_tray_capabilities(&mut out, &empty_tray());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "tray".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}
