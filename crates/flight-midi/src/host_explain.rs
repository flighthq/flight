//! Host capability explanations for the capability group this crate owns (`midi`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostMidiCapabilities;

/// Appends the `midi` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.midi`). A host provider composes its host's explanation
/// by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the midi group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_midi_capabilities(out: &mut HostExplanation, midi: &HostMidiCapabilities) {
    let mut slots = Vec::new();
    if midi.access.is_some() {
        slots.push("access".to_string());
    }
    if midi.permission.is_some() {
        slots.push("permission".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "midi".to_string(),
        slots,
    });
}
