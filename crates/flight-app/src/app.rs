use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};
use flight_lifecycle::{AppLifecycleState, HostLifecycleCapability};
use flight_menu::MenuItemTemplate;
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::types::*;

/// Creates the app event entity with all six signals inert until attached.
pub fn create_app_events() -> AppEvents {
    let mut out: AppEvents = allocate_entity();
    initialize_app_events(&mut out);
    return out;
}

/// The construction initializer of `create_app_events`: fresh signals, nothing attached.
pub fn initialize_app_events(out: &mut AppEvents) {
    out.on_activate = create_signal();
    out.on_all_windows_closed = create_signal();
    out.on_open_file = create_signal();
    out.on_quit_request = create_signal();
    out.on_ready = create_signal();
    out.on_second_instance = create_signal();
    out.subscriptions = None;
}

/// Adds a path to the OS recent-documents list.
pub fn add_app_recent_document(
    host_app_recent_documents: &HostAppRecentDocumentsCapability,
    path: &str,
) {
    (host_app_recent_documents.add_recent_document)(path);
}

/// Forwards host activation to `app.on_activate`, replacing a prior activate attachment.
pub fn attach_app_activate(host_app_activate: &HostAppActivateCapability, app: &mut AppEvents) {
    let signal = app.on_activate.clone();
    let unsubscribe = (host_app_activate.subscribe)(Arc::new(move || emit_signal(&signal, &())));
    replace_app_subscription(app, AppSubscriptionKey::Activate, unsubscribe);
}

/// Forwards the host's all-windows-closed event to `app.on_all_windows_closed`.
pub fn attach_app_all_windows_closed(
    host_app_all_windows_closed: &HostAppAllWindowsClosedCapability,
    app: &mut AppEvents,
) {
    let signal = app.on_all_windows_closed.clone();
    let unsubscribe =
        (host_app_all_windows_closed.subscribe)(Arc::new(move || emit_signal(&signal, &())));
    replace_app_subscription(app, AppSubscriptionKey::AllWindowsClosed, unsubscribe);
}

/// Detaches every prior attachment, then attaches all six event providers in source order.
pub fn attach_app_events(
    host_app_activate: &HostAppActivateCapability,
    host_app_all_windows_closed: &HostAppAllWindowsClosedCapability,
    host_app_open_file: &HostAppOpenFileCapability,
    host_app_quit_request: &HostAppQuitRequestCapability,
    host_app_ready: &HostAppReadyCapability,
    host_app_second_instance: &HostAppSecondInstanceCapability,
    app: &mut AppEvents,
) {
    detach_app_events(app);
    attach_app_activate(host_app_activate, app);
    attach_app_all_windows_closed(host_app_all_windows_closed, app);
    attach_app_open_file(host_app_open_file, app);
    attach_app_quit_request(host_app_quit_request, app);
    attach_app_ready(host_app_ready, app);
    attach_app_second_instance(host_app_second_instance, app);
}

/// Forwards each opened file path to `app.on_open_file`.
pub fn attach_app_open_file(host_app_open_file: &HostAppOpenFileCapability, app: &mut AppEvents) {
    let signal = app.on_open_file.clone();
    let unsubscribe = (host_app_open_file.subscribe)(Arc::new(move |path: &str| {
        emit_signal(&signal, &path.to_string())
    }));
    replace_app_subscription(app, AppSubscriptionKey::OpenFile, unsubscribe);
}

/// Forwards a host quit request to `app.on_quit_request`; a listener that cancels the signal during
/// that emission is translated to the host's native veto callback.
pub fn attach_app_quit_request(
    host_app_quit_request: &HostAppQuitRequestCapability,
    app: &mut AppEvents,
) {
    let signal = app.on_quit_request.clone();
    let unsubscribe =
        (host_app_quit_request.subscribe)(Arc::new(move |cancel_host: AppCancelHost| {
            emit_signal(&signal, &());
            let cancelled = signal
                .data
                .read()
                .unwrap()
                .as_ref()
                .is_some_and(|data| data.cancelled);
            if cancelled {
                cancel_host();
            }
        }));
    replace_app_subscription(app, AppSubscriptionKey::QuitRequest, unsubscribe);
}

