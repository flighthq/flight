//! Display/monitor enumeration seam. Free functions in `flighthq-screen` delegate
//! to the active [`ScreenBackend`] (native default or a host's). A host reports
//! every attached display with full per-monitor metrics. Enumeration writes into
//! caller-owned `out` arrays and objects so hot paths allocate nothing.

use crate::geometry::Vector2Like;
use flighthq_signals::Signal;

/// A display's wide-gamut color space classification. Mirrors the TS
/// `ScreenColorSpace` union (`'srgb' | 'display-p3' | 'rec2020'`).
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ScreenColorSpace {
    #[default]
    Srgb,
    DisplayP3,
    Rec2020,
}

/// A display's reported orientation. Mirrors the TS `ScreenOrientation` union
/// (`'Landscape' | 'Portrait' | 'LandscapeFlipped' | 'PortraitFlipped'`).
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ScreenOrientation {
    #[default]
    Landscape,
    Portrait,
    LandscapeFlipped,
    PortraitFlipped,
}

/// Whether the display reports touch capability. Mirrors the TS `touchSupport`
/// union (`'unknown' | 'available' | 'unavailable'`).
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ScreenTouchSupport {
    #[default]
    Unknown,
    Available,
    Unavailable,
}

/// A single display's geometry in OS virtual-desktop coordinates plus full
/// per-monitor metrics. `work_*` excludes OS chrome (taskbar, menu bar);
/// `scale_factor` is the device-pixel ratio. Sentinel fields are `-1` (numeric),
/// `""` (label), or `false` when the host cannot report them.
#[derive(Clone, Debug)]
pub struct ScreenInfo {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub work_width: f32,
    pub work_height: f32,
    pub scale_factor: f32,
    pub is_primary: bool,
    /// Clockwise rotation in degrees (0/90/180/270), or `-1` when unknown.
    pub rotation: f32,
    pub orientation: ScreenOrientation,
    /// Refresh rate in Hz, or `-1` when unknown.
    pub refresh_rate: f32,
    /// Bits per pixel for the framebuffer, or `-1` when unknown.
    pub color_depth: f32,
    /// Bits per pixel reported by the platform, or `-1` when unknown.
    pub pixel_depth: f32,
    /// Width in physical device pixels, or `-1` when unknown.
    pub physical_width: f32,
    /// Height in physical device pixels, or `-1` when unknown.
    pub physical_height: f32,
    pub is_hdr: bool,
    pub color_space: ScreenColorSpace,
    /// Peak luminance in nits, or `-1` when unknown.
    pub max_luminance: f32,
    /// Bits per color component, or `-1` when unknown.
    pub depth_per_component: f32,
    /// Dots per inch, or `-1` when unknown.
    pub dpi: f32,
    /// Human-readable display label (e.g. `"Built-in"`), or `""` when unknown.
    pub label: String,
    /// True for a built-in display (laptop panel, phone screen).
    pub internal: bool,
    pub touch_support: ScreenTouchSupport,
    pub monochrome: bool,
}

impl Default for ScreenInfo {
    fn default() -> Self {
        ScreenInfo {
            id: 0,
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
            work_width: 0.0,
            work_height: 0.0,
            scale_factor: 1.0,
            is_primary: false,
            rotation: -1.0,
            orientation: ScreenOrientation::Landscape,
            refresh_rate: -1.0,
            color_depth: -1.0,
            pixel_depth: -1.0,
            physical_width: -1.0,
            physical_height: -1.0,
            is_hdr: false,
            color_space: ScreenColorSpace::Srgb,
            max_luminance: -1.0,
            depth_per_component: -1.0,
            dpi: -1.0,
            label: String::new(),
            internal: false,
            touch_support: ScreenTouchSupport::Unknown,
            monochrome: false,
        }
    }
}

