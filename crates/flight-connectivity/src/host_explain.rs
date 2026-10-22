//! Host capability explanations for the capability group this crate owns (`connectivity`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostConnectivityCapabilities;

/// Appends the `connectivity` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.connectivity`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the connectivity group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_connectivity_capabilities(
    out: &mut HostExplanation,
    connectivity: &HostConnectivityCapabilities,
) {
    let mut slots = Vec::new();
    if connectivity.change.is_some() {
        slots.push("change".to_string());
    }
    if connectivity.reachability.is_some() {
        slots.push("reachability".to_string());
    }
    if connectivity.status.is_some() {
        slots.push("status".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "connectivity".to_string(),
        slots,
    });
}
