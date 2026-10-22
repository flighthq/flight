//! Shared mock host for the app tests: compiled into both the integration tests and the inline
//! `sugar_tests` (through `#[path]`), so `crate::contract` resolves in each.

use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_host::ProviderRef;
use flight_menu::MenuItemTemplate;

use crate::contract::*;

pub(crate) type Calls = Arc<Mutex<Vec<String>>>;

/// The six host event listeners a fixture's subscribe providers captured, plus how many times each
/// release ran.
#[derive(Default)]
pub(crate) struct Listeners {
    pub(crate) activate: Option<AppListener>,
    pub(crate) all_windows_closed: Option<AppListener>,
    pub(crate) open_file: Option<AppOpenFileListener>,
    pub(crate) quit_request: Option<AppQuitRequestListener>,
    pub(crate) ready: Option<AppListener>,
    pub(crate) second_instance: Option<AppSecondInstanceListener>,
    pub(crate) released: Vec<String>,
}

pub(crate) struct Fixture {
    pub(crate) activate: HostAppActivateCapability,
    pub(crate) activation_policy: HostAppActivationPolicyCapability,
    pub(crate) all_windows_closed: HostAppAllWindowsClosedCapability,
    pub(crate) badge: HostAppBadgeCapability,
    pub(crate) calls: Calls,
    pub(crate) dock: HostAppDockCapability,
    pub(crate) focus: HostAppFocusCapability,
    pub(crate) hide: HostAppHideCapability,
    pub(crate) listeners: Arc<Mutex<Listeners>>,
    pub(crate) locale: HostAppLocaleCapability,
    pub(crate) login_item: HostAppLoginItemCapability,
    pub(crate) name: HostAppNameCapability,
    pub(crate) name_write: HostAppNameWriteCapability,
    pub(crate) open_file: HostAppOpenFileCapability,
    pub(crate) path: HostAppPathCapability,
    pub(crate) quit: HostAppQuitCapability,
    pub(crate) quit_request: HostAppQuitRequestCapability,
    pub(crate) ready: HostAppReadyCapability,
    pub(crate) recent_documents: HostAppRecentDocumentsCapability,
    pub(crate) relaunch: HostAppRelaunchCapability,
    pub(crate) second_instance: HostAppSecondInstanceCapability,
    pub(crate) show: HostAppShowCapability,
    pub(crate) single_instance: HostAppSingleInstanceCapability,
    pub(crate) user_model_id: HostAppUserModelIdCapability,
    pub(crate) version: HostAppVersionCapability,
}

fn release(listeners: &Arc<Mutex<Listeners>>, key: &'static str) -> AppUnsubscribe {
    let listeners = listeners.clone();
    return Arc::new(move || listeners.lock().unwrap().released.push(key.to_string()));
}

fn record(calls: &Calls, entry: String) {
    calls.lock().unwrap().push(entry);
}

