use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError, Ref, Unknown};
use flight_geometry::{Rectangle, Vector2};
use flight_hostcapability::ProviderRef;
use flight_menu::MenuItemTemplate;
use flight_signals::Signal;
use flight_stream::{AbortSignal, SharedFuture};

use crate::results::*;

/// A returned TS Promise (D15): boxed, Send and executor-neutral. Tray operations call their
/// provider synchronously, as the source does before its first `await`, and return this future.
pub type TrayFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

/// A provider Promise. `Err` is its rejection, which the operation maps to the failure outcome
/// carrying `error`.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm in Rust
pub type TrayProviderFuture<T> = TrayFuture<Result<T, FlightError>>;

/// A path or data URI understood by the native host (TS `TrayIconSource`). Image decoding remains
/// the provider's job.
pub type TrayIconSource = String;

/// Creation options (TS `TrayIconOptions`). Plain record.
#[derive(Clone, Default)]
pub struct TrayIconOptions {
    pub icon: Option<TrayIconSource>,
    pub icon_template: Option<bool>,
    pub signal: Option<AbortSignal>,
    pub title: Option<String>,
    pub tooltip: Option<String>,
}

/// Balloon options (TS `TrayBalloonOptions`). Plain record.
#[derive(Clone, Debug, Default)]
pub struct TrayBalloonOptions {
    pub icon: Option<TrayIconSource>,
    pub icon_type: Option<TrayBalloonIconType>,
    pub large_icon: Option<bool>,
    pub no_sound: Option<bool>,
    pub respect_quiet_time: Option<bool>,
    pub text: String,
    pub title: String,
}

/// Stable public tray identity (TS `TrayIcon extends Entity`). Callers and providers share it as a
/// `Ref<TrayIcon>` handle, whose `Arc` identity is the source's object identity; provider-local keys
/// stay inside the native adapter. The private `tray_runtime` is the source's runtime-slot record,
/// present only on a tray that `create_tray_icon` published.
#[derive(Default)]
pub struct TrayIcon {
    runtime: EntityRuntimeSlot,
    pub(crate) tray_runtime: Option<TrayRuntime>,
}

/// The lifecycle state of a published tray (TS `TrayRuntime['state']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TrayState {
    Active,
    Destroying,
    PartiallyDestroyed,
    Destroyed,
}

/// The source's `TrayRuntime`: the origin lifecycle provider, the live event releases, the stored
/// destroy Promise and the animation write chain (D20 `SharedFuture`s). `animation_timer` records
/// whether the source's interval would be set; the interval tick itself is held (see
/// `start_tray_icon_animation`).
pub(crate) struct TrayRuntime {
    pub(crate) animation_generation: u64,
    pub(crate) animation_timer: bool,
    pub(crate) animation_write_tail: SharedFuture<()>,
    pub(crate) destroy_future: Option<SharedFuture<TrayDestroyResult>>,
    pub(crate) lifecycle: HostTrayLifecycleCapability,
    pub(crate) next_release_id: u64,
    pub(crate) releases: Vec<(u64, TrayEventRelease)>,
    pub(crate) state: TrayState,
}

/// The create result (TS `TrayCreateResult`, an `Entity &` union allocated by `create_tray_icon`).
#[derive(Clone, Debug)]
pub struct TrayCreateResult {
    runtime: EntityRuntimeSlot,
    pub outcome: TrayCreateOutcome,
}

/// The arms of `TrayCreateResult`: the created tray, or the provider's non-created outcome.
#[derive(Clone, Debug)]
pub enum TrayCreateOutcome {
    Created(TrayCreated),
    Cancelled,
    RuntimeApiUnavailable(TrayFailure),
    InvalidIcon(TrayFailure),
    TrayCreateFailed(TrayFailure),
}

/// One failed destroy step (TS `TrayDestroyFailure`; `step` is always `'native-resource'`).
#[derive(Clone, Debug)]
pub struct TrayDestroyFailure {
    pub error: Option<Unknown>,
}

