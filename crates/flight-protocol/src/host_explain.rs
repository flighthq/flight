//! Host capability explanations for the capability group this crate owns (`protocol`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostProtocolCapabilities;

/// Appends the `protocol` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.protocol`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the protocol group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_protocol_capabilities(
    out: &mut HostExplanation,
    protocol: &HostProtocolCapabilities,
) {
    let mut slots = Vec::new();
    if protocol.default.is_some() {
        slots.push("default".to_string());
    }
    if protocol.launch.is_some() {
        slots.push("launch".to_string());
    }
    if protocol.open.is_some() {
        slots.push("open".to_string());
    }
    if protocol.registration.is_some() {
        slots.push("registration".to_string());
    }
    if protocol.registration_query.is_some() {
        slots.push("registrationQuery".to_string());
    }
    if protocol.unregistration.is_some() {
        slots.push("unregistration".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "protocol".to_string(),
        slots,
    });
}
