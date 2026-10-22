use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError};
use flight_geometry::Vector2;
use flight_host::ProviderRef;
use flight_signals::Signal;

/// The four logical display orientations (TS `ScreenOrientation`); the flipped variants are the 180-degree counterparts.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ScreenOrientation {
    #[default]
    Landscape,
    LandscapeFlipped,
    Portrait,
    PortraitFlipped,
}

/// The color gamut a display covers (TS `ScreenColorSpace`); `Srgb` is the default.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ScreenColorSpace {
    DisplayP3,
    Rec2020,
    #[default]
    Srgb,
}

/// The window-management permission states a screen host can report (TS `ScreenPermissionState`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ScreenPermissionState {
    Denied,
    Granted,
    #[default]
    Prompt,
}

/// What kind of display change an event reports (TS `ScreenChangeKind`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ScreenChangeKind {
    #[default]
    ScreenAdded,
    ScreenMetricsChanged,
    ScreenRemoved,
}

/// A single display's geometry in OS virtual-desktop coordinates (TS `ScreenInfo extends Entity`).
/// `work_*` excludes OS chrome; `scale_factor` is the device-pixel ratio. Unsupplied fields carry
/// sentinels: numeric metrics -1, `label` "", `touch_support` "unknown" (an open string, as in TS).
/// Geometry and metrics are f32 (desktop pixels, Hz, nits, dpi: reported values, never accumulated).
// flight-lint: allow(f64) `id` is an arbitrary TS number that is matched exactly (get_screen_by_id); real display ids (e.g. Electron's 2528732444) exceed f32's exact-integer range, and TS declares no integer domain to lower to
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ScreenInfo {
    pub(crate) runtime: EntityRuntimeSlot,
    pub id: f64,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub work_width: f32,
    pub work_height: f32,
    pub scale_factor: f32,
    pub is_primary: bool,
    /// Clockwise rotation in degrees, or -1 when unreported.
    pub rotation: f32,
    pub orientation: ScreenOrientation,
    /// Refresh rate in Hz, or -1.
    pub refresh_rate: f32,
    /// Bits per pixel, or -1.
    pub color_depth: f32,
    pub pixel_depth: f32,
    /// Resolution in physical device pixels, or -1.
    pub physical_width: f32,
    pub physical_height: f32,
    pub is_hdr: bool,
    pub color_space: ScreenColorSpace,
    /// Peak luminance in nits for HDR displays, or -1.
    pub max_luminance: f32,
    /// Bits per color component, or -1.
    pub depth_per_component: f32,
    /// Dots per inch, or -1.
    pub dpi: f32,
    /// Host-provided display name, or "".
    pub label: String,
    /// True for built-in displays.
    pub internal: bool,
    /// Touch capability, or "unknown".
    pub touch_support: String,
    pub monochrome: bool,
}

/// One selectable display mode (TS `ScreenMode extends Entity`). Sentinels: `refresh_rate` and
/// `color_depth` -1, `pixel_format` "".
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ScreenMode {
    runtime: EntityRuntimeSlot,
    pub width: f32,
    pub height: f32,
    pub refresh_rate: f32,
    pub color_depth: f32,
    /// Host-specific pixel format identifier, or "".
    pub pixel_format: String,
}

/// Which metric groups changed in a `ScreenMetricsChanged` event (TS `ScreenChangedMetrics`). Plain
/// data.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ScreenChangedMetrics {
    pub bounds: bool,
    pub work_area: bool,
    pub scale_factor: bool,
    pub orientation: bool,
}

/// One display change delivered to a change subscriber (TS `ScreenChangeEvent`). Plain data;
/// `changed_metrics` is Some only for `ScreenMetricsChanged` (TS non-null) and None for add/remove.
#[derive(Clone, Debug, PartialEq)]
pub struct ScreenChangeEvent {
    pub kind: ScreenChangeKind,
    pub screen: ScreenInfo,
    pub changed_metrics: Option<ScreenChangedMetrics>,
}

/// A provider change listener and the release a provider returns.
pub type ScreenChangeListener = Arc<dyn Fn(&ScreenChangeEvent) + Send + Sync>;
pub type ScreenPermissionListener = Arc<dyn Fn(ScreenPermissionState) + Send + Sync>;
pub type ScreenUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// A permission query result, or the error carried by a rejected TS Promise.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<_, FlightError> passes the provider's rejection through unchanged, as TS does
pub type ScreenPermissionResult = Result<ScreenPermissionState, FlightError>;

/// A details-request result, or the error carried by a rejected TS Promise.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<_, FlightError> passes the provider's rejection through unchanged, as TS does
pub type ScreenDetailsRequestResult = Result<bool, FlightError>;

/// Boxed, Send futures returned by the details provider (D15).
pub type ScreenPermissionFuture = Pin<Box<dyn Future<Output = ScreenPermissionResult> + Send>>;
pub type ScreenDetailsRequestFuture =
    Pin<Box<dyn Future<Output = ScreenDetailsRequestResult> + Send>>;