/// The optional `unknown` error a failure outcome carries (TS `{ error?: unknown }`): outer `None` is
/// an absent error, `Some(None)` the source's `null`.
#[derive(Clone, Debug)]
pub struct TrayFailure {
    pub error: Option<Unknown>,
}

/// The created arm of `TrayCreateOutcome`.
#[derive(Clone, Debug)]
pub struct TrayCreated {
    pub tray: Ref<TrayIcon>,
}

/// The failed arm of a destroy result: one entry per failed step.
#[derive(Clone, Debug)]
pub struct TrayDestroyFailures {
    pub failures: Vec<TrayDestroyFailure>,
}

/// The available arm of `TrayTitleReadResult`.
#[derive(Clone, Debug)]
pub struct TrayTitleReading {
    pub title: String,
}

/// The available arm of `TrayTooltipReadResult`.
#[derive(Clone, Debug)]
pub struct TrayTooltipReading {
    pub tooltip: String,
}

/// The available arm of `TrayBoundsResult`.
#[derive(Clone, Debug)]
pub struct TrayBoundsReading {
    pub bounds: Rectangle,
}

/// The `files` arm of `TrayDropEvent`.
#[derive(Clone, Debug)]
pub struct TrayDropFiles {
    pub files: Vec<String>,
}

/// The `text` arm of `TrayDropEvent`.
#[derive(Clone, Debug)]
pub struct TrayDropText {
    pub text: String,
}

/// A pointer interaction with the tray icon (TS `TrayInteractionEvent`).
#[derive(Clone, Debug)]
pub struct TrayInteractionEvent {
    pub alt_key: bool,
    pub bounds: Option<Rectangle>,
    pub ctrl_key: bool,
    pub meta_key: bool,
    pub position: Option<Vector2>,
    pub shift_key: bool,
    pub type_: TrayInteractionType,
}

/// A context-menu selection (TS `TrayMenuSelectionEvent`).
#[derive(Clone, Debug)]
pub struct TrayMenuSelectionEvent {
    pub id: String,
}

/// A balloon lifecycle event (TS `TrayBalloonEvent`).
#[derive(Clone, Debug)]
pub struct TrayBalloonEvent {
    pub type_: TrayBalloonEventType,
}

/// Data dropped on the tray icon (TS `TrayDropEvent`).
#[derive(Clone, Debug)]
pub enum TrayDropEvent {
    Files(TrayDropFiles),
    Text(TrayDropText),
}

/// A release token (TS `TrayEventRelease`). Clones share one registration, as the source shares
/// the token object between the caller and the tray's release set; the call reports
/// `AlreadyReleased` once a release succeeded.
#[derive(Clone)]
pub struct TrayEventRelease {
    pub release: Arc<dyn Fn() -> TrayFuture<TrayReleaseResult> + Send + Sync>,
}

/// The opt-in animation inspection hook (TS `setTrayAnimationGuard` argument): tray, frame count and
/// interval in milliseconds.
// flight-lint: allow(f64) D1: the interval is a millisecond duration on the flight-signals timer clock
pub type TrayAnimationGuard = Arc<dyn Fn(&Ref<TrayIcon>, i32, f64) + Send + Sync>;

/// Caller-owned animation state (D5). It replaces the source's module-level `_animationGuard` slot:
/// the guard is installed per state, never process-wide.
#[derive(Clone)]
pub struct TrayAnimationState {
    pub guard: Option<TrayAnimationGuard>,
}

// Provider contracts. Each shape is independently claimable by Host construction; an unsupported
// operation has no slot and therefore no callable method or runtime `unsupported` outcome.

