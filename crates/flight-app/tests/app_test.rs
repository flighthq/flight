use std::sync::{Arc, Mutex};

use flight_app::contract::*;
use flight_entity::{Entity, FlightError, FlightErrorKind};
use flight_lifecycle::{AppLifecycleState, HostLifecycleCapability};
use flight_signals::{cancel_signal, connect_signal};

use crate::block_on;
use crate::fixture::*;

mod add_app_recent_document {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        add_app_recent_document(&host.recent_documents, "/tmp/a");
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"recent:/tmp/a".to_string())
        );
    }
}

mod app_explicit_host_ownership {
    /// TS asserts the contract exports no ambient-resolver API; Rust cannot enumerate exports at
    /// runtime, so the public lanes are checked by source text.
    #[test]
    fn deletes_the_ambient_resolver_family_instead_of_retaining_a_parallel_api() {
        let sources = [
            include_str!("../src/lib.rs"),
            include_str!("../src/contract.rs"),
            include_str!("../src/app.rs"),
            include_str!("../src/types.rs"),
        ];
        for symbol in [
            "explain_app_backend",
            "get_app_backend",
            "install_app_host_backend",
            "observe_app_host_result",
            "reset_app_backend_for_test",
            "set_app_backend",
        ] {
            for source in sources {
                assert!(!source.contains(symbol), "{symbol} must not be exported");
            }
        }
    }
}

mod attach_app_activate {
    use super::*;

    #[test]
    fn forwards_activation() {
        let host = fixture();
        let mut app = create_app_events();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        connect_signal(
            &app.on_activate,
            Arc::new(move |value: &_| keep.lock().unwrap().push(format!("{:?}", value))),
            None,
        );
        attach_app_activate(&host.activate, &mut app);
        let listener = host.listeners.lock().unwrap().activate.clone().unwrap();
        listener();
        assert_eq!(*seen.lock().unwrap(), vec!["()".to_string()]);
    }

    #[test]
    fn replaces_a_prior_attachment_after_subscribing_the_new_one() {
        let (first, second) = (fixture(), fixture());
        let mut app = create_app_events();
        attach_app_activate(&first.activate, &mut app);
        // The replacement subscribes before the prior release runs, as the source's argument
        // evaluation does: the new listener already exists when the old release fires.
        let observed = Arc::new(Mutex::new(None));
        let (watch, seen) = (second.listeners.clone(), observed.clone());
        let mut first_release = first.activate.clone();
        let inner = first_release.subscribe.clone();
        first_release.subscribe = Arc::new(move |listener: AppListener| {
            let release = inner(listener);
            let (watch, seen) = (watch.clone(), seen.clone());
            return Arc::new(move || {
                *seen.lock().unwrap() = Some(watch.lock().unwrap().activate.is_some());
                release();
            });
        });
        let mut replaced = create_app_events();
        attach_app_activate(&first_release, &mut replaced);
        attach_app_activate(&second.activate, &mut replaced);
        assert_eq!(*observed.lock().unwrap(), Some(true));
        attach_app_activate(&second.activate, &mut app);
        assert_eq!(
            first.listeners.lock().unwrap().released,
            vec!["activate".to_string(), "activate".to_string()]
        );
    }
}

mod attach_app_all_windows_closed {
    use super::*;

    #[test]
    fn forwards_all_windows_closed() {
        let host = fixture();
        let mut app = create_app_events();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        connect_signal(
            &app.on_all_windows_closed,
            Arc::new(move |value: &_| keep.lock().unwrap().push(format!("{:?}", value))),
            None,
        );
        attach_app_all_windows_closed(&host.all_windows_closed, &mut app);
        let listener = host
            .listeners
            .lock()
            .unwrap()
            .all_windows_closed
            .clone()
            .unwrap();
        listener();
        assert_eq!(*seen.lock().unwrap(), vec!["()".to_string()]);
    }
}

mod attach_app_events {
    use super::*;

