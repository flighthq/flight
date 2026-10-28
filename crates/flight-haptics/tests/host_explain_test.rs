//! flight-compiler: rust-only

use std::sync::Arc;

use flight_haptics::contract::*;
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

fn empty_haptics() -> HostHapticsCapabilities {
    return HostHapticsCapabilities { engine: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_haptics_capability() -> HostHapticsCapability {
    return HostHapticsCapability {
        cancel: Arc::new(|| unreachable!("fixture")),
        capabilities: Arc::new(|_| unreachable!("fixture")),
        impact: Arc::new(|_, _| unreachable!("fixture")),
        is_supported: Arc::new(|| unreachable!("fixture")),
        notification: Arc::new(|_| unreachable!("fixture")),
        prepare: None,
        selection: Arc::new(|| unreachable!("fixture")),
        vibrate: Arc::new(|_| unreachable!("fixture")),
        vibrate_pattern: Arc::new(|_| unreachable!("fixture")),
        vibrate_waveform: None,
    };
}

mod explain_host_haptics_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_haptics_capabilities(&mut out, &empty_haptics());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "haptics".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostHapticsCapability".to_string(),
                group: "haptics".to_string(),
                is_present: false,
                slot: "engine".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_engine_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut haptics = empty_haptics();
        haptics.engine = Some(fixture_host_haptics_capability());
        let mut out = composed_so_far();
        explain_host_haptics_capabilities(&mut out, &haptics);
        assert_eq!(out.groups[1].slots, vec!["engine".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostHapticsCapability".to_string(),
                group: "haptics".to_string(),
                is_present: true,
                slot: "engine".to_string(),
            },]
        );
    }
}
