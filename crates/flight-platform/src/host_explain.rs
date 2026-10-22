//! Host capability explanations for the capability group this crate owns (`platform`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostPlatformCapabilities;

/// Appends the `platform` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`info`), to a host explanation (TS `explainHost` over
/// `host.platform`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the platform group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_platform_capabilities(
    out: &mut HostExplanation,
    platform: &HostPlatformCapabilities,
) {
    let mut slots = Vec::new();
    if platform.info.is_some() {
        slots.push("info".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "platform".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostPlatformCapability".to_string(),
        group: "platform".to_string(),
        is_present: platform.info.is_some(),
        slot: "info".to_string(),
    });
}
