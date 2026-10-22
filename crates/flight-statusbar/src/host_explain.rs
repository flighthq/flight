//! Host capability explanations for the capability group this crate owns (`statusBar`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostStatusBarCapabilities;

/// Appends the `statusBar` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.statusBar`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the statusBar group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_status_bar_capabilities(
    out: &mut HostExplanation,
    status_bar: &HostStatusBarCapabilities,
) {
    let mut slots = Vec::new();
    if status_bar.change.is_some() {
        slots.push("change".to_string());
    }
    if status_bar.color.is_some() {
        slots.push("color".to_string());
    }
    if status_bar.info.is_some() {
        slots.push("info".to_string());
    }
    if status_bar.overlays.is_some() {
        slots.push("overlays".to_string());
    }
    if status_bar.style.is_some() {
        slots.push("style".to_string());
    }
    if status_bar.visibility.is_some() {
        slots.push("visibility".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "statusBar".to_string(),
        slots,
    });
}
