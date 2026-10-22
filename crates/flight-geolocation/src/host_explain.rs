//! Host capability explanations for the capability group this crate owns (`geolocation`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostGeolocationCapabilities;

/// Appends the `geolocation` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`position`), to a host explanation (TS `explainHost` over
/// `host.geolocation`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the geolocation group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_geolocation_capabilities(
    out: &mut HostExplanation,
    geolocation: &HostGeolocationCapabilities,
) {
    let mut slots = Vec::new();
    if geolocation.position.is_some() {
        slots.push("position".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "geolocation".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostGeolocationCapability".to_string(),
        group: "geolocation".to_string(),
        is_present: geolocation.position.is_some(),
        slot: "position".to_string(),
    });
}
