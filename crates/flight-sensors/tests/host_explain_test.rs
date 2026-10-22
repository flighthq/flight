use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_sensors::contract::*;

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

fn empty_sensors() -> HostSensorsCapabilities {
    return HostSensorsCapabilities { query: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_sensors_capability() -> HostSensorsCapability {
    return HostSensorsCapability {
        get_permission_state: Arc::new(|_| unreachable!("fixture")),
        is_ambient_light_supported: Arc::new(|| unreachable!("fixture")),
        is_barometer_supported: Arc::new(|| unreachable!("fixture")),
        is_gravity_supported: Arc::new(|| unreachable!("fixture")),
        is_gyroscope_supported: Arc::new(|| unreachable!("fixture")),
        is_linear_acceleration_supported: Arc::new(|| unreachable!("fixture")),
        is_magnetometer_supported: Arc::new(|| unreachable!("fixture")),
        is_motion_supported: Arc::new(|| unreachable!("fixture")),
        is_orientation_supported: Arc::new(|| unreachable!("fixture")),
        is_proximity_supported: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
        request_permission: Arc::new(|| unreachable!("fixture")),
        subscribe_absolute_orientation: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_ambient_light: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_barometer: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_gravity: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_linear_acceleration: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_magnetometer: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_motion: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_orientation: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_proximity: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_quaternion: Arc::new(|_, _| unreachable!("fixture")),
    };
}

mod explain_host_sensors_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_sensors_capabilities(&mut out, &empty_sensors());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "sensors".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostSensorsCapability".to_string(),
                group: "sensors".to_string(),
                is_present: false,
                slot: "query".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_query_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut sensors = empty_sensors();
        sensors.query = Some(fixture_host_sensors_capability());
        let mut out = composed_so_far();
        explain_host_sensors_capabilities(&mut out, &sensors);
        assert_eq!(out.groups[1].slots, vec!["query".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostSensorsCapability".to_string(),
                group: "sensors".to_string(),
                is_present: true,
                slot: "query".to_string(),
            },]
        );
    }
}
