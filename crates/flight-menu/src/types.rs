use std::any::Any;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Weak};

use flight_entity::{EntityRuntimeSlot, FlightError, Ref};
use flight_host::ProviderRef;
use flight_signals::Signal;

/// The menu item kind (TS `MenuItemType`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuItemType {
    Normal,
    Separator,
    Submenu,
    Checkbox,
    Radio,
}

/// The documented built-in menu roles (TS `WellKnownMenuItemRoleValue`), a closed string union. The
/// role carried by a template stays an open `MenuItemRole` string; this enum is the declared table
/// of well-known values.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WellKnownMenuItemRoleValue {
    Copy,
    Cut,
    Delete,
    Paste,
    PasteAndMatchStyle,
    Redo,
    SelectAll,
    ToggleSpellChecker,
    Undo,
    About,
    Close,
    Front,
    Hide,
    HideOthers,
    MergeAllWindows,
    Minimize,
    MoveTabToNewWindow,
    Quit,
    SelectNextTab,
    SelectPreviousTab,
    ToggleTabBar,
    Unhide,
    Zoom,
    ForceReload,
    Reload,
    ResetZoom,
    ToggleDevTools,
    ToggleFullscreen,
    ZoomIn,
    ZoomOut,
    Help,
    Services,
    StartSpeaking,
    StopSpeaking,
    ClearRecentDocuments,
    RecentDocuments,
    AppMenu,
    EditMenu,
    FileMenu,
    HelpMenu,
    ShareMenu,
    ViewMenu,
    WindowMenu,
}

/// An open role string (TS `MenuItemRole`, `WellKnownMenuItemRoleValue | (string & {})`). Vendors
/// may introduce their own roles; providers ignore unrecognized values. The well-known values are
/// the `WellKnownMenuItemRoleValue` string table.
pub type MenuItemRole = String;

/// The plain menu descriptor (TS `MenuItemTemplate`). Omitting an item entirely is distinct from
/// `enabled: false`, which shows an item greyed and unselectable. `type_` is the TS field `type`.
///
/// Descriptors are mutable plain records shared by identity, exactly as the source passes the
/// actual objects to providers and callers may mutate them. Children are shared handles, so a
/// recursive graph (and its cyclic misuse) is representable; deep copying is explicit through
/// `clone_menu_template`. No entity runtime is involved.
#[derive(Default)]
pub struct MenuItemTemplate {
    pub id: Option<String>,
    pub label: Option<String>,
    pub type_: Option<MenuItemType>,
    pub role: Option<MenuItemRole>,
    pub accelerator: Option<String>,
    pub enabled: Option<bool>,
    pub checked: Option<bool>,
    pub visible: Option<bool>,
    pub sublabel: Option<String>,
    pub tool_tip: Option<String>,
    pub submenu: Option<Vec<Ref<MenuItemTemplate>>>,
}

/// The highlight event entity (TS `MenuHighlight`, an Entity). The signal stays inert until
/// attached to a host provider that renders the menu itself.
#[derive(Default)]
pub struct MenuHighlight {
    runtime: EntityRuntimeSlot,
    pub on_menu_item_highlight: Signal<String>,
}

/// The select event entity (TS `MenuSelect`, an Entity) for application menu-bar selections.
#[derive(Default)]
pub struct MenuSelect {
    runtime: EntityRuntimeSlot,
    pub on_menu_item_select: Signal<String>,
}

/// The opt-in core context-menu dispatcher signals (TS `MenuSignals`, an Entity).
#[derive(Default)]
pub struct MenuSignals {
    runtime: EntityRuntimeSlot,
    pub on_context_menu_close: Signal<()>,
    pub on_context_menu_open: Signal<()>,
}

/// Caller-owned enable/identity state for the context-menu dispatcher (replaces the source's
/// module-level lazily allocated group; D5). `signals` is the enabled group once `enable` ran; the
/// shared handle preserves the source's singleton object identity.
#[derive(Default)]
pub struct MenuSignalsState {
    pub signals: Option<Ref<MenuSignals>>,
}

