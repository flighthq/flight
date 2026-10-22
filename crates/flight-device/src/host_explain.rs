//! Host capability explanations for the capability group this crate owns (`device`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostDeviceCapabilities;

/// Appends the `device` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`info`), to a host explanation (TS `explainHost` over `host.device`). A
/// host provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the device group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_device_capabilities(
    out: &mut HostExplanation,
    device: &HostDeviceCapabilities,
) {
    let mut slots = Vec::new();
    if device.info.is_some() {
        slots.push("info".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "device".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostDeviceCapability".to_string(),
        group: "device".to_string(),
        is_present: device.info.is_some(),
        slot: "info".to_string(),
    });
}
