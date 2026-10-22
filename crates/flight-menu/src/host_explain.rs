//! Host capability explanations for the capability group this crate owns (`menu`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostMenuCapabilities;

/// Appends the `menu` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.menu`). A host provider composes its host's explanation
/// by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the menu group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_menu_capabilities(out: &mut HostExplanation, menu: &HostMenuCapabilities) {
    let mut slots = Vec::new();
    if menu.app.is_some() {
        slots.push("app".to_string());
    }
    if menu.highlight.is_some() {
        slots.push("highlight".to_string());
    }
    if menu.popup.is_some() {
        slots.push("popup".to_string());
    }
    if menu.select.is_some() {
        slots.push("select".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "menu".to_string(),
        slots,
    });
}
