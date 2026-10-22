//! Host capability explanations for the capability group this crate owns (`tray`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostTrayCapabilities;

/// Appends the `tray` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.tray`). A host provider composes its host's explanation
/// by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the tray group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_tray_capabilities(out: &mut HostExplanation, tray: &HostTrayCapabilities) {
    let mut slots = Vec::new();
    if tray.balloon.is_some() {
        slots.push("balloon".to_string());
    }
    if tray.balloon_events.is_some() {
        slots.push("balloonEvents".to_string());
    }
    if tray.bounds.is_some() {
        slots.push("bounds".to_string());
    }
    if tray.double_click_policy.is_some() {
        slots.push("doubleClickPolicy".to_string());
    }
    if tray.drop_events.is_some() {
        slots.push("dropEvents".to_string());
    }
    if tray.image.is_some() {
        slots.push("image".to_string());
    }
    if tray.interaction_events.is_some() {
        slots.push("interactionEvents".to_string());
    }
    if tray.lifecycle.is_some() {
        slots.push("lifecycle".to_string());
    }
    if tray.menu.is_some() {
        slots.push("menu".to_string());
    }
    if tray.menu_selection_events.is_some() {
        slots.push("menuSelectionEvents".to_string());
    }
    if tray.popup_menu.is_some() {
        slots.push("popupMenu".to_string());
    }
    if tray.pressed_image.is_some() {
        slots.push("pressedImage".to_string());
    }
    if tray.template_image.is_some() {
        slots.push("templateImage".to_string());
    }
    if tray.title.is_some() {
        slots.push("title".to_string());
    }
    if tray.tooltip.is_some() {
        slots.push("tooltip".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "tray".to_string(),
        slots,
    });
}
