//! Host capability explanations for the capability group this crate owns (`power`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostPowerCapabilities;

/// Appends the `power` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`keepAwake`), to a host explanation (TS `explainHost` over `host.power`). A
/// host provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the power group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_power_capabilities(out: &mut HostExplanation, power: &HostPowerCapabilities) {
    let mut slots = Vec::new();
    if power.battery_health.is_some() {
        slots.push("batteryHealth".to_string());
    }
    if power.change.is_some() {
        slots.push("change".to_string());
    }
    if power.idle.is_some() {
        slots.push("idle".to_string());
    }
    if power.keep_awake.is_some() {
        slots.push("keepAwake".to_string());
    }
    if power.session_lock.is_some() {
        slots.push("sessionLock".to_string());
    }
    if power.status.is_some() {
        slots.push("status".to_string());
    }
    if power.suspension.is_some() {
        slots.push("suspension".to_string());
    }
    if power.thermal.is_some() {
        slots.push("thermal".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "power".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostPowerKeepAwakeCapability".to_string(),
        group: "power".to_string(),
        is_present: power.keep_awake.is_some(),
        slot: "keepAwake".to_string(),
    });
}
