//! Host capability explanations for the capability group this crate owns (`shell`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostShellCapabilities;

/// Appends the `shell` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.shell`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the shell group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_shell_capabilities(out: &mut HostExplanation, shell: &HostShellCapabilities) {
    let mut slots = Vec::new();
    if shell.beep.is_some() {
        slots.push("beep".to_string());
    }
    if shell.external.is_some() {
        slots.push("external".to_string());
    }
    if shell.path_open.is_some() {
        slots.push("pathOpen".to_string());
    }
    if shell.path_reveal.is_some() {
        slots.push("pathReveal".to_string());
    }
    if shell.process.is_some() {
        slots.push("process".to_string());
    }
    if shell.shortcut_link.is_some() {
        slots.push("shortcutLink".to_string());
    }
    if shell.trash.is_some() {
        slots.push("trash".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "shell".to_string(),
        slots,
    });
}
