use std::sync::Arc;

use flight_geolocation::contract::*;
use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

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

fn empty_geolocation() -> HostGeolocationCapabilities {
    return HostGeolocationCapabilities { position: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_geolocation_capability() -> HostGeolocationCapability {
    return HostGeolocationCapability {
        clear_watch: Arc::new(|_| unreachable!("fixture")),
        get_current_position: Arc::new(|_| unreachable!("fixture")),
        get_current_position_result: Arc::new(|_| unreachable!("fixture")),
        is_available: Arc::new(|| unreachable!("fixture")),
        watch_position: Arc::new(|_, _, _| unreachable!("fixture")),
        prompt_for_access: None,
    };
}

mod explain_host_geolocation_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_geolocation_capabilities(&mut out, &empty_geolocation());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "geolocation".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostGeolocationCapability".to_string(),
                group: "geolocation".to_string(),
                is_present: false,
                slot: "position".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_position_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut geolocation = empty_geolocation();
        geolocation.position = Some(fixture_host_geolocation_capability());
        let mut out = composed_so_far();
        explain_host_geolocation_capabilities(&mut out, &geolocation);
        assert_eq!(out.groups[1].slots, vec!["position".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostGeolocationCapability".to_string(),
                group: "geolocation".to_string(),
                is_present: true,
                slot: "position".to_string(),
            },]
        );
    }
}
