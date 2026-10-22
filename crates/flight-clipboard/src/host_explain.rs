//! Host capability explanations for the capability group this crate owns (`clipboard`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostClipboardCapabilities;

/// Appends the `clipboard` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`formats`), to a host explanation (TS `explainHost` over
/// `host.clipboard`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the clipboard group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_clipboard_capabilities(
    out: &mut HostExplanation,
    clipboard: &HostClipboardCapabilities,
) {
    let mut slots = Vec::new();
    if clipboard.bookmark.is_some() {
        slots.push("bookmark".to_string());
    }
    if clipboard.change.is_some() {
        slots.push("change".to_string());
    }
    if clipboard.formats.is_some() {
        slots.push("formats".to_string());
    }
    if clipboard.image.is_some() {
        slots.push("image".to_string());
    }
    if clipboard.text.is_some() {
        slots.push("text".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "clipboard".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostClipboardFormatsCapability".to_string(),
        group: "clipboard".to_string(),
        is_present: clipboard.formats.is_some(),
        slot: "formats".to_string(),
    });
}
