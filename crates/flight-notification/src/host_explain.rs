//! Host capability explanations for the capability group this crate owns (`notification`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostNotificationCapabilities;

/// Appends the `notification` group and its filled slot names, in source property order, and the
/// presence of its covered slot (`permission`), to a host explanation (TS `explainHost` over
/// `host.notification`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the notification group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_notification_capabilities(
    out: &mut HostExplanation,
    notification: &HostNotificationCapabilities,
) {
    let mut slots = Vec::new();
    if notification.action.is_some() {
        slots.push("action".to_string());
    }
    if notification.active_list.is_some() {
        slots.push("activeList".to_string());
    }
    if notification.click.is_some() {
        slots.push("click".to_string());
    }
    if notification.close.is_some() {
        slots.push("close".to_string());
    }
    if notification.delivery.is_some() {
        slots.push("delivery".to_string());
    }
    if notification.dismiss.is_some() {
        slots.push("dismiss".to_string());
    }
    if notification.lifecycle.is_some() {
        slots.push("lifecycle".to_string());
    }
    if notification.permission.is_some() {
        slots.push("permission".to_string());
    }
    if notification.received.is_some() {
        slots.push("received".to_string());
    }
    if notification.reply.is_some() {
        slots.push("reply".to_string());
    }
    if notification.scheduling.is_some() {
        slots.push("scheduling".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "notification".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostNotificationPermissionCapability".to_string(),
        group: "notification".to_string(),
        is_present: notification.permission.is_some(),
        slot: "permission".to_string(),
    });
}
