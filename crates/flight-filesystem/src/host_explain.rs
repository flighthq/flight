//! Host capability explanations for the capability group this crate owns (`fileSystem`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostFileSystemCapabilities;

/// Appends the `fileSystem` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`access`), to a host explanation (TS `explainHost` over
/// `host.fileSystem`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the fileSystem group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_file_system_capabilities(
    out: &mut HostExplanation,
    file_system: &HostFileSystemCapabilities,
) {
    let mut slots = Vec::new();
    if file_system.access.is_some() {
        slots.push("access".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "fileSystem".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostFileSystemCapability".to_string(),
        group: "fileSystem".to_string(),
        is_present: file_system.access.is_some(),
        slot: "access".to_string(),
    });
}