/// TS `HostTrayLifecycleCapability`.
#[derive(Clone)]
pub struct HostTrayLifecycleCapability {
    pub provider: ProviderRef,
    pub create: Arc<
        dyn Fn(&Ref<TrayIcon>, &TrayIconOptions) -> TrayProviderFuture<TrayCreateCapabilityResult>
            + Send
            + Sync,
    >,
    pub destroy: Arc<
        dyn Fn(&Ref<TrayIcon>) -> TrayProviderFuture<TrayDestroyCapabilityResult> + Send + Sync,
    >,
    pub is_destroyed: Arc<dyn Fn(&Ref<TrayIcon>) -> bool + Send + Sync>,
    pub list: Arc<dyn Fn() -> Vec<Ref<TrayIcon>> + Send + Sync>,
}

/// TS `HostTrayImageCapability`.
#[derive(Clone)]
pub struct HostTrayImageCapability {
    pub provider: ProviderRef,
    pub set: Arc<
        dyn Fn(&Ref<TrayIcon>, &str) -> TrayProviderFuture<TrayImageUpdateResult> + Send + Sync,
    >,
}

/// TS `HostTrayTitleCapability`.
#[derive(Clone)]
pub struct HostTrayTitleCapability {
    pub provider: ProviderRef,
    pub get: Arc<dyn Fn(&Ref<TrayIcon>) -> TrayProviderFuture<TrayTitleReadResult> + Send + Sync>,
    pub set: Arc<
        dyn Fn(&Ref<TrayIcon>, &str) -> TrayProviderFuture<TrayTitleUpdateResult> + Send + Sync,
    >,
}

/// TS `HostTrayTooltipCapability`.
#[derive(Clone)]
pub struct HostTrayTooltipCapability {
    pub provider: ProviderRef,
    pub get: Arc<dyn Fn(&Ref<TrayIcon>) -> TrayProviderFuture<TrayTooltipReadResult> + Send + Sync>,
    pub set: Arc<
        dyn Fn(&Ref<TrayIcon>, &str) -> TrayProviderFuture<TrayTooltipUpdateResult> + Send + Sync,
    >,
}

/// TS `HostTrayMenuCapability`. Items are the caller's shared descriptor handles, passed by identity.
#[derive(Clone)]
pub struct HostTrayMenuCapability {
    pub provider: ProviderRef,
    pub set: Arc<
        dyn Fn(&Ref<TrayIcon>, &[Ref<MenuItemTemplate>]) -> TrayProviderFuture<TrayMenuUpdateResult>
            + Send
            + Sync,
    >,
}

/// TS `HostTrayTemplateImageCapability`.
#[derive(Clone)]
pub struct HostTrayTemplateImageCapability {
    pub provider: ProviderRef,
    pub set: Arc<
        dyn Fn(&Ref<TrayIcon>, bool) -> TrayProviderFuture<TrayTemplateImageUpdateResult>
            + Send
            + Sync,
    >,
}

/// TS `HostTrayBoundsCapability`.
#[derive(Clone)]
pub struct HostTrayBoundsCapability {
    pub provider: ProviderRef,
    pub get: Arc<dyn Fn(&Ref<TrayIcon>) -> TrayProviderFuture<TrayBoundsResult> + Send + Sync>,
}

/// TS `HostTrayPopupMenuCapability`. `None` position = the source's omitted argument.
#[derive(Clone)]
pub struct HostTrayPopupMenuCapability {
    pub provider: ProviderRef,
    pub popup: Arc<
        dyn Fn(&Ref<TrayIcon>, Option<&Vector2>) -> TrayProviderFuture<TrayPopupMenuResult>
            + Send
            + Sync,
    >,
}

/// TS `HostTrayDoubleClickPolicyCapability`.
#[derive(Clone)]
pub struct HostTrayDoubleClickPolicyCapability {
    pub provider: ProviderRef,
    pub set_ignore: Arc<
        dyn Fn(&Ref<TrayIcon>, bool) -> TrayProviderFuture<TrayDoubleClickPolicyUpdateResult>
            + Send
            + Sync,
    >,
}

/// TS `HostTrayPressedImageCapability`.
#[derive(Clone)]
pub struct HostTrayPressedImageCapability {
    pub provider: ProviderRef,
    pub set: Arc<
        dyn Fn(&Ref<TrayIcon>, &str) -> TrayProviderFuture<TrayPressedImageUpdateResult>
            + Send
            + Sync,
    >,
}