/// Caller-owned record of application menu providers already finally-released (replaces the
/// source's module-level WeakSet; D5). Entries are non-owning weak handles so a released provider
/// is not kept alive by this record; failed providers are deliberately absent so a later call
/// retries exactly the failures.
// flight-lint: allow(contract-vocabulary) D5: released-provider bookkeeping is a non-owning Weak set mirroring the source WeakSet; Rust-only caller-owned state, never transpiled
#[derive(Default)]
pub struct AppMenuDestroyedProviders {
    pub released: Vec<AppMenuProviderWeak>,
}

/// A non-owning handle to the provider identity token (ProviderRef), used by the caller-owned
/// released record exactly as the source WeakSet keys the provider object.
// flight-lint: allow(contract-vocabulary) D5: non-owning provider-identity handle mirroring the source WeakSet; the WeakRef vocabulary row is a builder5 foundation item and this state never transpiles
pub type AppMenuProviderWeak = Weak<dyn Any + Send + Sync>;

/// One subscription release callback (TS `() => void`).
pub type MenuUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// One required change/event subscription callback (TS `subscribe`).
pub type MenuSubscribe =
    Arc<dyn Fn(Arc<dyn Fn(&str) + Send + Sync>) -> MenuUnsubscribe + Send + Sync>;

/// The context-menu popup result (TS `Promise<string | null>`); a provider rejection is forwarded
/// as `Err` unchanged.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<_, FlightError> models it and show_context_menu forwards Err unchanged
pub type MenuPopupResult = Result<Option<String>, FlightError>;

/// Boxed Send future for one context-menu popup (D15).
pub type MenuPopupFuture = Pin<Box<dyn Future<Output = MenuPopupResult> + Send>>;

/// The application menu-bar provider (TS `HostAppMenuCapability`). Every capability record carries
/// the shared `provider` identity token; facets from one provider clone it, and provider identity is
/// compared by `Arc::ptr_eq`, never by callbacks. Only this provider acquires a
/// whole-provider resource, so it alone carries the optional destroy hook. The shared handle keeps
/// provider object identity for alias-safe final release.
#[derive(Clone)]
pub struct HostAppMenuCapability {
    pub provider: ProviderRef,
    pub destroy: Option<Arc<dyn Fn() + Send + Sync>>,
    pub set_app_menu: Arc<dyn Fn(&[Ref<MenuItemTemplate>]) -> bool + Send + Sync>,
}

/// The highlight provider (TS `HostMenuHighlightCapability`). `subscribe` returns the release
/// callback for that subscription only.
#[derive(Clone)]
pub struct HostMenuHighlightCapability {
    pub provider: ProviderRef,
    pub subscribe: MenuSubscribe,
}

/// The context-menu popup provider (TS `HostMenuPopupCapability`).
#[derive(Clone)]
pub struct HostMenuPopupCapability {
    pub provider: ProviderRef,
    pub popup: Arc<dyn Fn(Vec<Ref<MenuItemTemplate>>, f32, f32) -> MenuPopupFuture + Send + Sync>,
}

/// The application menu-bar selection provider (TS `HostMenuSelectCapability`).
#[derive(Clone)]
pub struct HostMenuSelectCapability {
    pub provider: ProviderRef,
    pub subscribe: MenuSubscribe,
}

/// The menu capability group (TS `HostMenuCapabilities`). An omitted slot is capability absence.
#[derive(Clone, Default)]
pub struct HostMenuCapabilities {
    pub app: Option<Ref<HostAppMenuCapability>>,
    pub highlight: Option<HostMenuHighlightCapability>,
    pub popup: Option<HostMenuPopupCapability>,
    pub select: Option<HostMenuSelectCapability>,
}

