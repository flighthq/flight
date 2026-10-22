//! Host capability explanations for the capability group this crate owns (`lifecycle`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostLifecycleCapabilities;

/// Appends the `lifecycle` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`state`), to a host explanation (TS `explainHost` over
/// `host.lifecycle`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the lifecycle group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_lifecycle_capabilities(
    out: &mut HostExplanation,
    lifecycle: &HostLifecycleCapabilities,
) {
    let mut slots = Vec::new();
    if lifecycle.state.is_some() {
        slots.push("state".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "lifecycle".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostLifecycleCapability".to_string(),
        group: "lifecycle".to_string(),
        is_present: lifecycle.state.is_some(),
        slot: "state".to_string(),
    });
}