/// TS `HostTrayBalloonCapability`.
#[derive(Clone)]
pub struct HostTrayBalloonCapability {
    pub provider: ProviderRef,
    pub display: Arc<
        dyn Fn(&Ref<TrayIcon>, &TrayBalloonOptions) -> TrayProviderFuture<TrayBalloonDisplayResult>
            + Send
            + Sync,
    >,
    pub remove:
        Arc<dyn Fn(&Ref<TrayIcon>) -> TrayProviderFuture<TrayBalloonRemoveResult> + Send + Sync>,
}

/// TS `HostTrayInteractionEventsCapability`. `None` = the source's `null` signal.
#[derive(Clone)]
pub struct HostTrayInteractionEventsCapability {
    pub provider: ProviderRef,
    pub get_signal:
        Arc<dyn Fn(&Ref<TrayIcon>) -> Option<Signal<TrayInteractionEvent>> + Send + Sync>,
}

/// TS `HostTrayMenuSelectionEventsCapability`.
#[derive(Clone)]
pub struct HostTrayMenuSelectionEventsCapability {
    pub provider: ProviderRef,
    pub get_signal:
        Arc<dyn Fn(&Ref<TrayIcon>) -> Option<Signal<TrayMenuSelectionEvent>> + Send + Sync>,
}

/// TS `HostTrayBalloonEventsCapability`.
#[derive(Clone)]
pub struct HostTrayBalloonEventsCapability {
    pub provider: ProviderRef,
    pub get_signal: Arc<dyn Fn(&Ref<TrayIcon>) -> Option<Signal<TrayBalloonEvent>> + Send + Sync>,
}

/// TS `HostTrayDropEventsCapability`.
#[derive(Clone)]
pub struct HostTrayDropEventsCapability {
    pub provider: ProviderRef,
    pub get_signal: Arc<dyn Fn(&Ref<TrayIcon>) -> Option<Signal<TrayDropEvent>> + Send + Sync>,
}

/// Host tray capability group (TS `HostTrayCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostTrayCapabilities {
    pub balloon: Option<HostTrayBalloonCapability>,
    pub balloon_events: Option<HostTrayBalloonEventsCapability>,
    pub bounds: Option<HostTrayBoundsCapability>,
    pub double_click_policy: Option<HostTrayDoubleClickPolicyCapability>,
    pub drop_events: Option<HostTrayDropEventsCapability>,
    pub image: Option<HostTrayImageCapability>,
    pub interaction_events: Option<HostTrayInteractionEventsCapability>,
    pub lifecycle: Option<HostTrayLifecycleCapability>,
    pub menu: Option<HostTrayMenuCapability>,
    pub menu_selection_events: Option<HostTrayMenuSelectionEventsCapability>,
    pub popup_menu: Option<HostTrayPopupMenuCapability>,
    pub pressed_image: Option<HostTrayPressedImageCapability>,
    pub template_image: Option<HostTrayTemplateImageCapability>,
    pub title: Option<HostTrayTitleCapability>,
    pub tooltip: Option<HostTrayTooltipCapability>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the runtime record holds closures and futures, so Debug reports only the lifecycle state
impl fmt::Debug for TrayIcon {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("TrayIcon")
            .field(
                "state",
                &self.tray_runtime.as_ref().map(|runtime| runtime.state),
            )
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; every initialize_tray_create_* sets the outcome
impl Default for TrayCreateResult {
    fn default() -> Self {
        return TrayCreateResult {
            runtime: EntityRuntimeSlot::default(),
            outcome: TrayCreateOutcome::Cancelled,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the release is a closure, so Debug names the type only
impl fmt::Debug for TrayEventRelease {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f.debug_struct("TrayEventRelease").finish_non_exhaustive();
    }
}

flight_entity::impl_entity!(TrayIcon);

flight_entity::impl_entity!(TrayCreateResult);