    #[test]
    fn attaches_all_six_event_providers_and_replaces_a_prior_attachment() {
        let (first, second) = (fixture(), fixture());
        let mut app = create_app_events();
        attach_app_events(
            &first.activate,
            &first.all_windows_closed,
            &first.open_file,
            &first.quit_request,
            &first.ready,
            &first.second_instance,
            &mut app,
        );
        attach_app_events(
            &second.activate,
            &second.all_windows_closed,
            &second.open_file,
            &second.quit_request,
            &second.ready,
            &second.second_instance,
            &mut app,
        );
        assert_eq!(
            first.listeners.lock().unwrap().released,
            [
                "activate",
                "allWindowsClosed",
                "openFile",
                "quitRequest",
                "ready",
                "secondInstance"
            ]
            .map(String::from)
        );
        assert!(second.listeners.lock().unwrap().released.is_empty());
    }

    #[test]
    fn takes_event_providers_directly_and_publishes_an_entity() {
        let host = fixture();
        let mut app = create_app_events();
        let ready = Arc::new(Mutex::new(0));
        let tally = ready.clone();
        connect_signal(
            &app.on_ready,
            Arc::new(move |_value: &()| *tally.lock().unwrap() += 1),
            None,
        );
        attach_app_events(
            &host.activate,
            &host.all_windows_closed,
            &host.open_file,
            &host.quit_request,
            &host.ready,
            &host.second_instance,
            &mut app,
        );
        let listener = host.listeners.lock().unwrap().ready.clone().unwrap();
        listener();
        assert_eq!(*ready.lock().unwrap(), 1);
        let _: &dyn Entity = &app;
    }
}

mod attach_app_open_file {
    use super::*;

    #[test]
    fn forwards_the_opened_path() {
        let host = fixture();
        let mut app = create_app_events();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        connect_signal(
            &app.on_open_file,
            Arc::new(move |value: &_| keep.lock().unwrap().push(format!("{:?}", value))),
            None,
        );
        attach_app_open_file(&host.open_file, &mut app);
        let listener = host.listeners.lock().unwrap().open_file.clone().unwrap();
        listener("/tmp/a.txt");
        assert_eq!(*seen.lock().unwrap(), vec!["\"/tmp/a.txt\"".to_string()]);
    }
}

mod attach_app_quit_request {
    use super::*;

    #[test]
    fn translates_signal_cancellation_to_the_native_veto_callback() {
        let host = fixture();
        let mut app = create_app_events();
        let signal = app.on_quit_request.clone();
        connect_signal(
            &app.on_quit_request,
            Arc::new(move |_value: &()| cancel_signal(&signal)),
            None,
        );
        attach_app_quit_request(&host.quit_request, &mut app);
        let vetoed = Arc::new(Mutex::new(0));
        let tally = vetoed.clone();
        let listener = host.listeners.lock().unwrap().quit_request.clone().unwrap();
        listener(Arc::new(move || *tally.lock().unwrap() += 1));
        assert_eq!(*vetoed.lock().unwrap(), 1);
    }

    #[test]
    fn does_not_veto_when_no_listener_cancels() {
        let host = fixture();
        let mut app = create_app_events();
        connect_signal(&app.on_quit_request, Arc::new(|_value: &()| {}), None);
        attach_app_quit_request(&host.quit_request, &mut app);
        let vetoed = Arc::new(Mutex::new(0));
        let tally = vetoed.clone();
        let listener = host.listeners.lock().unwrap().quit_request.clone().unwrap();
        listener(Arc::new(move || *tally.lock().unwrap() += 1));
        // A later emission resets the cancellation, as the source's emitSignal does.
        listener(Arc::new(|| {}));
        assert_eq!(*vetoed.lock().unwrap(), 0);
    }
}

mod attach_app_ready {
    use super::*;

    #[test]
    fn forwards_ready() {
        let host = fixture();
        let mut app = create_app_events();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        connect_signal(
            &app.on_ready,
            Arc::new(move |value: &_| keep.lock().unwrap().push(format!("{:?}", value))),
            None,
        );
        attach_app_ready(&host.ready, &mut app);
        let listener = host.listeners.lock().unwrap().ready.clone().unwrap();
        listener();
        assert_eq!(*seen.lock().unwrap(), vec!["()".to_string()]);
    }
}

mod attach_app_second_instance {
    use super::*;

