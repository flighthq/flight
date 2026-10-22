//! Host capability explanations for the capability group this crate owns (`sensors`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostSensorsCapabilities;

/// Appends the `sensors` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`query`), to a host explanation (TS `explainHost` over
/// `host.sensors`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the sensors group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_sensors_capabilities(
    out: &mut HostExplanation,
    sensors: &HostSensorsCapabilities,
) {
    let mut slots = Vec::new();
    if sensors.query.is_some() {
        slots.push("query".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "sensors".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostSensorsCapability".to_string(),
        group: "sensors".to_string(),
        is_present: sensors.query.is_some(),
        slot: "query".to_string(),
    });
}
