use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_power::contract::*;

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

fn empty_power() -> HostPowerCapabilities {
    return HostPowerCapabilities {
        battery_health: None,
        change: None,
        idle: None,
        keep_awake: None,
        session_lock: None,
        status: None,
        suspension: None,
        thermal: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_power_keep_awake_capability() -> HostPowerKeepAwakeCapability {
    return HostPowerKeepAwakeCapability {
        acquire: Arc::new(|_| unreachable!("fixture")),
        destroy: None,
        is_active: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
        release: Arc::new(|| unreachable!("fixture")),
    };
}

mod explain_host_power_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_power_capabilities(&mut out, &empty_power());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "power".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostPowerKeepAwakeCapability".to_string(),
                group: "power".to_string(),
                is_present: false,
                slot: "keepAwake".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_keep_awake_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut power = empty_power();
        power.keep_awake = Some(fixture_host_power_keep_awake_capability());
        let mut out = composed_so_far();
        explain_host_power_capabilities(&mut out, &power);
        assert_eq!(out.groups[1].slots, vec!["keepAwake".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostPowerKeepAwakeCapability".to_string(),
                group: "power".to_string(),
                is_present: true,
                slot: "keepAwake".to_string(),
            },]
        );
    }
}