/// Forwards host readiness to `app.on_ready`.
pub fn attach_app_ready(host_app_ready: &HostAppReadyCapability, app: &mut AppEvents) {
    let signal = app.on_ready.clone();
    let unsubscribe = (host_app_ready.subscribe)(Arc::new(move || emit_signal(&signal, &())));
    replace_app_subscription(app, AppSubscriptionKey::Ready, unsubscribe);
}

/// Forwards a second instance's argv to `app.on_second_instance`.
pub fn attach_app_second_instance(
    host_app_second_instance: &HostAppSecondInstanceCapability,
    app: &mut AppEvents,
) {
    let signal = app.on_second_instance.clone();
    let unsubscribe = (host_app_second_instance.subscribe)(Arc::new(move |argv: &[String]| {
        emit_signal(&signal, &argv.to_vec());
    }));
    replace_app_subscription(app, AppSubscriptionKey::SecondInstance, unsubscribe);
}

/// Bounces the dock icon, returning the provider's bounce id.
pub fn bounce_app_dock(host_app_dock: &HostAppDockCapability) -> i32 {
    return (host_app_dock.bounce_dock)();
}

/// Cancels a prior attention request by id.
pub fn cancel_app_attention(host_app_dock: &HostAppDockCapability, id: i32) {
    (host_app_dock.cancel_attention)(id);
}

/// Cancels a prior dock bounce by id.
pub fn cancel_app_dock_bounce(host_app_dock: &HostAppDockCapability, id: i32) {
    (host_app_dock.cancel_dock_bounce)(id);
}

/// Clears the OS recent-documents list.
pub fn clear_app_recent_documents(host_app_recent_documents: &HostAppRecentDocumentsCapability) {
    (host_app_recent_documents.clear_recent_documents)();
}

/// Releases every attached host event. The record is removed before any release runs, so a
/// re-entrant detach is a no-op; releases run in first-attach order, and a release that panics stops
/// the rest, as a throw does in the source.
pub fn detach_app_events(app: &mut AppEvents) {
    let Some(subscriptions) = app.subscriptions.take() else {
        return;
    };
    for (_, unsubscribe) in subscriptions {
        unsubscribe();
    }
}

/// Detaches every host event and clears all six signals' listeners.
pub fn dispose_app_events(app: &mut AppEvents) {
    detach_app_events(app);
    clear_signal(&app.on_activate);
    clear_signal(&app.on_all_windows_closed);
    clear_signal(&app.on_open_file);
    clear_signal(&app.on_quit_request);
    clear_signal(&app.on_ready);
    clear_signal(&app.on_second_instance);
}

/// Brings the app to the foreground.
pub fn focus_app(host_app_focus: &HostAppFocusCapability) {
    (host_app_focus.focus)();
}

/// The app-relative directory of `kind`.
pub fn get_app_directory_path(host_app_path: &HostAppPathCapability, kind: AppPathKind) -> String {
    return (host_app_path.get_app_directory_path)(kind);
}

/// The running executable's path.
pub fn get_app_executable_path(host_app_path: &HostAppPathCapability) -> String {
    return (host_app_path.get_executable_path)();
}

/// The app's UI locale.
pub fn get_app_locale(host_app_locale: &HostAppLocaleCapability) -> String {
    return (host_app_locale.get_locale)();
}

/// The current login-item settings.
pub fn get_app_login_item(host_app_login_item: &HostAppLoginItemCapability) -> AppLoginItem {
    return (host_app_login_item.get_login_item)();
}

/// The app's display name.
pub fn get_app_name(host_app_name: &HostAppNameCapability) -> String {
    return (host_app_name.get_name)();
}

/// The app bundle/resource path.
pub fn get_app_path(host_app_path: &HostAppPathCapability) -> String {
    return (host_app_path.get_app_path)();
}

/// The OS preferred languages, in preference order.
pub fn get_app_preferred_system_languages(
    host_app_locale: &HostAppLocaleCapability,
) -> Vec<String> {
    return (host_app_locale.get_preferred_system_languages)();
}

/// The OS locale.
pub fn get_app_system_locale(host_app_locale: &HostAppLocaleCapability) -> String {
    return (host_app_locale.get_system_locale)();
}

/// The app's version string.
pub fn get_app_version(host_app_version: &HostAppVersionCapability) -> String {
    return (host_app_version.get_version)();
}

