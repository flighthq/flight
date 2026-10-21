use std::fmt;
use std::sync::{Arc, Mutex};

use flight_entity::{AnySlot, EntityRuntimeSlot, Ref};
use flight_signals::Signal;

/// Application lifecycle state (TS `AppLifecycleState`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppLifecycleState {
    Active,
    Inactive,
    Background,
}

/// How the application was launched (TS `AppLaunchKind`): `Cold` is a fresh process start, `Warm` a
/// resume from a frozen or backgrounded state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppLaunchKind {
    Cold,
    Warm,
}

/// OS memory-pressure level reported to `on_memory_warning` (TS `AppMemoryPressure`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppMemoryPressure {
    Normal,
    Moderate,
    Critical,
}

/// Every operation name on the provider (TS `LifecycleOperation`, derived there as
/// `keyof HostLifecycleCapability`): one variant per capability member.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LifecycleOperation {
    GetState,
    Subscribe,
    GetLaunchKind,
    SubscribeMemoryWarning,
}

/// The save/restore state bag (TS `Record<string, unknown>`): string keys with erased values, in
/// insertion order, shared by identity so save listeners write into the same bag that restore
/// re-emits.
// PENDING VOCABULARY RULING (escalated): the general mapping for TS `Record<string, unknown>`.
pub type AppLifecycleStateBag = Ref<Vec<(String, AnySlot)>>;

/// A raw provider listener (state change) and the exact release a provider returns.
pub type LifecycleListener = Arc<dyn Fn() + Send + Sync>;
pub type LifecycleUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// A raw provider memory-pressure listener.
pub type LifecycleMemoryWarningListener = Arc<dyn Fn(AppMemoryPressure) + Send + Sync>;

/// Event seam for application lifecycle (TS `HostLifecycleCapability`): a state reader plus a change
/// subscription, and two optional members. A provider declares partial support by leaving an
/// optional member `None` (the TS absence of the method). Plain dispatch data.
#[derive(Clone)]
pub struct HostLifecycleCapability {
    pub get_state: Arc<dyn Fn() -> AppLifecycleState + Send + Sync>,
    pub subscribe: Arc<dyn Fn(LifecycleListener) -> LifecycleUnsubscribe + Send + Sync>,
    pub get_launch_kind: Option<Arc<dyn Fn() -> AppLaunchKind + Send + Sync>>,
    pub subscribe_memory_warning:
        Option<Arc<dyn Fn(LifecycleMemoryWarningListener) -> LifecycleUnsubscribe + Send + Sync>>,
}

/// Application lifecycle event entity (TS `AppLifecycle extends Entity`). The signals stay inert
/// until `attach_app_lifecycle`. The private fields replace the TS module WeakMaps keyed by the
/// entity: `subscription` is the combined release of the attached provider, and `saved_state` is the
/// bag collected on the last pause, shared with the attached listener.
#[derive(Default)]
pub struct AppLifecycle {
    runtime: EntityRuntimeSlot,
    pub on_state_change: Signal<AppLifecycleState>,
    pub on_resume: Signal<()>,
    pub on_pause: Signal<()>,
    pub on_back_button: Signal<()>,
    pub on_memory_warning: Signal<AppMemoryPressure>,
    pub on_save_state: Signal<AppLifecycleStateBag>,
    pub on_restore_state: Signal<AppLifecycleStateBag>,
    pub(crate) subscription: Option<LifecycleUnsubscribe>,
    pub(crate) saved_state: Arc<Mutex<Option<AppLifecycleStateBag>>>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: a clone shares the seven signals (identity, as TS) but not the attach subscription or saved bag, which TS keys to the original entity only
impl Clone for AppLifecycle {
    fn clone(&self) -> Self {
        return AppLifecycle {
            runtime: EntityRuntimeSlot::default(),
            on_state_change: self.on_state_change.clone(),
            on_resume: self.on_resume.clone(),
            on_pause: self.on_pause.clone(),
            on_back_button: self.on_back_button.clone(),
            on_memory_warning: self.on_memory_warning.clone(),
            on_save_state: self.on_save_state.clone(),
            on_restore_state: self.on_restore_state.clone(),
            subscription: None,
            saved_state: Arc::new(Mutex::new(None)),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscription is a closure, so Debug reports whether one is held and whether a bag is saved
impl fmt::Debug for AppLifecycle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("AppLifecycle")
            .field("on_state_change", &self.on_state_change)
            .field("on_resume", &self.on_resume)
            .field("on_pause", &self.on_pause)
            .field("on_back_button", &self.on_back_button)
            .field("on_memory_warning", &self.on_memory_warning)
            .field("on_save_state", &self.on_save_state)
            .field("on_restore_state", &self.on_restore_state)
            .field("attached", &self.subscription.is_some())
            .field("saved_state", &self.saved_state.lock().unwrap().is_some())
            .finish();
    }
}

flight_entity::impl_entity!(AppLifecycle);