/// A display mode — a single resolution/refresh-rate pair a display can present.
/// Sentinel fields are `-1` (numeric) or `""` (`pixel_format`).
#[derive(Clone, Debug)]
pub struct ScreenMode {
    pub width: f32,
    pub height: f32,
    /// Refresh rate in Hz, or `-1` when unknown.
    pub refresh_rate: f32,
    /// Bits per pixel, or `-1` when unknown.
    pub color_depth: f32,
    /// Pixel format identifier (e.g. `"RGBA8888"`), or `""` when unknown.
    pub pixel_format: String,
}

impl Default for ScreenMode {
    fn default() -> Self {
        ScreenMode {
            width: 0.0,
            height: 0.0,
            refresh_rate: -1.0,
            color_depth: -1.0,
            pixel_format: String::new(),
        }
    }
}

/// Which metric fields changed in a `ScreenMetricsChanged` event. Each flag is
/// `true` when the corresponding facet of the screen differs from the prior
/// snapshot.
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
pub struct ScreenChangedMetrics {
    pub bounds: bool,
    pub work_area: bool,
    pub scale_factor: bool,
    pub orientation: bool,
}

/// The kind of display change an event reports. Mirrors the TS `ScreenChangeKind`
/// union (`'ScreenAdded' | 'ScreenRemoved' | 'ScreenMetricsChanged'`).
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ScreenChangeKind {
    ScreenAdded,
    ScreenRemoved,
    #[default]
    ScreenMetricsChanged,
}

/// A display change event delivered to `ScreenBackend::subscribe` listeners and
/// fanned out to [`ScreenSignals`]. `changed_metrics` is populated only for
/// `ScreenMetricsChanged` (`None` for add/remove).
#[derive(Clone, Debug)]
pub struct ScreenChangeEvent {
    pub kind: ScreenChangeKind,
    pub screen: ScreenInfo,
    pub changed_metrics: Option<ScreenChangedMetrics>,
}

/// The screen change listener type: receives each [`ScreenChangeEvent`] by
/// reference. The TS counterpart is `(event) => void`.
pub type ScreenChangeListener = Box<dyn Fn(&ScreenChangeEvent) + Send + Sync>;

/// The seam every screen query follows: a host backend that fills caller-owned
/// `out` values. Methods return the same `out` they were given so callers can
/// chain or read inline.
pub trait ScreenBackend: Send + Sync {
    // Output lifetime binds to `out` (the filled buffer the caller passes in),
    // not to `&self`, so backends return the same buffer they wrote.
    fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo>;
    fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo;
    /// Registers a listener invoked on any display change; returns an
    /// unsubscribe closure.
    fn subscribe(&self, listener: ScreenChangeListener) -> Box<dyn Fn() + Send + Sync>;
    /// Fills `out` with the cursor position in virtual-desktop coordinates.
    /// Returns `(0, 0)` before the first reported move, or when unavailable.
    fn get_cursor_position<'a>(&self, out: &'a mut Vector2Like) -> &'a mut Vector2Like;
    /// Optional: fills `out` with every display mode for `screen`. Returns `None`
    /// when the backend cannot enumerate modes (the free function then derives a
    /// single synthetic mode).
    fn get_modes<'a>(
        &self,
        _screen: &ScreenInfo,
        _out: &'a mut Vec<ScreenMode>,
    ) -> Option<&'a mut Vec<ScreenMode>> {
        None
    }
}

/// Permission state for the host's multi-monitor detail API. Mirrors the TS
/// `'denied' | 'granted' | 'prompt'` (`PermissionState`) vocabulary.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ScreenDetailPermission {
    Denied,
    Granted,
    #[default]
    Prompt,
}

/// Screen change event entity — a group of signals fanned out from a single
/// backend subscription. Enable delivery with `attach_screen_signals`; the
/// signals stay inert until then.
#[derive(Debug, Default)]
pub struct ScreenSignals {
    pub on_screen_added: Signal<ScreenInfo>,
    pub on_screen_metrics_changed: Signal<ScreenChangeEvent>,
    pub on_screen_removed: Signal<ScreenInfo>,
}
