//! Host capability explanations for the capability group this crate owns (`video`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts` and `enableHostGuards.ts`). Each
//! explainer appends to a caller-owned explanation, so a host provider composes its own host's
//! explanation; there is no aggregate.

use flight_host::{
    HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityExplanation,
    HostCapabilityGroupExplanation, HostExplanation, explain_host_capability_slot,
};
use flight_log::{LogStateRef, warn_missing_host_capability};

use crate::HostVideoCapabilities;

/// Warns once for each guarded `video` slot (`playback`) the group is missing (TS
/// `enableHostGuards` over `host.video`), through the caller-owned log state (D5). The warning is
/// the slot's own explainer, so a warning cannot contradict a query, and `log_once` keys per slot.
// flight-lint: allow(conform-extra, f64) D26: the former aggregate enableHostGuards for this group, owned by its feature; D5: the injected log clock is flight-log's f64 milliseconds
pub fn enable_host_video_guards(state: &LogStateRef, now_ms: f64, video: &HostVideoCapabilities) {
    warn_missing_host_capability(state, now_ms, &explain_host_video(video));
}

/// Whether `host.video.playback` is filled and, when it is absent, which package supplies the
/// capability (TS `explainHostVideo`).
// flight-lint: allow(conform-extra) D26: the per-capability explainer of the former aggregate, owned by the feature that owns the slot
pub fn explain_host_video(video: &HostVideoCapabilities) -> HostCapabilityExplanation {
    return explain_host_capability_slot(
        "HostVideoCapability",
        "video",
        "playback",
        video.playback.is_some(),
        "nothing can decode or present video",
        "build the host from webHost in @flighthq/host-web",
        vec![HostCapabilityBackend {
            entry_point: "webHost".to_string(),
            package_name: "@flighthq/host-web".to_string(),
            platform: "Web".to_string(),
        }],
    );
}

/// Appends the `video` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`playback`), to a host explanation (TS `explainHost` over `host.video`). A
/// host provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the video group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_video_capabilities(out: &mut HostExplanation, video: &HostVideoCapabilities) {
    let mut slots = Vec::new();
    if video.playback.is_some() {
        slots.push("playback".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "video".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostVideoCapability".to_string(),
        group: "video".to_string(),
        is_present: video.playback.is_some(),
        slot: "playback".to_string(),
    });
}