/// Whether this process holds the single-instance lock.
pub fn has_app_single_instance_lock(
    host_app_single_instance: &HostAppSingleInstanceCapability,
) -> bool {
    return (host_app_single_instance.has_single_instance_lock)();
}

/// Hides the app.
pub fn hide_app(host_app_hide: &HostAppHideCapability) {
    (host_app_hide.hide_app)();
}

/// Whether the host lifecycle reports the app in the background.
pub fn is_app_hidden(host_lifecycle: &HostLifecycleCapability) -> bool {
    return (host_lifecycle.get_state)() == AppLifecycleState::Background;
}

/// Quits the app.
pub fn quit_app(host_app_quit: &HostAppQuitCapability) {
    (host_app_quit.quit)();
}

/// Relaunches the app.
pub fn relaunch_app(host_app_relaunch: &HostAppRelaunchCapability) {
    (host_app_relaunch.relaunch)();
}

/// Releases the single-instance lock.
pub fn release_app_single_instance_lock(
    host_app_single_instance: &HostAppSingleInstanceCapability,
) {
    (host_app_single_instance.release_single_instance_lock)();
}

// The source subscribes (argument evaluation) before replacing: the new subscription exists, then
// the previous release for the same slot runs, then the new release is stored in that slot. A
// panicking previous release leaves the new one unstored, as a throw does in the source.
fn replace_app_subscription(
    app: &mut AppEvents,
    key: AppSubscriptionKey,
    unsubscribe: AppUnsubscribe,
) {
    let previous = app
        .subscriptions
        .as_ref()
        .and_then(|entries| entries.iter().find(|(entry, _)| *entry == key))
        .map(|(_, release)| release.clone());
    if let Some(previous) = previous {
        previous();
    }
    let entries = app.subscriptions.get_or_insert_with(Vec::new);
    match entries.iter_mut().find(|(entry, _)| *entry == key) {
        Some(slot) => slot.1 = unsubscribe,
        None => entries.push((key, unsubscribe)),
    }
}

/// Requests user attention (bouncing the dock until focused when `critical`), returning its id.
pub fn request_app_attention(host_app_dock: &HostAppDockCapability, critical: bool) -> i32 {
    return (host_app_dock.request_attention)(critical);
}

/// Requests the single-instance lock, returning whether it was acquired.
pub fn request_app_single_instance_lock(
    host_app_single_instance: &HostAppSingleInstanceCapability,
) -> bool {
    return (host_app_single_instance.request_single_instance_lock)();
}

/// Sets the macOS activation policy.
pub fn set_app_activation_policy(
    host_app_activation_policy: &HostAppActivationPolicyCapability,
    policy: AppActivationPolicy,
) {
    (host_app_activation_policy.set_activation_policy)(policy);
}

/// Sets the badge count; the provider's Promise (its outcome, or its rejection) is returned as is.
pub fn set_app_badge_count(
    host_app_badge: &HostAppBadgeCapability,
    count: i32,
) -> AppProviderFuture<bool> {
    return (host_app_badge.set_badge_count)(count);
}

/// Sets the dock badge text.
pub fn set_app_dock_badge(host_app_dock: &HostAppDockCapability, text: &str) {
    (host_app_dock.set_dock_badge)(text);
}

/// Installs the dock menu from shared descriptor handles (passed by identity).
pub fn set_app_dock_menu(host_app_dock: &HostAppDockCapability, items: &[Ref<MenuItemTemplate>]) {
    (host_app_dock.set_dock_menu)(items);
}

/// Updates the login-item settings; `None` fields keep their current values.
pub fn set_app_login_item(
    host_app_login_item: &HostAppLoginItemCapability,
    settings: &AppLoginItemLike,
) {
    (host_app_login_item.set_login_item)(settings);
}

/// Sets the app's display name.
pub fn set_app_name(host_app_name_write: &HostAppNameWriteCapability, name: &str) {
    (host_app_name_write.set_name)(name);
}

/// Sets the Windows application user model id.
pub fn set_app_user_model_id(host_app_user_model_id: &HostAppUserModelIdCapability, id: &str) {
    (host_app_user_model_id.set_user_model_id)(id);
}

/// Shows the app.
pub fn show_app(host_app_show: &HostAppShowCapability) {
    (host_app_show.show_app)();
}
