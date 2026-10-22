use std::fmt;
use std::sync::{Arc, RwLock, Weak};

use flight_entity::{EntityRuntimeSlot, Ref, Unknown};
use flight_host::{FrameRequestHandle, ProviderRef};
use flight_signals::Signal;

use crate::types::*;
use crate::window_types::*;

/// The frame loop entity (TS `AppLoop extends Entity`), shared as a `Ref<AppLoop>` handle: the
/// host's frame callbacks and window lifecycle listeners update it. The opt-in lifecycle signals
/// (`on_activate`, `on_deactivate`, `on_error`, `on_fixed_update`) are `None` until
/// `enable_app_loop_lifecycle_signals`.
///
/// The private fields replace the source's module side tables keyed by the loop: the observer
/// registry (in first-set order), the shared loop state, and the explicit main window.
// flight-lint: allow(f64) D1: frame times, accumulated elapsed seconds and the step ratio are JS numbers from host timestamps
pub struct AppLoop {
    runtime: EntityRuntimeSlot,
    /// Milliseconds elapsed since the previous frame, clamped to the loop's maximum delta.
    pub delta_time: f64,
    /// Total elapsed time in seconds since the loop started.
    pub elapsed_time: f64,
    /// Number of frames processed since the loop started.
    pub frame_count: u32,
    /// Position within the current fixed step at render time, in [0, 1]; 1 in pure variable mode.
    pub interpolation_alpha: f64,
    /// Whether the loop is running (not stopped or paused).
    pub is_running: bool,
    pub on_activate: Option<Signal<()>>,
    pub on_deactivate: Option<Signal<()>>,
    pub on_error: Option<Signal<Unknown>>,
    pub on_exit: Signal<()>,
    pub on_fixed_update: Option<Signal<f64>>,
    pub on_render: Signal<()>,
    pub on_update: Signal<f64>,
    /// Managed windows registered with `register_app_loop_window`.
    pub windows: Vec<Ref<AppWindow>>,
    pub(crate) loop_state: Option<Ref<AppLoopState>>,
    pub(crate) main_window: Option<Ref<AppWindow>>,
    pub(crate) observers: Vec<(AppLoopObserverKey, AppUnsubscribe)>,
}

/// The observer slots a loop keeps (the source's symbols, including one per window for lifecycle
/// wiring, keyed here by the window handle).
#[derive(Clone)]
pub(crate) enum AppLoopObserverKey {
    Exit,
    Lifecycle(Weak<RwLock<AppWindow>>),
    Loop,
    Paused,
}

/// Per-loop scheduling state (the source's `LoopState`), shared with the frame callback so pause,
/// resume and step see the same accumulators.
// flight-lint: allow(f64) D1: frame times, accumulators and limits are JS numbers from host timestamps and options
pub(crate) struct AppLoopState {
    pub(crate) fixed_accumulator: f64,
    pub(crate) fixed_time_step: f64,
    pub(crate) fps_buffer: Vec<f64>,
    pub(crate) fps_head: usize,
    pub(crate) frame_handle: FrameRequestHandle,
    pub(crate) frame_rate_accumulated: f64,
    pub(crate) last_time: f64,
    pub(crate) max_delta_time: f64,
    pub(crate) max_updates_per_frame: f64,
}

/// Options for `start_app_loop` (TS `AppLoopOptions`). `None` fields use the loop defaults: a
/// 250 ms maximum delta, no frame-rate cap, no background throttle, no fixed step, and at most 5
/// fixed updates per frame. Plain record.
// flight-lint: allow(f64) D1: rates and durations are JS numbers combined with host timestamps
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AppLoopOptions {
    /// Maximum per-frame delta in milliseconds.
    pub max_delta_time: Option<f64>,
    /// Target frames per second; 0 disables the cap.
    pub target_frame_rate: Option<f64>,
    /// Frames per second while backgrounded; 0 uses the foreground rate.
    pub background_frame_rate: Option<f64>,
    /// Fixed-timestep size in milliseconds for `on_fixed_update`; 0 disables fixed mode.
    pub fixed_time_step: Option<f64>,
    /// Maximum fixed-update iterations per frame (spiral-of-death guard).
    pub max_updates_per_frame: Option<f64>,
}

