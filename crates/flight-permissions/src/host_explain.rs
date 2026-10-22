//! Host capability explanations for the capability group this crate owns (`permissions`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostPermissionsCapabilities;

/// Appends the `permissions` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.permissions`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the permissions group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_permissions_capabilities(
    out: &mut HostExplanation,
    permissions: &HostPermissionsCapabilities,
) {
    let mut slots = Vec::new();
    if permissions.query.is_some() {
        slots.push("query".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "permissions".to_string(),
        slots,
    });
}