/// One entity-owned origin-pinned subscription (D5/D15). Stored beside the entity that opened it so
/// detaching one entity never ends another's subscription.
#[derive(Clone)]
pub(crate) struct MenuSubscription {
    pub(crate) unsubscribe: MenuUnsubscribe,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MenuItemType union; the TS package exports no get_/parse_ free functions
pub fn get_menu_item_type_string(value: MenuItemType) -> &'static str {
    return match value {
        MenuItemType::Normal => "normal",
        MenuItemType::Separator => "separator",
        MenuItemType::Submenu => "submenu",
        MenuItemType::Checkbox => "checkbox",
        MenuItemType::Radio => "radio",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for TS WellKnownMenuItemRoleValue; the TS package exports only the const object and type
pub fn get_well_known_menu_item_role_value_string(
    value: WellKnownMenuItemRoleValue,
) -> &'static str {
    return match value {
        WellKnownMenuItemRoleValue::Copy => "copy",
        WellKnownMenuItemRoleValue::Cut => "cut",
        WellKnownMenuItemRoleValue::Delete => "delete",
        WellKnownMenuItemRoleValue::Paste => "paste",
        WellKnownMenuItemRoleValue::PasteAndMatchStyle => "pasteAndMatchStyle",
        WellKnownMenuItemRoleValue::Redo => "redo",
        WellKnownMenuItemRoleValue::SelectAll => "selectAll",
        WellKnownMenuItemRoleValue::ToggleSpellChecker => "toggleSpellChecker",
        WellKnownMenuItemRoleValue::Undo => "undo",
        WellKnownMenuItemRoleValue::About => "about",
        WellKnownMenuItemRoleValue::Close => "close",
        WellKnownMenuItemRoleValue::Front => "front",
        WellKnownMenuItemRoleValue::Hide => "hide",
        WellKnownMenuItemRoleValue::HideOthers => "hideOthers",
        WellKnownMenuItemRoleValue::MergeAllWindows => "mergeAllWindows",
        WellKnownMenuItemRoleValue::Minimize => "minimize",
        WellKnownMenuItemRoleValue::MoveTabToNewWindow => "moveTabToNewWindow",
        WellKnownMenuItemRoleValue::Quit => "quit",
        WellKnownMenuItemRoleValue::SelectNextTab => "selectNextTab",
        WellKnownMenuItemRoleValue::SelectPreviousTab => "selectPreviousTab",
        WellKnownMenuItemRoleValue::ToggleTabBar => "toggleTabBar",
        WellKnownMenuItemRoleValue::Unhide => "unhide",
        WellKnownMenuItemRoleValue::Zoom => "zoom",
        WellKnownMenuItemRoleValue::ForceReload => "forceReload",
        WellKnownMenuItemRoleValue::Reload => "reload",
        WellKnownMenuItemRoleValue::ResetZoom => "resetZoom",
        WellKnownMenuItemRoleValue::ToggleDevTools => "toggleDevTools",
        WellKnownMenuItemRoleValue::ToggleFullscreen => "toggleFullscreen",
        WellKnownMenuItemRoleValue::ZoomIn => "zoomIn",
        WellKnownMenuItemRoleValue::ZoomOut => "zoomOut",
        WellKnownMenuItemRoleValue::Help => "help",
        WellKnownMenuItemRoleValue::Services => "services",
        WellKnownMenuItemRoleValue::StartSpeaking => "startSpeaking",
        WellKnownMenuItemRoleValue::StopSpeaking => "stopSpeaking",
        WellKnownMenuItemRoleValue::ClearRecentDocuments => "clearRecentDocuments",
        WellKnownMenuItemRoleValue::RecentDocuments => "recentDocuments",
        WellKnownMenuItemRoleValue::AppMenu => "appMenu",
        WellKnownMenuItemRoleValue::EditMenu => "editMenu",
        WellKnownMenuItemRoleValue::FileMenu => "fileMenu",
        WellKnownMenuItemRoleValue::HelpMenu => "helpMenu",
        WellKnownMenuItemRoleValue::ShareMenu => "shareMenu",
        WellKnownMenuItemRoleValue::ViewMenu => "viewMenu",
        WellKnownMenuItemRoleValue::WindowMenu => "windowMenu",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MenuItemType union; the TS package exports no get_/parse_ free functions
pub fn parse_menu_item_type(value: &str) -> Option<MenuItemType> {
    return match value {
        "normal" => Some(MenuItemType::Normal),
        "separator" => Some(MenuItemType::Separator),
        "submenu" => Some(MenuItemType::Submenu),
        "checkbox" => Some(MenuItemType::Checkbox),
        "radio" => Some(MenuItemType::Radio),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for TS WellKnownMenuItemRoleValue; the TS package exports only the const object and type
pub fn parse_well_known_menu_item_role_value(value: &str) -> Option<WellKnownMenuItemRoleValue> {
    return match value {
        "copy" => Some(WellKnownMenuItemRoleValue::Copy),
        "cut" => Some(WellKnownMenuItemRoleValue::Cut),
        "delete" => Some(WellKnownMenuItemRoleValue::Delete),
        "paste" => Some(WellKnownMenuItemRoleValue::Paste),
        "pasteAndMatchStyle" => Some(WellKnownMenuItemRoleValue::PasteAndMatchStyle),
        "redo" => Some(WellKnownMenuItemRoleValue::Redo),
        "selectAll" => Some(WellKnownMenuItemRoleValue::SelectAll),
        "toggleSpellChecker" => Some(WellKnownMenuItemRoleValue::ToggleSpellChecker),
        "undo" => Some(WellKnownMenuItemRoleValue::Undo),
        "about" => Some(WellKnownMenuItemRoleValue::About),
        "close" => Some(WellKnownMenuItemRoleValue::Close),
        "front" => Some(WellKnownMenuItemRoleValue::Front),
        "hide" => Some(WellKnownMenuItemRoleValue::Hide),
        "hideOthers" => Some(WellKnownMenuItemRoleValue::HideOthers),
        "mergeAllWindows" => Some(WellKnownMenuItemRoleValue::MergeAllWindows),
        "minimize" => Some(WellKnownMenuItemRoleValue::Minimize),
        "moveTabToNewWindow" => Some(WellKnownMenuItemRoleValue::MoveTabToNewWindow),
        "quit" => Some(WellKnownMenuItemRoleValue::Quit),
        "selectNextTab" => Some(WellKnownMenuItemRoleValue::SelectNextTab),
        "selectPreviousTab" => Some(WellKnownMenuItemRoleValue::SelectPreviousTab),
        "toggleTabBar" => Some(WellKnownMenuItemRoleValue::ToggleTabBar),
        "unhide" => Some(WellKnownMenuItemRoleValue::Unhide),
        "zoom" => Some(WellKnownMenuItemRoleValue::Zoom),
        "forceReload" => Some(WellKnownMenuItemRoleValue::ForceReload),
        "reload" => Some(WellKnownMenuItemRoleValue::Reload),
        "resetZoom" => Some(WellKnownMenuItemRoleValue::ResetZoom),
        "toggleDevTools" => Some(WellKnownMenuItemRoleValue::ToggleDevTools),
        "toggleFullscreen" => Some(WellKnownMenuItemRoleValue::ToggleFullscreen),
        "zoomIn" => Some(WellKnownMenuItemRoleValue::ZoomIn),
        "zoomOut" => Some(WellKnownMenuItemRoleValue::ZoomOut),
        "help" => Some(WellKnownMenuItemRoleValue::Help),
        "services" => Some(WellKnownMenuItemRoleValue::Services),
        "startSpeaking" => Some(WellKnownMenuItemRoleValue::StartSpeaking),
        "stopSpeaking" => Some(WellKnownMenuItemRoleValue::StopSpeaking),
        "clearRecentDocuments" => Some(WellKnownMenuItemRoleValue::ClearRecentDocuments),
        "recentDocuments" => Some(WellKnownMenuItemRoleValue::RecentDocuments),
        "appMenu" => Some(WellKnownMenuItemRoleValue::AppMenu),
        "editMenu" => Some(WellKnownMenuItemRoleValue::EditMenu),
        "fileMenu" => Some(WellKnownMenuItemRoleValue::FileMenu),
        "helpMenu" => Some(WellKnownMenuItemRoleValue::HelpMenu),
        "shareMenu" => Some(WellKnownMenuItemRoleValue::ShareMenu),
        "viewMenu" => Some(WellKnownMenuItemRoleValue::ViewMenu),
        "windowMenu" => Some(WellKnownMenuItemRoleValue::WindowMenu),
        _ => None,
    };
}

flight_entity::impl_entity!(MenuHighlight);
flight_entity::impl_entity!(MenuSelect);
flight_entity::impl_entity!(MenuSignals);