/// The step options `step_app_loop` honors (TS `AppStepOptions`, the non-scheduling fields of
/// `AppLoopOptions`). Plain record.
// flight-lint: allow(f64) D1: durations are JS numbers combined with host timestamps
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AppStepOptions {
    pub fixed_time_step: Option<f64>,
    pub max_delta_time: Option<f64>,
    pub max_updates_per_frame: Option<f64>,
}

/// A frame callback the host invokes with its frame timestamp in milliseconds.
// flight-lint: allow(f64) D1: the host frame timestamp is a JS number
pub type AppFrameCallback = Arc<dyn Fn(f64) + Send + Sync>;

/// TS `HostAppLoopCapability`: frame scheduling. The frame handle is the provider-issued numeric
/// `FrameRequestHandle` (D26; the web's `requestAnimationFrame` id).
// flight-lint: allow(f64) D1: the host clock returns a JS number
#[derive(Clone)]
pub struct HostAppLoopCapability {
    pub provider: ProviderRef,
    pub cancel_frame: Arc<dyn Fn(FrameRequestHandle) + Send + Sync>,
    pub now: Arc<dyn Fn() -> f64 + Send + Sync>,
    pub request_frame: Arc<dyn Fn(AppFrameCallback) -> FrameRequestHandle + Send + Sync>,
}

/// TS `HostAppExitCapability`: the host's application-exit event.
#[derive(Clone)]
pub struct HostAppExitCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(AppListener) -> AppUnsubscribe + Send + Sync>,
}

/// Host app capability group (TS `HostAppCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostAppCapabilities {
    pub activate: Option<HostAppActivateCapability>,
    pub activation_policy: Option<HostAppActivationPolicyCapability>,
    pub all_windows_closed: Option<HostAppAllWindowsClosedCapability>,
    pub badge: Option<HostAppBadgeCapability>,
    pub dock: Option<HostAppDockCapability>,
    pub exit: Option<HostAppExitCapability>,
    pub focus: Option<HostAppFocusCapability>,
    pub hide: Option<HostAppHideCapability>,
    pub locale: Option<HostAppLocaleCapability>,
    pub login_item: Option<HostAppLoginItemCapability>,
    pub loop_: Option<HostAppLoopCapability>,
    pub name: Option<HostAppNameCapability>,
    pub name_write: Option<HostAppNameWriteCapability>,
    pub open_file: Option<HostAppOpenFileCapability>,
    pub path: Option<HostAppPathCapability>,
    pub quit: Option<HostAppQuitCapability>,
    pub quit_request: Option<HostAppQuitRequestCapability>,
    pub ready: Option<HostAppReadyCapability>,
    pub recent_documents: Option<HostAppRecentDocumentsCapability>,
    pub relaunch: Option<HostAppRelaunchCapability>,
    pub second_instance: Option<HostAppSecondInstanceCapability>,
    pub show: Option<HostAppShowCapability>,
    pub single_instance: Option<HostAppSingleInstanceCapability>,
    pub user_model_id: Option<HostAppUserModelIdCapability>,
    pub version: Option<HostAppVersionCapability>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_app_loop sets the source defaults
impl Default for AppLoop {
    fn default() -> Self {
        return AppLoop {
            runtime: EntityRuntimeSlot::default(),
            delta_time: 0.0,
            elapsed_time: 0.0,
            frame_count: 0,
            interpolation_alpha: 1.0,
            is_running: false,
            on_activate: None,
            on_deactivate: None,
            on_error: None,
            on_exit: Signal::default(),
            on_fixed_update: None,
            on_render: Signal::default(),
            on_update: Signal::default(),
            windows: Vec::new(),
            loop_state: None,
            main_window: None,
            observers: Vec::new(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: observers and loop state hold closures and handles, so Debug reports the public timing state
impl fmt::Debug for AppLoop {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("AppLoop")
            .field("delta_time", &self.delta_time)
            .field("elapsed_time", &self.elapsed_time)
            .field("frame_count", &self.frame_count)
            .field("interpolation_alpha", &self.interpolation_alpha)
            .field("is_running", &self.is_running)
            .field("windows", &self.windows.len())
            .finish();
    }
}

flight_entity::impl_entity!(AppLoop);
