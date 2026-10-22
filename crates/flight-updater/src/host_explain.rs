//! Host capability explanations for the capability group this crate owns (`updater`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostUpdaterCapabilities;

/// Appends the `updater` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.updater`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the updater group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_updater_capabilities(
    out: &mut HostExplanation,
    updater: &HostUpdaterCapabilities,
) {
    let mut slots = Vec::new();
    if updater.command.is_some() {
        slots.push("command".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "updater".to_string(),
        slots,
    });
}