    #[test]
    fn forwards_argv() {
        let host = fixture();
        let mut app = create_app_events();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        connect_signal(
            &app.on_second_instance,
            Arc::new(move |value: &_| keep.lock().unwrap().push(format!("{:?}", value))),
            None,
        );
        attach_app_second_instance(&host.second_instance, &mut app);
        let listener = host
            .listeners
            .lock()
            .unwrap()
            .second_instance
            .clone()
            .unwrap();
        listener(&["--open".to_string()]);
        assert_eq!(*seen.lock().unwrap(), vec!["[\"--open\"]".to_string()]);
    }
}

mod bounce_app_dock {
    use super::*;

    #[test]
    fn returns_the_provider_id() {
        assert_eq!(bounce_app_dock(&fixture().dock), 17);
    }
}

mod cancel_app_attention {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        cancel_app_attention(&host.dock, 3);
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"cancelAttention:3".to_string())
        );
    }
}

mod cancel_app_dock_bounce {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        cancel_app_dock_bounce(&host.dock, 4);
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"cancelBounce:4".to_string())
        );
    }
}

mod clear_app_recent_documents {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        clear_app_recent_documents(&host.recent_documents);
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"clearRecent".to_string())
        );
    }
}

mod create_app_events {
    use super::*;

    #[test]
    fn creates_an_entity_carrying_all_application_signals() {
        let app = create_app_events();
        let _: &dyn Entity = &app;
        let handles = [
            Arc::as_ptr(&app.on_activate.data) as usize,
            Arc::as_ptr(&app.on_all_windows_closed.data) as usize,
            Arc::as_ptr(&app.on_open_file.data) as usize,
            Arc::as_ptr(&app.on_quit_request.data) as usize,
            Arc::as_ptr(&app.on_ready.data) as usize,
            Arc::as_ptr(&app.on_second_instance.data) as usize,
        ];
        for (index, handle) in handles.iter().enumerate() {
            assert!(
                !handles[index + 1..].contains(handle),
                "each signal is its own"
            );
        }
    }
}

mod detach_app_events {
    use super::*;

    #[test]
    fn unsubscribes_every_attached_provider() {
        let host = fixture();
        let mut app = create_app_events();
        attach_app_events(
            &host.activate,
            &host.all_windows_closed,
            &host.open_file,
            &host.quit_request,
            &host.ready,
            &host.second_instance,
            &mut app,
        );
        detach_app_events(&mut app);
        assert_eq!(host.listeners.lock().unwrap().released.len(), 6);
        detach_app_events(&mut app);
        assert_eq!(host.listeners.lock().unwrap().released.len(), 6);
    }

    #[test]
    fn releases_in_first_attach_order_with_a_replacement_keeping_its_slot() {
        let (first, second) = (fixture(), fixture());
        let mut app = create_app_events();
        attach_app_ready(&first.ready, &mut app);
        attach_app_activate(&first.activate, &mut app);
        attach_app_ready(&second.ready, &mut app);
        detach_app_events(&mut app);
        assert_eq!(
            second.listeners.lock().unwrap().released,
            vec!["ready".to_string()]
        );
        assert_eq!(
            first.listeners.lock().unwrap().released,
            vec!["ready".to_string(), "activate".to_string()]
        );
    }
}

mod dispose_app_events {
    use super::*;

    #[test]
    fn detaches_providers_and_clears_signal_listeners() {
        let host = fixture();
        let mut app = create_app_events();
        let ready = Arc::new(Mutex::new(0));
        let tally = ready.clone();
        connect_signal(
            &app.on_ready,
            Arc::new(move |_value: &()| *tally.lock().unwrap() += 1),
            None,
        );
        attach_app_events(
            &host.activate,
            &host.all_windows_closed,
            &host.open_file,
            &host.quit_request,
            &host.ready,
            &host.second_instance,
            &mut app,
        );
        dispose_app_events(&mut app);
        let listener = host.listeners.lock().unwrap().ready.clone().unwrap();
        listener();
        assert_eq!(
            host.listeners
                .lock()
                .unwrap()
                .released
                .iter()
                .filter(|key| *key == "ready")
                .count(),
            1
        );
        assert_eq!(*ready.lock().unwrap(), 0);
    }
}

mod focus_app {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        focus_app(&host.focus);
        assert!(host.calls.lock().unwrap().contains(&"focus".to_string()));
    }
}

