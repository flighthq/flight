//! Host capability explanations for the capability group this crate owns (`haptics`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostHapticsCapabilities;

/// Appends the `haptics` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`engine`), to a host explanation (TS `explainHost` over
/// `host.haptics`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the haptics group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_haptics_capabilities(
    out: &mut HostExplanation,
    haptics: &HostHapticsCapabilities,
) {
    let mut slots = Vec::new();
    if haptics.engine.is_some() {
        slots.push("engine".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "haptics".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostHapticsCapability".to_string(),
        group: "haptics".to_string(),
        is_present: haptics.engine.is_some(),
        slot: "engine".to_string(),
    });
}
