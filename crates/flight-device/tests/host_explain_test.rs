use std::sync::Arc;

use flight_device::contract::*;
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

fn empty_device() -> HostDeviceCapabilities {
    return HostDeviceCapabilities { info: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_device_capability() -> HostDeviceCapability {
    return HostDeviceCapability {
        provider: Arc::new(()),
        get_capabilities: Arc::new(|_| unreachable!("fixture")),
        get_display_metrics: Arc::new(|_| unreachable!("fixture")),
        get_id: Arc::new(|| unreachable!("fixture")),
        get_info: Arc::new(|_| unreachable!("fixture")),
        get_safe_area_insets: Arc::new(|_| unreachable!("fixture")),
        refresh: None,
    };
}

mod explain_host_device_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_device_capabilities(&mut out, &empty_device());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "device".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostDeviceCapability".to_string(),
                group: "device".to_string(),
                is_present: false,
                slot: "info".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_info_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut device = empty_device();
        device.info = Some(fixture_host_device_capability());
        let mut out = composed_so_far();
        explain_host_device_capabilities(&mut out, &device);
        assert_eq!(out.groups[1].slots, vec!["info".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostDeviceCapability".to_string(),
                group: "device".to_string(),
                is_present: true,
                slot: "info".to_string(),
            },]
        );
    }
}
