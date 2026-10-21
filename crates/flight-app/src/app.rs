use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};
use flight_lifecycle::{AppLifecycleState, HostLifecycleCapability};
use flight_menu::MenuItemTemplate;
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
#[path = "../tests/fixture.rs"]
mod fixture;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll, Waker};

    use flight_signals::connect_signal;

    use super::fixture::*;
    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    #[test]
    fn app_events_detach_matches_detach_app_events() {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        attach_app_ready(&fa.ready, &mut a);
        attach_app_ready(&fb.ready, &mut b);
        a.detach();
        detach_app_events(&mut b);
        assert_eq!(
            fa.listeners.lock().unwrap().released,
            fb.listeners.lock().unwrap().released
        );
        assert_eq!(
            fa.listeners.lock().unwrap().released,
            vec!["ready".to_string()]
        );
    }

    #[test]
    fn app_events_dispose_matches_dispose_app_events() {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        attach_app_ready(&fa.ready, &mut a);
        attach_app_ready(&fb.ready, &mut b);
        a.dispose();
        dispose_app_events(&mut b);
        assert_eq!(
            fa.listeners.lock().unwrap().released,
            fb.listeners.lock().unwrap().released
        );
        assert_eq!(
            fa.listeners.lock().unwrap().released,
            vec!["ready".to_string()]
        );
    }

    #[test]
    fn app_events_new_matches_create_app_events() {
        let (a, b) = (AppEvents::new(), create_app_events());
        assert!(a.subscriptions.is_none() && b.subscriptions.is_none());
        assert!(!Arc::ptr_eq(&a.on_ready.data, &b.on_ready.data));
        assert!(!Arc::ptr_eq(&a.on_ready.data, &a.on_activate.data));
    }

    #[test]
    fn host_app_activate_capability_attach_app_activate_matches_attach_app_activate() {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        fa.activate.attach_app_activate(&mut a);
        attach_app_activate(&fb.activate, &mut b);
        let count = |app: &AppEvents, fixture: &Fixture| {
            let seen = Arc::new(Mutex::new(0));
            let tally = seen.clone();
            connect_signal(
                &app.on_activate,
                Arc::new(move |_value: &_| *tally.lock().unwrap() += 1),
                None,
            );
            let listener = fixture.listeners.lock().unwrap().activate.clone().unwrap();
            listener();
            return *seen.lock().unwrap();
        };
        assert_eq!(count(&a, &fa), count(&b, &fb));
        assert_eq!(count(&a, &fa), 1);
    }

    #[test]
    fn host_app_activate_capability_attach_app_events_matches_attach_app_events() {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        fa.activate.attach_app_events(
            &fa.all_windows_closed,
            &fa.open_file,
            &fa.quit_request,
            &fa.ready,
            &fa.second_instance,
            &mut a,
        );
        attach_app_events(
            &fb.activate,
            &fb.all_windows_closed,
            &fb.open_file,
            &fb.quit_request,
            &fb.ready,
            &fb.second_instance,
            &mut b,
        );
        assert_eq!(a.subscriptions.as_ref().map(|e| e.len()), Some(6));
        assert_eq!(b.subscriptions.as_ref().map(|e| e.len()), Some(6));
    }

    #[test]
    fn host_app_activation_policy_capability_set_app_activation_policy_matches_set_app_activation_policy()
     {
        let (fa, fb) = (fixture(), fixture());
        fa.activation_policy
            .set_app_activation_policy(AppActivationPolicy::Accessory);
        set_app_activation_policy(&fb.activation_policy, AppActivationPolicy::Accessory);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_all_windows_closed_capability_attach_app_all_windows_closed_matches_attach_app_all_windows_closed()
     {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        fa.all_windows_closed.attach_app_all_windows_closed(&mut a);
        attach_app_all_windows_closed(&fb.all_windows_closed, &mut b);
        let count = |app: &AppEvents, fixture: &Fixture| {
            let seen = Arc::new(Mutex::new(0));
            let tally = seen.clone();
            connect_signal(
                &app.on_all_windows_closed,
                Arc::new(move |_value: &_| *tally.lock().unwrap() += 1),
                None,
            );
            let listener = fixture
                .listeners
                .lock()
                .unwrap()
                .all_windows_closed
                .clone()
                .unwrap();
            listener();
            return *seen.lock().unwrap();
        };
        assert_eq!(count(&a, &fa), count(&b, &fb));
        assert_eq!(count(&a, &fa), 1);
    }

    #[test]
    fn host_app_badge_capability_set_app_badge_count_matches_set_app_badge_count() {
        let (fa, fb) = (fixture(), fixture());
        let a = block_on(fa.badge.set_app_badge_count(7)).unwrap();
        let b = block_on(set_app_badge_count(&fb.badge, 7)).unwrap();
        assert_eq!(a, b);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(*fa.calls.lock().unwrap(), vec!["badge:7".to_string()]);
    }

    #[test]
    fn host_app_dock_capability_bounce_app_dock_matches_bounce_app_dock() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(fa.dock.bounce_app_dock(), bounce_app_dock(&fb.dock));
    }

    #[test]
    fn host_app_dock_capability_cancel_app_attention_matches_cancel_app_attention() {
        let (fa, fb) = (fixture(), fixture());
        fa.dock.cancel_app_attention(3);
        cancel_app_attention(&fb.dock, 3);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_dock_capability_cancel_app_dock_bounce_matches_cancel_app_dock_bounce() {
        let (fa, fb) = (fixture(), fixture());
        fa.dock.cancel_app_dock_bounce(4);
        cancel_app_dock_bounce(&fb.dock, 4);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_dock_capability_request_app_attention_matches_request_app_attention() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(
            fa.dock.request_app_attention(true),
            request_app_attention(&fb.dock, true)
        );
    }

    #[test]
    fn host_app_dock_capability_set_app_dock_badge_matches_set_app_dock_badge() {
        let (fa, fb) = (fixture(), fixture());
        fa.dock.set_app_dock_badge("x");
        set_app_dock_badge(&fb.dock, "x");
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_dock_capability_set_app_dock_menu_matches_set_app_dock_menu() {
        let (fa, fb) = (fixture(), fixture());
        fa.dock.set_app_dock_menu(&[]);
        set_app_dock_menu(&fb.dock, &[]);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_focus_capability_focus_app_matches_focus_app() {
        let (fa, fb) = (fixture(), fixture());
        fa.focus.focus_app();
        focus_app(&fb.focus);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_hide_capability_hide_app_matches_hide_app() {
        let (fa, fb) = (fixture(), fixture());
        fa.hide.hide_app();
        hide_app(&fb.hide);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_locale_capability_get_app_locale_matches_get_app_locale() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(fa.locale.get_app_locale(), get_app_locale(&fb.locale));
    }

    #[test]
    fn host_app_locale_capability_get_app_preferred_system_languages_matches_get_app_preferred_system_languages()
     {
        let (fa, fb) = (fixture(), fixture());
        let (mut method, mut free) = (Vec::new(), Vec::new());
        fa.locale.get_app_preferred_system_languages(&mut method);
        get_app_preferred_system_languages(&mut free, &fb.locale);
        assert_eq!(method, free);
    }

    #[test]
    fn host_app_locale_capability_get_app_system_locale_matches_get_app_system_locale() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(
            fa.locale.get_app_system_locale(),
            get_app_system_locale(&fb.locale)
        );
    }

    #[test]
    fn host_app_login_item_capability_get_app_login_item_matches_get_app_login_item() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(
            fa.login_item.get_app_login_item(),
            get_app_login_item(&fb.login_item)
        );
    }

    #[test]
    fn host_app_login_item_capability_set_app_login_item_matches_set_app_login_item() {
        let (fa, fb) = (fixture(), fixture());
        let settings = AppLoginItemLike {
            open_at_login: Some(true),
            open_as_hidden: None,
            path: None,
            args: None,
        };
        fa.login_item.set_app_login_item(&settings);
        set_app_login_item(&fb.login_item, &settings);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_name_capability_get_app_name_matches_get_app_name() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(fa.name.get_app_name(), get_app_name(&fb.name));
    }

    #[test]
    fn host_app_name_write_capability_set_app_name_matches_set_app_name() {
        let (fa, fb) = (fixture(), fixture());
        fa.name_write.set_app_name("Renamed");
        set_app_name(&fb.name_write, "Renamed");
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_open_file_capability_attach_app_open_file_matches_attach_app_open_file() {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        fa.open_file.attach_app_open_file(&mut a);
        attach_app_open_file(&fb.open_file, &mut b);
        let count = |app: &AppEvents, fixture: &Fixture| {
            let seen = Arc::new(Mutex::new(0));
            let tally = seen.clone();
            connect_signal(
                &app.on_open_file,
                Arc::new(move |_value: &_| *tally.lock().unwrap() += 1),
                None,
            );
            let listener = fixture.listeners.lock().unwrap().open_file.clone().unwrap();
            listener("/tmp/a.txt");
            return *seen.lock().unwrap();
        };
        assert_eq!(count(&a, &fa), count(&b, &fb));
        assert_eq!(count(&a, &fa), 1);
    }

    #[test]
    fn host_app_path_capability_get_app_directory_path_matches_get_app_directory_path() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(
            fa.path.get_app_directory_path(AppPathKind::Logs),
            get_app_directory_path(&fb.path, AppPathKind::Logs)
        );
    }

    #[test]
    fn host_app_path_capability_get_app_executable_path_matches_get_app_executable_path() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(
            fa.path.get_app_executable_path(),
            get_app_executable_path(&fb.path)
        );
    }

    #[test]
    fn host_app_path_capability_get_app_path_matches_get_app_path() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(fa.path.get_app_path(), get_app_path(&fb.path));
    }

    #[test]
    fn host_app_quit_capability_quit_app_matches_quit_app() {
        let (fa, fb) = (fixture(), fixture());
        fa.quit.quit_app();
        quit_app(&fb.quit);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_quit_request_capability_attach_app_quit_request_matches_attach_app_quit_request() {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        fa.quit_request.attach_app_quit_request(&mut a);
        attach_app_quit_request(&fb.quit_request, &mut b);
        let count = |app: &AppEvents, fixture: &Fixture| {
            let seen = Arc::new(Mutex::new(0));
            let tally = seen.clone();
            connect_signal(
                &app.on_quit_request,
                Arc::new(move |_value: &_| *tally.lock().unwrap() += 1),
                None,
            );
            let listener = fixture
                .listeners
                .lock()
                .unwrap()
                .quit_request
                .clone()
                .unwrap();
            listener(Arc::new(|| {}));
            return *seen.lock().unwrap();
        };
        assert_eq!(count(&a, &fa), count(&b, &fb));
        assert_eq!(count(&a, &fa), 1);
    }

    #[test]
    fn host_app_ready_capability_attach_app_ready_matches_attach_app_ready() {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        fa.ready.attach_app_ready(&mut a);
        attach_app_ready(&fb.ready, &mut b);
        let count = |app: &AppEvents, fixture: &Fixture| {
            let seen = Arc::new(Mutex::new(0));
            let tally = seen.clone();
            connect_signal(
                &app.on_ready,
                Arc::new(move |_value: &_| *tally.lock().unwrap() += 1),
                None,
            );
            let listener = fixture.listeners.lock().unwrap().ready.clone().unwrap();
            listener();
            return *seen.lock().unwrap();
        };
        assert_eq!(count(&a, &fa), count(&b, &fb));
        assert_eq!(count(&a, &fa), 1);
    }

    #[test]
    fn host_app_recent_documents_capability_add_app_recent_document_matches_add_app_recent_document()
     {
        let (fa, fb) = (fixture(), fixture());
        fa.recent_documents.add_app_recent_document("/tmp/a");
        add_app_recent_document(&fb.recent_documents, "/tmp/a");
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_recent_documents_capability_clear_app_recent_documents_matches_clear_app_recent_documents()
     {
        let (fa, fb) = (fixture(), fixture());
        fa.recent_documents.clear_app_recent_documents();
        clear_app_recent_documents(&fb.recent_documents);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_relaunch_capability_relaunch_app_matches_relaunch_app() {
        let (fa, fb) = (fixture(), fixture());
        fa.relaunch.relaunch_app();
        relaunch_app(&fb.relaunch);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_second_instance_capability_attach_app_second_instance_matches_attach_app_second_instance()
     {
        let (fa, fb) = (fixture(), fixture());
        let (mut a, mut b) = (create_app_events(), create_app_events());
        fa.second_instance.attach_app_second_instance(&mut a);
        attach_app_second_instance(&fb.second_instance, &mut b);
        let count = |app: &AppEvents, fixture: &Fixture| {
            let seen = Arc::new(Mutex::new(0));
            let tally = seen.clone();
            connect_signal(
                &app.on_second_instance,
                Arc::new(move |_value: &_| *tally.lock().unwrap() += 1),
                None,
            );
            let listener = fixture
                .listeners
                .lock()
                .unwrap()
                .second_instance
                .clone()
                .unwrap();
            listener(&["--open".to_string()]);
            return *seen.lock().unwrap();
        };
        assert_eq!(count(&a, &fa), count(&b, &fb));
        assert_eq!(count(&a, &fa), 1);
    }

    #[test]
    fn host_app_show_capability_show_app_matches_show_app() {
        let (fa, fb) = (fixture(), fixture());
        fa.show.show_app();
        show_app(&fb.show);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_single_instance_capability_has_app_single_instance_lock_matches_has_app_single_instance_lock()
     {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(
            fa.single_instance.has_app_single_instance_lock(),
            has_app_single_instance_lock(&fb.single_instance)
        );
    }

    #[test]
    fn host_app_single_instance_capability_release_app_single_instance_lock_matches_release_app_single_instance_lock()
     {
        let (fa, fb) = (fixture(), fixture());
        fa.single_instance.release_app_single_instance_lock();
        release_app_single_instance_lock(&fb.single_instance);
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_single_instance_capability_request_app_single_instance_lock_matches_request_app_single_instance_lock()
     {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(
            fa.single_instance.request_app_single_instance_lock(),
            request_app_single_instance_lock(&fb.single_instance)
        );
    }

    #[test]
    fn host_app_user_model_id_capability_set_app_user_model_id_matches_set_app_user_model_id() {
        let (fa, fb) = (fixture(), fixture());
        fa.user_model_id.set_app_user_model_id("flight.app");
        set_app_user_model_id(&fb.user_model_id, "flight.app");
        assert_eq!(*fa.calls.lock().unwrap(), *fb.calls.lock().unwrap());
        assert_eq!(fa.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn host_app_version_capability_get_app_version_matches_get_app_version() {
        let (fa, fb) = (fixture(), fixture());
        assert_eq!(fa.version.get_app_version(), get_app_version(&fb.version));
    }
}

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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppActivationPolicy string union; the TS package exports no get_/parse_ free functions
pub fn get_app_activation_policy_string(value: AppActivationPolicy) -> &'static str {
    return match value {
        AppActivationPolicy::Regular => "regular",
        AppActivationPolicy::Accessory => "accessory",
        AppActivationPolicy::Prohibited => "prohibited",
    };
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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppPathKind string union; the TS package exports no get_/parse_ free functions
pub fn get_app_path_kind_string(value: AppPathKind) -> &'static str {
    return match value {
        AppPathKind::UserData => "userData",
        AppPathKind::Logs => "logs",
        AppPathKind::CrashDumps => "crashDumps",
    };
}

/// The OS preferred languages, in preference order.
// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the result fills a caller-owned out, cleared first
pub fn get_app_preferred_system_languages(
    out: &mut Vec<String>,
    host_app_locale: &HostAppLocaleCapability,
) {
    out.clear();
    out.extend((host_app_locale.get_preferred_system_languages)());
}

/// The OS locale.
pub fn get_app_system_locale(host_app_locale: &HostAppLocaleCapability) -> String {
    return (host_app_locale.get_system_locale)();
}

/// The app's version string.
pub fn get_app_version(host_app_version: &HostAppVersionCapability) -> String {
    return (host_app_version.get_version)();
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MobileOsProfile string union; the TS package exports no get_/parse_ free functions
pub fn get_mobile_os_profile_string(value: MobileOsProfile) -> &'static str {
    return match value {
        MobileOsProfile::Android => "android",
        MobileOsProfile::Ios => "ios",
    };
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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppActivationPolicy string union; the TS package exports no get_/parse_ free functions
pub fn parse_app_activation_policy(value: &str) -> Option<AppActivationPolicy> {
    return match value {
        "regular" => Some(AppActivationPolicy::Regular),
        "accessory" => Some(AppActivationPolicy::Accessory),
        "prohibited" => Some(AppActivationPolicy::Prohibited),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppPathKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_app_path_kind(value: &str) -> Option<AppPathKind> {
    return match value {
        "userData" => Some(AppPathKind::UserData),
        "logs" => Some(AppPathKind::Logs),
        "crashDumps" => Some(AppPathKind::CrashDumps),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MobileOsProfile string union; the TS package exports no get_/parse_ free functions
pub fn parse_mobile_os_profile(value: &str) -> Option<MobileOsProfile> {
    return match value {
        "android" => Some(MobileOsProfile::Android),
        "ios" => Some(MobileOsProfile::Ios),
        _ => None,
    };
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

impl AppEvents {
    pub fn new() -> Self {
        return create_app_events();
    }

    pub fn detach(&mut self) {
        detach_app_events(self);
    }

    pub fn dispose(&mut self) {
        dispose_app_events(self);
    }
}

impl HostAppActivateCapability {
    pub fn attach_app_activate(&self, app: &mut AppEvents) {
        attach_app_activate(self, app);
    }

    pub fn attach_app_events(
        &self,
        host_app_all_windows_closed: &HostAppAllWindowsClosedCapability,
        host_app_open_file: &HostAppOpenFileCapability,
        host_app_quit_request: &HostAppQuitRequestCapability,
        host_app_ready: &HostAppReadyCapability,
        host_app_second_instance: &HostAppSecondInstanceCapability,
        app: &mut AppEvents,
    ) {
        attach_app_events(
            self,
            host_app_all_windows_closed,
            host_app_open_file,
            host_app_quit_request,
            host_app_ready,
            host_app_second_instance,
            app,
        );
    }
}

impl HostAppActivationPolicyCapability {
    pub fn set_app_activation_policy(&self, policy: AppActivationPolicy) {
        set_app_activation_policy(self, policy);
    }
}

impl HostAppAllWindowsClosedCapability {
    pub fn attach_app_all_windows_closed(&self, app: &mut AppEvents) {
        attach_app_all_windows_closed(self, app);
    }
}

impl HostAppBadgeCapability {
    pub fn set_app_badge_count(&self, count: i32) -> AppProviderFuture<bool> {
        return set_app_badge_count(self, count);
    }
}

impl HostAppDockCapability {
    pub fn bounce_app_dock(&self) -> i32 {
        return bounce_app_dock(self);
    }

    pub fn cancel_app_attention(&self, id: i32) {
        cancel_app_attention(self, id);
    }

    pub fn cancel_app_dock_bounce(&self, id: i32) {
        cancel_app_dock_bounce(self, id);
    }

    pub fn request_app_attention(&self, critical: bool) -> i32 {
        return request_app_attention(self, critical);
    }

    pub fn set_app_dock_badge(&self, text: &str) {
        set_app_dock_badge(self, text);
    }

    pub fn set_app_dock_menu(&self, items: &[Ref<MenuItemTemplate>]) {
        set_app_dock_menu(self, items);
    }
}

impl HostAppFocusCapability {
    pub fn focus_app(&self) {
        focus_app(self);
    }
}

impl HostAppHideCapability {
    pub fn hide_app(&self) {
        hide_app(self);
    }
}

impl HostAppLocaleCapability {
    pub fn get_app_locale(&self) -> String {
        return get_app_locale(self);
    }

    pub fn get_app_preferred_system_languages(&self, out: &mut Vec<String>) {
        get_app_preferred_system_languages(out, self);
    }

    pub fn get_app_system_locale(&self) -> String {
        return get_app_system_locale(self);
    }
}

impl HostAppLoginItemCapability {
    pub fn get_app_login_item(&self) -> AppLoginItem {
        return get_app_login_item(self);
    }

    pub fn set_app_login_item(&self, settings: &AppLoginItemLike) {
        set_app_login_item(self, settings);
    }
}

impl HostAppNameCapability {
    pub fn get_app_name(&self) -> String {
        return get_app_name(self);
    }
}

impl HostAppNameWriteCapability {
    pub fn set_app_name(&self, name: &str) {
        set_app_name(self, name);
    }
}

impl HostAppOpenFileCapability {
    pub fn attach_app_open_file(&self, app: &mut AppEvents) {
        attach_app_open_file(self, app);
    }
}

impl HostAppPathCapability {
    pub fn get_app_directory_path(&self, kind: AppPathKind) -> String {
        return get_app_directory_path(self, kind);
    }

    pub fn get_app_executable_path(&self) -> String {
        return get_app_executable_path(self);
    }

    pub fn get_app_path(&self) -> String {
        return get_app_path(self);
    }
}

impl HostAppQuitCapability {
    pub fn quit_app(&self) {
        quit_app(self);
    }
}

impl HostAppQuitRequestCapability {
    pub fn attach_app_quit_request(&self, app: &mut AppEvents) {
        attach_app_quit_request(self, app);
    }
}

impl HostAppReadyCapability {
    pub fn attach_app_ready(&self, app: &mut AppEvents) {
        attach_app_ready(self, app);
    }
}

impl HostAppRecentDocumentsCapability {
    pub fn add_app_recent_document(&self, path: &str) {
        add_app_recent_document(self, path);
    }

    pub fn clear_app_recent_documents(&self) {
        clear_app_recent_documents(self);
    }
}

impl HostAppRelaunchCapability {
    pub fn relaunch_app(&self) {
        relaunch_app(self);
    }
}

impl HostAppSecondInstanceCapability {
    pub fn attach_app_second_instance(&self, app: &mut AppEvents) {
        attach_app_second_instance(self, app);
    }
}

impl HostAppShowCapability {
    pub fn show_app(&self) {
        show_app(self);
    }
}

impl HostAppSingleInstanceCapability {
    pub fn has_app_single_instance_lock(&self) -> bool {
        return has_app_single_instance_lock(self);
    }

    pub fn release_app_single_instance_lock(&self) {
        release_app_single_instance_lock(self);
    }

    pub fn request_app_single_instance_lock(&self) -> bool {
        return request_app_single_instance_lock(self);
    }
}

impl HostAppUserModelIdCapability {
    pub fn set_app_user_model_id(&self, id: &str) {
        set_app_user_model_id(self, id);
    }
}

impl HostAppVersionCapability {
    pub fn get_app_version(&self) -> String {
        return get_app_version(self);
    }
}