pub(crate) fn fixture() -> Fixture {
    let provider: ProviderRef = Arc::new(());
    let calls: Calls = Arc::new(Mutex::new(Vec::new()));
    let listeners = Arc::new(Mutex::new(Listeners::default()));
    let l = listeners.clone();
    let activate = HostAppActivateCapability {
        provider: provider.clone(),
        subscribe: Arc::new(move |listener: AppListener| {
            l.lock().unwrap().activate = Some(listener);
            return release(&l, "activate");
        }),
    };
    let l = listeners.clone();
    let all_windows_closed = HostAppAllWindowsClosedCapability {
        provider: provider.clone(),
        subscribe: Arc::new(move |listener: AppListener| {
            l.lock().unwrap().all_windows_closed = Some(listener);
            return release(&l, "allWindowsClosed");
        }),
    };
    let l = listeners.clone();
    let open_file = HostAppOpenFileCapability {
        provider: provider.clone(),
        subscribe: Arc::new(move |listener: AppOpenFileListener| {
            l.lock().unwrap().open_file = Some(listener);
            return release(&l, "openFile");
        }),
    };
    let l = listeners.clone();
    let quit_request = HostAppQuitRequestCapability {
        provider: provider.clone(),
        subscribe: Arc::new(move |listener: AppQuitRequestListener| {
            l.lock().unwrap().quit_request = Some(listener);
            return release(&l, "quitRequest");
        }),
    };
    let l = listeners.clone();
    let ready = HostAppReadyCapability {
        provider: provider.clone(),
        subscribe: Arc::new(move |listener: AppListener| {
            l.lock().unwrap().ready = Some(listener);
            return release(&l, "ready");
        }),
    };
    let l = listeners.clone();
    let second_instance = HostAppSecondInstanceCapability {
        provider: provider.clone(),
        subscribe: Arc::new(move |listener: AppSecondInstanceListener| {
            l.lock().unwrap().second_instance = Some(listener);
            return release(&l, "secondInstance");
        }),
    };
    let c = calls.clone();
    let activation_policy = HostAppActivationPolicyCapability {
        provider: provider.clone(),
        set_activation_policy: Arc::new(move |policy: AppActivationPolicy| {
            record(&c, format!("policy:{:?}", policy))
        }),
    };
    let c = calls.clone();
    let badge = HostAppBadgeCapability {
        provider: provider.clone(),
        set_badge_count: Arc::new(move |count: i32| {
            record(&c, format!("badge:{}", count));
            let resolved: AppProviderFuture<bool> = Box::pin(std::future::ready(Ok(true)));
            return resolved;
        }),
    };
    let (c1, c2, c3, c4, c5) = (
        calls.clone(),
        calls.clone(),
        calls.clone(),
        calls.clone(),
        calls.clone(),
    );
    let dock = HostAppDockCapability {
        provider: provider.clone(),
        bounce_dock: Arc::new(|| 17),
        cancel_attention: Arc::new(move |id: i32| record(&c1, format!("cancelAttention:{}", id))),
        cancel_dock_bounce: Arc::new(move |id: i32| record(&c2, format!("cancelBounce:{}", id))),
        request_attention: Arc::new(move |critical: bool| {
            record(&c3, format!("attention:{}", critical));
            return 19;
        }),
        set_dock_badge: Arc::new(move |text: &str| record(&c4, format!("dockBadge:{}", text))),
        set_dock_menu: Arc::new(move |items: &[Ref<MenuItemTemplate>]| {
            record(&c5, format!("dockMenu:{}", items.len()))
        }),
    };
    let c = calls.clone();
    let focus = HostAppFocusCapability {
        provider: provider.clone(),
        focus: Arc::new(move || record(&c, "focus".to_string())),
    };
    let c = calls.clone();
    let hide = HostAppHideCapability {
        provider: provider.clone(),
        hide_app: Arc::new(move || record(&c, "hide".to_string())),
    };
    let locale = HostAppLocaleCapability {
        provider: provider.clone(),
        get_locale: Arc::new(|| "en-GB".to_string()),
        get_preferred_system_languages: Arc::new(|| vec!["en-GB".to_string(), "fr".to_string()]),
        get_system_locale: Arc::new(|| "en-US".to_string()),
    };
    let c = calls.clone();
    let login_item = HostAppLoginItemCapability {
        provider: provider.clone(),
        get_login_item: Arc::new(|| AppLoginItem {
            open_at_login: true,
            open_as_hidden: true,
            path: "/app".to_string(),
            args: vec!["--start".to_string()],
        }),
        set_login_item: Arc::new(move |settings: &AppLoginItemLike| {
            record(&c, format!("loginItem:{:?}", settings))
        }),
    };
    let name = HostAppNameCapability {
        provider: provider.clone(),
        get_name: Arc::new(|| "Flight".to_string()),
    };
    let c = calls.clone();
    let name_write = HostAppNameWriteCapability {
        provider: provider.clone(),
        set_name: Arc::new(move |name: &str| record(&c, format!("name:{}", name))),
    };
    let path = HostAppPathCapability {
        provider: provider.clone(),
        get_app_directory_path: Arc::new(|kind: AppPathKind| format!("/app/{:?}", kind)),
        get_app_path: Arc::new(|| "/app".to_string()),
        get_executable_path: Arc::new(|| "/app/flight".to_string()),
    };
    let c = calls.clone();
    let quit = HostAppQuitCapability {
        provider: provider.clone(),
        quit: Arc::new(move || record(&c, "quit".to_string())),
    };
    let (c1, c2) = (calls.clone(), calls.clone());
    let recent_documents = HostAppRecentDocumentsCapability {
        provider: provider.clone(),
        add_recent_document: Arc::new(move |path: &str| record(&c1, format!("recent:{}", path))),
        clear_recent_documents: Arc::new(move || record(&c2, "clearRecent".to_string())),
    };
    let c = calls.clone();
    let relaunch = HostAppRelaunchCapability {
        provider: provider.clone(),
        relaunch: Arc::new(move || record(&c, "relaunch".to_string())),
    };
    let c = calls.clone();
    let show = HostAppShowCapability {
        provider: provider.clone(),
        show_app: Arc::new(move || record(&c, "show".to_string())),
    };
    let c = calls.clone();
    let single_instance = HostAppSingleInstanceCapability {
        provider: provider.clone(),
        has_single_instance_lock: Arc::new(|| true),
        release_single_instance_lock: Arc::new(move || record(&c, "releaseLock".to_string())),
        request_single_instance_lock: Arc::new(|| true),
    };
    let c = calls.clone();
    let user_model_id = HostAppUserModelIdCapability {
        provider: provider.clone(),
        set_user_model_id: Arc::new(move |id: &str| record(&c, format!("userModel:{}", id))),
    };
    let version = HostAppVersionCapability {
        provider,
        get_version: Arc::new(|| "1.2.3".to_string()),
    };
    return Fixture {
        activate,
        activation_policy,
        all_windows_closed,
        badge,
        calls,
        dock,
        focus,
        hide,
        listeners,
        locale,
        login_item,
        name,
        name_write,
        open_file,
        path,
        quit,
        quit_request,
        ready,
        recent_documents,
        relaunch,
        second_instance,
        show,
        single_instance,
        user_model_id,
        version,
    };
}
