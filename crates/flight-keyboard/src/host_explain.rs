//! Host capability explanations for the capability group this crate owns (`softKeyboard`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostSoftKeyboardCapabilities;

/// Appends the `softKeyboard` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`info`), to a host explanation (TS `explainHost` over
/// `host.softKeyboard`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the softKeyboard group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_soft_keyboard_capabilities(
    out: &mut HostExplanation,
    soft_keyboard: &HostSoftKeyboardCapabilities,
) {
    let mut slots = Vec::new();
    if soft_keyboard.accessory_bar.is_some() {
        slots.push("accessoryBar".to_string());
    }
    if soft_keyboard.change.is_some() {
        slots.push("change".to_string());
    }
    if soft_keyboard.info.is_some() {
        slots.push("info".to_string());
    }
    if soft_keyboard.resize_mode_write.is_some() {
        slots.push("resizeModeWrite".to_string());
    }
    if soft_keyboard.scroll_assist.is_some() {
        slots.push("scrollAssist".to_string());
    }
    if soft_keyboard.style.is_some() {
        slots.push("style".to_string());
    }
    if soft_keyboard.visibility.is_some() {
        slots.push("visibility".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "softKeyboard".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostSoftKeyboardInfoCapability".to_string(),
        group: "softKeyboard".to_string(),
        is_present: soft_keyboard.info.is_some(),
        slot: "info".to_string(),
    });
}
