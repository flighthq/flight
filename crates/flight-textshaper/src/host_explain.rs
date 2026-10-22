//! Host capability explanations for the capability group this crate owns (`textShaper`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts` and
//! `enableHostGuards.ts`). Each explainer appends to a caller-owned explanation, so a host provider
//! composes its own host's explanation; there is no aggregate.

use flight_host::{
    HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityExplanation,
    HostCapabilityGroupExplanation, HostExplanation, explain_host_capability_slot,
};
use flight_log::{LogStateRef, warn_missing_host_capability};

use crate::HostTextShaperCapabilities;

/// Warns once for each guarded `textShaper` slot (`shaper`) the group is missing (TS
/// `enableHostGuards` over `host.textShaper`), through the caller-owned log state (D5). The warning
/// is the slot's own explainer, so a warning cannot contradict a query, and `log_once` keys per
/// slot.
// flight-lint: allow(conform-extra, f64) D26: the former aggregate enableHostGuards for this group, owned by its feature; D5: the injected log clock is flight-log's f64 milliseconds
pub fn enable_host_text_shaper_guards(
    state: &LogStateRef,
    now_ms: f64,
    text_shaper: &HostTextShaperCapabilities,
) {
    warn_missing_host_capability(state, now_ms, &explain_host_text_shaper(text_shaper));
}

/// Whether `host.textShaper.shaper` is filled and, when it is absent, which package supplies the
/// capability (TS `explainHostTextShaper`).
// flight-lint: allow(conform-extra) D26: the per-capability explainer of the former aggregate, owned by the feature that owns the slot
pub fn explain_host_text_shaper(
    text_shaper: &HostTextShaperCapabilities,
) -> HostCapabilityExplanation {
    return explain_host_capability_slot(
        "HostTextShaperCapability",
        "textShaper",
        "shaper",
        text_shaper.shaper.is_some(),
        "text cannot be measured or shaped and lays out at zero width",
        "pass webHostTextShaper from @flighthq/host-web into createHost's textShaper group",
        vec![HostCapabilityBackend {
            entry_point: "webHostTextShaper".to_string(),
            package_name: "@flighthq/host-web".to_string(),
            platform: "Canvas 2D".to_string(),
        }],
    );
}

/// Appends the `textShaper` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`shaper`), to a host explanation (TS `explainHost` over
/// `host.textShaper`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the textShaper group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_text_shaper_capabilities(
    out: &mut HostExplanation,
    text_shaper: &HostTextShaperCapabilities,
) {
    let mut slots = Vec::new();
    if text_shaper.shaper.is_some() {
        slots.push("shaper".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "textShaper".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostTextShaperCapability".to_string(),
        group: "textShaper".to_string(),
        is_present: text_shaper.shaper.is_some(),
        slot: "shaper".to_string(),
    });
}
