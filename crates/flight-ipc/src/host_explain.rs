//! Host capability explanations for the capability group this crate owns (`ipc`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostIpcCapabilities;

/// Appends the `ipc` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.ipc`). A host provider composes its host's explanation
/// by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the ipc group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_ipc_capabilities(out: &mut HostExplanation, ipc: &HostIpcCapabilities) {
    let mut slots = Vec::new();
    if ipc.handle.is_some() {
        slots.push("handle".to_string());
    }
    if ipc.invoke.is_some() {
        slots.push("invoke".to_string());
    }
    if ipc.message.is_some() {
        slots.push("message".to_string());
    }
    if ipc.send.is_some() {
        slots.push("send".to_string());
    }
    if ipc.targeted_send.is_some() {
        slots.push("targetedSend".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "ipc".to_string(),
        slots,
    });
}
