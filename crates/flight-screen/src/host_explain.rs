//! Host capability explanations for the capability group this crate owns (`screen`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostScreenCapabilities;

/// Appends the `screen` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`query`), to a host explanation (TS `explainHost` over `host.screen`). A
/// host provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the screen group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_screen_capabilities(
    out: &mut HostExplanation,
    screen: &HostScreenCapabilities,
) {
    let mut slots = Vec::new();
    if screen.change.is_some() {
        slots.push("change".to_string());
    }
    if screen.details.is_some() {
        slots.push("details".to_string());
    }
    if screen.permission_change.is_some() {
        slots.push("permissionChange".to_string());
    }
    if screen.query.is_some() {
        slots.push("query".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "screen".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostScreenQueryCapability".to_string(),
        group: "screen".to_string(),
        is_present: screen.query.is_some(),
        slot: "query".to_string(),
    });
}