mod get_app_activation_policy_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_app_activation_policy_string(AppActivationPolicy::Regular),
            "regular"
        );
        assert_eq!(
            get_app_activation_policy_string(AppActivationPolicy::Accessory),
            "accessory"
        );
        assert_eq!(
            get_app_activation_policy_string(AppActivationPolicy::Prohibited),
            "prohibited"
        );
    }
}

mod get_app_directory_path {
    use super::*;

    #[test]
    fn returns_the_selected_directory() {
        assert_eq!(
            get_app_directory_path(&fixture().path, AppPathKind::Logs),
            "/app/Logs"
        );
    }
}

mod get_app_executable_path {
    use super::*;

    #[test]
    fn returns_the_executable_path() {
        assert_eq!(get_app_executable_path(&fixture().path), "/app/flight");
    }
}

mod get_app_locale {
    use super::*;

    #[test]
    fn returns_locale() {
        assert_eq!(get_app_locale(&fixture().locale), "en-GB");
    }
}

mod get_app_login_item {
    use super::*;

    #[test]
    fn returns_settings() {
        let item = get_app_login_item(&fixture().login_item);
        assert!(item.open_at_login);
        assert_eq!(item.args, vec!["--start".to_string()]);
    }
}

mod get_app_name {
    use super::*;

    #[test]
    fn returns_name() {
        assert_eq!(get_app_name(&fixture().name), "Flight");
    }
}

mod get_app_path {
    use super::*;

    #[test]
    fn returns_app_path() {
        assert_eq!(get_app_path(&fixture().path), "/app");
    }
}

mod get_app_path_kind_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(get_app_path_kind_string(AppPathKind::UserData), "userData");
        assert_eq!(get_app_path_kind_string(AppPathKind::Logs), "logs");
        assert_eq!(
            get_app_path_kind_string(AppPathKind::CrashDumps),
            "crashDumps"
        );
    }
}

mod get_app_preferred_system_languages {
    use super::*;

    #[test]
    fn returns_languages() {
        let mut out = vec!["stale".to_string()];
        get_app_preferred_system_languages(&mut out, &fixture().locale);
        assert_eq!(out, vec!["en-GB".to_string(), "fr".to_string()]);
    }
}

mod get_app_system_locale {
    use super::*;

    #[test]
    fn returns_system_locale() {
        assert_eq!(get_app_system_locale(&fixture().locale), "en-US");
    }
}

mod get_app_version {
    use super::*;

    #[test]
    fn returns_version() {
        assert_eq!(get_app_version(&fixture().version), "1.2.3");
    }
}

mod get_mobile_os_profile_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_mobile_os_profile_string(MobileOsProfile::Android),
            "android"
        );
        assert_eq!(get_mobile_os_profile_string(MobileOsProfile::Ios), "ios");
    }
}

mod has_app_single_instance_lock {
    use super::*;

    #[test]
    fn returns_the_provider_fact() {
        assert_eq!(
            has_app_single_instance_lock(&fixture().single_instance),
            true
        );
    }
}

mod hide_app {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        hide_app(&host.hide);
        assert!(host.calls.lock().unwrap().contains(&"hide".to_string()));
    }
}

mod initialize_app_events {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_app_events() {
        let mut out: AppEvents = flight_entity::allocate_entity();
        let before = Arc::as_ptr(&out.on_ready.data) as usize;
        initialize_app_events(&mut out);
        assert_ne!(Arc::as_ptr(&out.on_ready.data) as usize, before);
    }
}

mod is_app_hidden {
    use super::*;

    #[test]
    fn returns_the_provider_fact() {
        let host = |state: AppLifecycleState| HostLifecycleCapability {
            get_state: Arc::new(move || state),
            subscribe: Arc::new(|_listener| Arc::new(|| {})),
            get_launch_kind: None,
            subscribe_memory_warning: None,
        };
        assert!(is_app_hidden(&host(AppLifecycleState::Background)));
        assert!(!is_app_hidden(&host(AppLifecycleState::Inactive)));
    }
}

mod parse_app_activation_policy {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling_and_rejects_others() {
        assert_eq!(
            parse_app_activation_policy("regular"),
            Some(AppActivationPolicy::Regular)
        );
        assert_eq!(
            parse_app_activation_policy("accessory"),
            Some(AppActivationPolicy::Accessory)
        );
        assert_eq!(
            parse_app_activation_policy("prohibited"),
            Some(AppActivationPolicy::Prohibited)
        );
        assert_eq!(parse_app_activation_policy("unknown"), None);
    }
}

