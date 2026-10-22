//! Host capability explanations for the capability group this crate owns (`preferences`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostPreferencesCapabilities;

/// Appends the `preferences` group and its filled slot names, in source property order, and the
/// presence of its covered slots (`local`, `persistenceQuery`), to a host explanation (TS
/// `explainHost` over `host.preferences`). A host provider composes its host's explanation by
/// calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the preferences group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_preferences_capabilities(
    out: &mut HostExplanation,
    preferences: &HostPreferencesCapabilities,
) {
    let mut slots = Vec::new();
    if preferences.change.is_some() {
        slots.push("change".to_string());
    }
    if preferences.local.is_some() {
        slots.push("local".to_string());
    }
    if preferences.persistence_query.is_some() {
        slots.push("persistenceQuery".to_string());
    }
    if preferences.persistence_request.is_some() {
        slots.push("persistenceRequest".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "preferences".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostPreferencesCapability".to_string(),
        group: "preferences".to_string(),
        is_present: preferences.local.is_some(),
        slot: "local".to_string(),
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostPreferencesPersistenceQueryCapability".to_string(),
        group: "preferences".to_string(),
        is_present: preferences.persistence_query.is_some(),
        slot: "persistenceQuery".to_string(),
    });
}
