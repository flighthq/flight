//! flight-compiler: rust-only

//! Host capability explanations for the capability group this crate owns (`textSegment`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts` and
//! `enableHostGuards.ts`). Each explainer appends to a caller-owned explanation, so a host provider
//! composes its own host's explanation; there is no aggregate.

use flight_host::{
    HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityExplanation,
    HostCapabilityGroupExplanation, HostExplanation, explain_host_capability_slot,
};
use flight_log::{LogStateRef, warn_missing_host_capability};

use crate::HostTextSegmentCapabilities;

/// Warns once for each guarded `textSegment` slot (`segmenter`) the group is missing (TS
/// `enableHostGuards` over `host.textSegment`), through the caller-owned log state (D5). The
/// warning is the slot's own explainer, so a warning cannot contradict a query, and `log_once` keys
/// per slot.
// flight-lint: allow(conform-extra, f64) D26: the former aggregate enableHostGuards for this group, owned by its feature; D5: the injected log clock is flight-log's f64 milliseconds
pub fn enable_host_text_segment_guards(
    state: &LogStateRef,
    now_ms: f64,
    text_segment: &HostTextSegmentCapabilities,
) {
    warn_missing_host_capability(state, now_ms, &explain_host_text_segmenter(text_segment));
}

/// Appends the `textSegment` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`segmenter`), to a host explanation (TS `explainHost` over
/// `host.textSegment`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the textSegment group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_text_segment_capabilities(
    out: &mut HostExplanation,
    text_segment: &HostTextSegmentCapabilities,
) {
    let mut slots = Vec::new();
    if text_segment.segmenter.is_some() {
        slots.push("segmenter".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "textSegment".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostTextSegmenterCapability".to_string(),
        group: "textSegment".to_string(),
        is_present: text_segment.segmenter.is_some(),
        slot: "segmenter".to_string(),
    });
}

/// Whether `host.textSegment.segmenter` is filled and, when it is absent, which package supplies
/// the capability (TS `explainHostTextSegmenter`).
// flight-lint: allow(conform-extra) D26: the per-capability explainer of the former aggregate, owned by the feature that owns the slot
pub fn explain_host_text_segmenter(
    text_segment: &HostTextSegmentCapabilities,
) -> HostCapabilityExplanation {
    return explain_host_capability_slot(
        "HostTextSegmenterCapability",
        "textSegment",
        "segmenter",
        text_segment.segmenter.is_some(),
        "grapheme, word, and sentence breaking fall back to code-unit boundaries",
        "pass createWebTextSegmenterBackend() from @flighthq/textsegment into createHost's textSegment group",
        vec![HostCapabilityBackend {
            entry_point: "createWebTextSegmenterBackend".to_string(),
            package_name: "@flighthq/textsegment".to_string(),
            platform: "Web".to_string(),
        }],
    );
}
