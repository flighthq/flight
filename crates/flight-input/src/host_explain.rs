//! Host capability explanations for the capability group this crate owns (`input`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts` and `enableHostGuards.ts`). Each
//! explainer appends to a caller-owned explanation, so a host provider composes its own host's
//! explanation; there is no aggregate.

use flight_host::{
    HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityExplanation,
    HostCapabilityGroupExplanation, HostExplanation, explain_host_capability_slot,
};
use flight_log::{LogStateRef, warn_missing_host_capability};

use crate::HostInputCapabilities;

/// Warns once for each guarded `input` slot (`ingress`) the group is missing (TS `enableHostGuards`
/// over `host.input`), through the caller-owned log state (D5). The warning is the slot's own
/// explainer, so a warning cannot contradict a query, and `log_once` keys per slot.
// flight-lint: allow(conform-extra, f64) D26: the former aggregate enableHostGuards for this group, owned by its feature; D5: the injected log clock is flight-log's f64 milliseconds
pub fn enable_host_input_guards(state: &LogStateRef, now_ms: f64, input: &HostInputCapabilities) {
    warn_missing_host_capability(state, now_ms, &explain_host_input_ingress(input));
}

/// Appends the `input` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`ingress`), to a host explanation (TS `explainHost` over `host.input`). A
/// host provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the input group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_input_capabilities(out: &mut HostExplanation, input: &HostInputCapabilities) {
    let mut slots = Vec::new();
    if input.drop_file.is_some() {
        slots.push("dropFile".to_string());
    }
    if input.focus.is_some() {
        slots.push("focus".to_string());
    }
    if input.ingress.is_some() {
        slots.push("ingress".to_string());
    }
    if input.pointer_lock.is_some() {
        slots.push("pointerLock".to_string());
    }
    if input.target.is_some() {
        slots.push("target".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "input".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostInputIngressCapability".to_string(),
        group: "input".to_string(),
        is_present: input.ingress.is_some(),
        slot: "ingress".to_string(),
    });
}

/// Whether `host.input.ingress` is filled and, when it is absent, which package supplies the
/// capability (TS `explainHostInputIngress`).
// flight-lint: allow(conform-extra) D26: the per-capability explainer of the former aggregate, owned by the feature that owns the slot
pub fn explain_host_input_ingress(input: &HostInputCapabilities) -> HostCapabilityExplanation {
    return explain_host_capability_slot(
        "HostInputIngressCapability",
        "input",
        "ingress",
        input.ingress.is_some(),
        "no pointer, key, or wheel event reaches the input manager",
        "build the host from webHost in @flighthq/host-web",
        vec![HostCapabilityBackend {
            entry_point: "webHost".to_string(),
            package_name: "@flighthq/host-web".to_string(),
            platform: "Web".to_string(),
        }],
    );
}
