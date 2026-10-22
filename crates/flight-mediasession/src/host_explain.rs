//! Host capability explanations for the capability group this crate owns (`mediaSession`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostMediaSessionCapabilities;

/// Appends the `mediaSession` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.mediaSession`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the mediaSession group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_media_session_capabilities(
    out: &mut HostExplanation,
    media_session: &HostMediaSessionCapabilities,
) {
    let mut slots = Vec::new();
    if media_session.action.is_some() {
        slots.push("action".to_string());
    }
    if media_session.control.is_some() {
        slots.push("control".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "mediaSession".to_string(),
        slots,
    });
}
