use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_screen::contract::*;

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

fn empty_screen() -> HostScreenCapabilities {
    return HostScreenCapabilities {
        change: None,
        details: None,
        permission_change: None,
        query: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_screen_query_capability() -> HostScreenQueryCapability {
    return HostScreenQueryCapability {
        provider: Arc::new(()),
        destroy: None,
        get_screens: Arc::new(|_| unreachable!("fixture")),
        get_primary_screen: Arc::new(|_| unreachable!("fixture")),
        get_cursor_position: Arc::new(|_| unreachable!("fixture")),
    };
}

mod explain_host_screen_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_screen_capabilities(&mut out, &empty_screen());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "screen".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostScreenQueryCapability".to_string(),
                group: "screen".to_string(),
                is_present: false,
                slot: "query".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_query_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut screen = empty_screen();
        screen.query = Some(fixture_host_screen_query_capability());
        let mut out = composed_so_far();
        explain_host_screen_capabilities(&mut out, &screen);
        assert_eq!(out.groups[1].slots, vec!["query".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostScreenQueryCapability".to_string(),
                group: "screen".to_string(),
                is_present: true,
                slot: "query".to_string(),
            },]
        );
    }
}