mod parse_app_path_kind {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling_and_rejects_others() {
        assert_eq!(parse_app_path_kind("userData"), Some(AppPathKind::UserData));
        assert_eq!(parse_app_path_kind("logs"), Some(AppPathKind::Logs));
        assert_eq!(
            parse_app_path_kind("crashDumps"),
            Some(AppPathKind::CrashDumps)
        );
        assert_eq!(parse_app_path_kind("unknown"), None);
    }
}

mod parse_mobile_os_profile {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling_and_rejects_others() {
        assert_eq!(
            parse_mobile_os_profile("android"),
            Some(MobileOsProfile::Android)
        );
        assert_eq!(parse_mobile_os_profile("ios"), Some(MobileOsProfile::Ios));
        assert_eq!(parse_mobile_os_profile("unknown"), None);
    }
}

mod quit_app {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        quit_app(&host.quit);
        assert!(host.calls.lock().unwrap().contains(&"quit".to_string()));
    }
}

mod relaunch_app {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        relaunch_app(&host.relaunch);
        assert!(host.calls.lock().unwrap().contains(&"relaunch".to_string()));
    }
}

mod release_app_single_instance_lock {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        release_app_single_instance_lock(&host.single_instance);
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"releaseLock".to_string())
        );
    }
}

mod request_app_attention {
    use super::*;

    #[test]
    fn returns_the_provider_id() {
        assert_eq!(request_app_attention(&fixture().dock, true), 19);
    }
}

mod request_app_single_instance_lock {
    use super::*;

    #[test]
    fn returns_the_provider_outcome() {
        assert_eq!(
            request_app_single_instance_lock(&fixture().single_instance),
            true
        );
    }
}

mod set_app_activation_policy {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        set_app_activation_policy(&host.activation_policy, AppActivationPolicy::Accessory);
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"policy:Accessory".to_string())
        );
    }
}

mod set_app_badge_count {
    use super::*;

    #[test]
    fn returns_the_awaited_provider_outcome() {
        let host = fixture();
        assert_eq!(block_on(set_app_badge_count(&host.badge, 7)).unwrap(), true);
        assert_eq!(*host.calls.lock().unwrap(), vec!["badge:7".to_string()]);
    }

    #[test]
    fn passes_a_provider_rejection_through() {
        let mut host = fixture();
        host.badge.set_badge_count = Arc::new(|_count: i32| {
            let rejected: AppProviderFuture<bool> =
                Box::pin(std::future::ready(Err(FlightError {
                    kind: FlightErrorKind::Error,
                    message: "denied".to_string(),
                })));
            return rejected;
        });
        assert_eq!(
            block_on(set_app_badge_count(&host.badge, 1))
                .unwrap_err()
                .message,
            "denied"
        );
    }
}

mod set_app_dock_badge {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        set_app_dock_badge(&host.dock, "x");
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"dockBadge:x".to_string())
        );
    }
}

mod set_app_dock_menu {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        set_app_dock_menu(&host.dock, &[]);
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"dockMenu:0".to_string())
        );
    }
}

mod set_app_login_item {
    use super::*;

    #[test]
    fn delegates_the_partial_settings() {
        let host = fixture();
        let settings = AppLoginItemLike {
            open_at_login: Some(true),
            open_as_hidden: None,
            path: None,
            args: None,
        };
        set_app_login_item(&host.login_item, &settings);
        assert_eq!(host.calls.lock().unwrap().len(), 1);
        assert!(host.calls.lock().unwrap()[0].starts_with("loginItem:"));
    }
}

mod set_app_name {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        set_app_name(&host.name_write, "Renamed");
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"name:Renamed".to_string())
        );
    }
}

mod set_app_user_model_id {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        set_app_user_model_id(&host.user_model_id, "flight.app");
        assert!(
            host.calls
                .lock()
                .unwrap()
                .contains(&"userModel:flight.app".to_string())
        );
    }
}

mod show_app {
    use super::*;

    #[test]
    fn delegates() {
        let host = fixture();
        show_app(&host.show);
        assert!(host.calls.lock().unwrap().contains(&"show".to_string()));
    }
}
