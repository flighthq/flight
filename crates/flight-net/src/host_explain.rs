//! Host capability explanations for the capability group this crate owns (`net`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostNetCapabilities;

/// Appends the `net` group and its filled slot names, in source property order, and the presence of
/// its covered slot (`http`), to a host explanation (TS `explainHost` over `host.net`). A host
/// provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the net group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_net_capabilities(out: &mut HostExplanation, net: &HostNetCapabilities) {
    let mut slots = Vec::new();
    if net.http.is_some() {
        slots.push("http".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "net".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostNetCapability".to_string(),
        group: "net".to_string(),
        is_present: net.http.is_some(),
        slot: "http".to_string(),
    });
}
