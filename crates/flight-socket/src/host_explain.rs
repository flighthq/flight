//! Host capability explanations for the capability group this crate owns (`socket`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostSocketCapabilities;

/// Appends the `socket` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`connection`), to a host explanation (TS `explainHost` over `host.socket`).
/// A host provider composes its host's explanation by calling each group's explainer in group
/// order.
// flight-lint: allow(conform-extra) D26: the socket group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_socket_capabilities(
    out: &mut HostExplanation,
    socket: &HostSocketCapabilities,
) {
    let mut slots = Vec::new();
    if socket.connection.is_some() {
        slots.push("connection".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "socket".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostSocketCapability".to_string(),
        group: "socket".to_string(),
        is_present: socket.connection.is_some(),
        slot: "connection".to_string(),
    });
}
