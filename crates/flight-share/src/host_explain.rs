//! Host capability explanations for the capability group this crate owns (`share`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostShareCapabilities;

/// Appends the `share` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.share`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the share group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_share_capabilities(out: &mut HostExplanation, share: &HostShareCapabilities) {
    let mut slots = Vec::new();
    if share.content.is_some() {
        slots.push("content".to_string());
    }
    if share.files.is_some() {
        slots.push("files".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "share".to_string(),
        slots,
    });
}