/// The query provider every screen query takes (TS `HostScreenQueryCapability`): fills caller-owned
/// `out` values. `destroy` is optional (TS optional method).
#[derive(Clone)]
pub struct HostScreenQueryCapability {
    pub provider: ProviderRef,
    pub destroy: Option<Arc<dyn Fn() + Send + Sync>>,
    pub get_screens: Arc<dyn Fn(&mut Vec<ScreenInfo>) + Send + Sync>,
    pub get_primary_screen: Arc<dyn Fn(&mut ScreenInfo) + Send + Sync>,
    pub get_cursor_position: Arc<dyn Fn(&mut Vector2) + Send + Sync>,
}

/// Display change delivery (TS `HostScreenChangeCapability`).
#[derive(Clone)]
pub struct HostScreenChangeCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(ScreenChangeListener) -> ScreenUnsubscribe + Send + Sync>,
}

/// Window-management permission routing (TS `HostScreenDetailsCapability`). Capability routing only:
/// the SDK raises no OS dialog of its own.
#[derive(Clone)]
pub struct HostScreenDetailsCapability {
    pub provider: ProviderRef,
    pub query_permission: Arc<dyn Fn() -> ScreenPermissionFuture + Send + Sync>,
    pub request: Arc<dyn Fn() -> ScreenDetailsRequestFuture + Send + Sync>,
}

/// Permission-state change delivery (TS `HostScreenPermissionChangeCapability`).
#[derive(Clone)]
pub struct HostScreenPermissionChangeCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(ScreenPermissionListener) -> ScreenUnsubscribe + Send + Sync>,
}

/// Host screen capability group (TS `HostScreenCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostScreenCapabilities {
    pub change: Option<HostScreenChangeCapability>,
    pub details: Option<HostScreenDetailsCapability>,
    pub permission_change: Option<HostScreenPermissionChangeCapability>,
    pub query: Option<HostScreenQueryCapability>,
}

/// Screen change event entity (TS `ScreenSignals extends Entity`). `on_screen_metrics_changed`
/// carries the full event; add/remove carry the affected screen. The private `subscription` is the
/// attached provider's release (TS keeps it in a module WeakMap keyed by the entity).
#[derive(Default)]
pub struct ScreenSignals {
    runtime: EntityRuntimeSlot,
    pub on_screen_added: Signal<ScreenInfo>,
    pub on_screen_metrics_changed: Signal<ScreenChangeEvent>,
    pub on_screen_removed: Signal<ScreenInfo>,
    pub(crate) subscription: Option<ScreenUnsubscribe>,
}

/// Permission-state change entity (TS `ScreenPermissionChange extends Entity`).
#[derive(Default)]
pub struct ScreenPermissionChange {
    runtime: EntityRuntimeSlot,
    pub on_change: Signal<ScreenPermissionState>,
    pub(crate) subscription: Option<ScreenUnsubscribe>,
}

/// Caller-owned enumeration scratch for the derived queries (D5), replacing the source's module
/// `_scratchScreens` array: the same buffer is handed to the provider on every derived query that
/// is given this scratch, so hot paths allocate nothing, as in TS.
// flight-lint: allow(contract-vocabulary) D5: Rust-only caller-owned scratch replacing the source module scratch array; never transpiled
#[derive(Default)]
pub struct ScreenQueryScratch {
    pub(crate) screens: Vec<ScreenInfo>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: a clone shares the three signals (identity, as TS) but not the attach subscription, which TS keys to the original entity only
impl Clone for ScreenSignals {
    fn clone(&self) -> Self {
        return ScreenSignals {
            runtime: EntityRuntimeSlot::default(),
            on_screen_added: self.on_screen_added.clone(),
            on_screen_metrics_changed: self.on_screen_metrics_changed.clone(),
            on_screen_removed: self.on_screen_removed.clone(),
            subscription: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscription is a closure, so Debug reports whether one is held
impl fmt::Debug for ScreenSignals {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ScreenSignals")
            .field("on_screen_added", &self.on_screen_added)
            .field("on_screen_metrics_changed", &self.on_screen_metrics_changed)
            .field("on_screen_removed", &self.on_screen_removed)
            .field("attached", &self.subscription.is_some())
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: a clone shares the signal (identity, as TS) but not the attach subscription
impl Clone for ScreenPermissionChange {
    fn clone(&self) -> Self {
        return ScreenPermissionChange {
            runtime: EntityRuntimeSlot::default(),
            on_change: self.on_change.clone(),
            subscription: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscription is a closure, so Debug reports whether one is held
impl fmt::Debug for ScreenPermissionChange {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ScreenPermissionChange")
            .field("on_change", &self.on_change)
            .field("attached", &self.subscription.is_some())
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the scratch buffer is internal, so Debug reports its length only
impl fmt::Debug for ScreenQueryScratch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ScreenQueryScratch")
            .field("screens", &self.screens.len())
            .finish();
    }
}

flight_entity::impl_entity!(ScreenInfo);
flight_entity::impl_entity!(ScreenMode);
flight_entity::impl_entity!(ScreenSignals);
flight_entity::impl_entity!(ScreenPermissionChange);
