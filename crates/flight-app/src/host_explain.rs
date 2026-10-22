//! Host capability explanations for the capability groups this crate owns (`app`, `fullscreen`,
//! `window`), redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each
//! explainer appends to a caller-owned explanation, so a host provider composes its own host's
//! explanation; there is no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::{HostAppCapabilities, HostFullscreenCapabilities, HostWindowCapabilities};

/// Appends the `app` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.app`). A host provider composes its host's explanation
/// by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the app group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_app_capabilities(out: &mut HostExplanation, app: &HostAppCapabilities) {
    let mut slots = Vec::new();
    if app.activate.is_some() {
        slots.push("activate".to_string());
    }
    if app.activation_policy.is_some() {
        slots.push("activationPolicy".to_string());
    }
    if app.all_windows_closed.is_some() {
        slots.push("allWindowsClosed".to_string());
    }
    if app.badge.is_some() {
        slots.push("badge".to_string());
    }
    if app.dock.is_some() {
        slots.push("dock".to_string());
    }
    if app.exit.is_some() {
        slots.push("exit".to_string());
    }
    if app.focus.is_some() {
        slots.push("focus".to_string());
    }
    if app.hide.is_some() {
        slots.push("hide".to_string());
    }
    if app.locale.is_some() {
        slots.push("locale".to_string());
    }
    if app.login_item.is_some() {
        slots.push("loginItem".to_string());
    }
    if app.loop_.is_some() {
        slots.push("loop".to_string());
    }
    if app.name.is_some() {
        slots.push("name".to_string());
    }
    if app.name_write.is_some() {
        slots.push("nameWrite".to_string());
    }
    if app.open_file.is_some() {
        slots.push("openFile".to_string());
    }
    if app.path.is_some() {
        slots.push("path".to_string());
    }
    if app.quit.is_some() {
        slots.push("quit".to_string());
    }
    if app.quit_request.is_some() {
        slots.push("quitRequest".to_string());
    }
    if app.ready.is_some() {
        slots.push("ready".to_string());
    }
    if app.recent_documents.is_some() {
        slots.push("recentDocuments".to_string());
    }
    if app.relaunch.is_some() {
        slots.push("relaunch".to_string());
    }
    if app.second_instance.is_some() {
        slots.push("secondInstance".to_string());
    }
    if app.show.is_some() {
        slots.push("show".to_string());
    }
    if app.single_instance.is_some() {
        slots.push("singleInstance".to_string());
    }
    if app.user_model_id.is_some() {
        slots.push("userModelId".to_string());
    }
    if app.version.is_some() {
        slots.push("version".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "app".to_string(),
        slots,
    });
}

/// Appends the `fullscreen` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.fullscreen`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the fullscreen group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_fullscreen_capabilities(
    out: &mut HostExplanation,
    fullscreen: &HostFullscreenCapabilities,
) {
    let mut slots = Vec::new();
    if fullscreen.element.is_some() {
        slots.push("element".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "fullscreen".to_string(),
        slots,
    });
}

/// Appends the `window` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.window`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the window group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_window_capabilities(
    out: &mut HostExplanation,
    window: &HostWindowCapabilities,
) {
    let mut slots = Vec::new();
    if window.appearance.is_some() {
        slots.push("appearance".to_string());
    }
    if window.attach.is_some() {
        slots.push("attach".to_string());
    }
    if window.attention.is_some() {
        slots.push("attention".to_string());
    }
    if window.content_protection.is_some() {
        slots.push("contentProtection".to_string());
    }
    if window.focus.is_some() {
        slots.push("focus".to_string());
    }
    if window.fullscreen.is_some() {
        slots.push("fullscreen".to_string());
    }
    if window.geometry.is_some() {
        slots.push("geometry".to_string());
    }
    if window.hierarchy.is_some() {
        slots.push("hierarchy".to_string());
    }
    if window.lifecycle.is_some() {
        slots.push("lifecycle".to_string());
    }
    if window.progress.is_some() {
        slots.push("progress".to_string());
    }
    if window.shadow.is_some() {
        slots.push("shadow".to_string());
    }
    if window.shell.is_some() {
        slots.push("shell".to_string());
    }
    if window.size_constraints.is_some() {
        slots.push("sizeConstraints".to_string());
    }
    if window.state.is_some() {
        slots.push("state".to_string());
    }
    if window.visibility.is_some() {
        slots.push("visibility".to_string());
    }
    if window.z_order.is_some() {
        slots.push("zOrder".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "window".to_string(),
        slots,
    });
}
