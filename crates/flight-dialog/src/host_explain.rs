//! Host capability explanations for the capability group this crate owns (`dialog`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostDialogCapabilities;

/// Appends the `dialog` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.dialog`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the dialog group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_dialog_capabilities(
    out: &mut HostExplanation,
    dialog: &HostDialogCapabilities,
) {
    let mut slots = Vec::new();
    if dialog.directory_open.is_some() {
        slots.push("directoryOpen".to_string());
    }
    if dialog.file_open.is_some() {
        slots.push("fileOpen".to_string());
    }
    if dialog.file_save.is_some() {
        slots.push("fileSave".to_string());
    }
    if dialog.image_open.is_some() {
        slots.push("imageOpen".to_string());
    }
    if dialog.message.is_some() {
        slots.push("message".to_string());
    }
    if dialog.photo_capture.is_some() {
        slots.push("photoCapture".to_string());
    }
    if dialog.prompt.is_some() {
        slots.push("prompt".to_string());
    }
    if dialog.video_capture.is_some() {
        slots.push("videoCapture".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "dialog".to_string(),
        slots,
    });
}
