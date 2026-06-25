//! On-screen (soft) keyboard event seam types.
//!
//! The header layer for `flighthq-keyboard`: the snapshot ([`SoftKeyboardInfo`]),
//! the animation transition ([`SoftKeyboardTransition`]), the change-phase
//! marker ([`SoftKeyboardPhase`]), the resize/style kind vocabularies, the
//! backend seam ([`SoftKeyboardBackend`]), and the event entity ([`SoftKeyboard`]).

/// Resize-mode kind: how the app viewport reacts when the keyboard appears.
/// A plain string kind so a host backend can introduce its own (vendor-prefixed).
pub type SoftKeyboardResizeMode = &'static str;

/// The keyboard does not resize the app viewport.
pub const SOFT_KEYBOARD_RESIZE_NONE_KIND: SoftKeyboardResizeMode = "None";

/// The keyboard resizes the document body / app viewport.
pub const SOFT_KEYBOARD_RESIZE_BODY_KIND: SoftKeyboardResizeMode = "Body";

/// Style kind: the visual appearance of the on-screen keyboard (iOS light/dark).
pub type SoftKeyboardStyleKind = &'static str;

/// The platform-default keyboard appearance.
pub const SOFT_KEYBOARD_STYLE_DEFAULT_KIND: SoftKeyboardStyleKind = "Default";

/// The dark keyboard appearance.
pub const SOFT_KEYBOARD_STYLE_DARK_KIND: SoftKeyboardStyleKind = "Dark";

/// The phase of a keyboard change: `Will` fires before the show/hide animation,
/// `Did` after it ends. The web backend only ever reports `Did`.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SoftKeyboardPhase {
    Will,
    Did,
}

/// A snapshot of the on-screen keyboard geometry.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SoftKeyboardInfo {
    pub visible: bool,
    /// On-screen keyboard height in CSS pixels, or 0 when hidden.
    pub height: f32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
}

/// Timing + target height for a keyboard show/hide/resize animation, delivered
/// on the `Will` phase. `duration_seconds` is 0 on backends without timing.
#[derive(Copy, Clone, Debug, Default, PartialEq)]
pub struct SoftKeyboardTransition {
    pub duration_seconds: f32,
    pub height: f32,
}

/// Event seam for the on-screen (soft) keyboard: a snapshot reader, a change
/// subscription delivering a phase + transition, show/hide controls, and
/// optional resize-mode / style / accessory-bar / scroll-assist controls.
///
/// The web backend infers keyboard height from `visualViewport` shrink; a native
/// host reports its own keyboard changes through the same subscribe callback. The
/// optional methods default to no-op / sentinel so backends only implement what
/// the platform supports.
pub trait SoftKeyboardBackend: Send + Sync {
    fn get_info<'a>(&self, out: &'a mut SoftKeyboardInfo) -> &'a mut SoftKeyboardInfo;

    /// Registers a listener invoked on any keyboard change with the change phase
    /// and the animation transition; returns an unsubscribe function.
    #[allow(clippy::type_complexity)]
    fn subscribe(
        &self,
        listener: Box<dyn Fn(SoftKeyboardPhase, &SoftKeyboardTransition) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync>;

    fn show(&self);
    fn hide(&self);

    /// Returns the current resize mode. `None` when the backend does not support it.
    fn get_resize_mode(&self) -> Option<SoftKeyboardResizeMode> {
        None
    }

    /// Sets the resize mode. No-op when unsupported. Returns `true` when applied.
    fn set_resize_mode(&self, _mode: SoftKeyboardResizeMode) -> bool {
        false
    }

    /// Sets the keyboard style. No-op when unsupported. Returns `true` when applied.
    fn set_style(&self, _style: SoftKeyboardStyleKind) -> bool {
        false
    }

    /// Returns whether the input accessory bar is visible. `None` when unsupported.
    fn get_accessory_bar_visible(&self) -> Option<bool> {
        None
    }

    /// Sets accessory-bar visibility. No-op when unsupported. Returns `true` when applied.
    fn set_accessory_bar_visible(&self, _visible: bool) -> bool {
        false
    }

    /// Returns whether scroll-assist is enabled. `None` when unsupported.
    fn get_scroll_assist_enabled(&self) -> Option<bool> {
        None
    }

    /// Sets scroll-assist enabled. No-op when unsupported. Returns `true` when applied.
    fn set_scroll_assist_enabled(&self, _enabled: bool) -> bool {
        false
    }
}

/// On-screen keyboard event entity. Enable delivery with `attach_soft_keyboard`;
/// the signals stay inert until then. The `on_will_*` signals fire before the
/// animation, the `on_did_*` (and the simple-path `on_show`/`on_hide`/`on_resize`
/// aliases) after it.
#[derive(Debug, Default)]
pub struct SoftKeyboard {
    pub on_show: flighthq_signals::Signal<f32>,
    pub on_hide: flighthq_signals::Signal<()>,
    pub on_resize: flighthq_signals::Signal<f32>,
    pub on_will_show: flighthq_signals::Signal<SoftKeyboardTransition>,
    pub on_will_hide: flighthq_signals::Signal<SoftKeyboardTransition>,
    pub on_will_resize: flighthq_signals::Signal<SoftKeyboardTransition>,
    pub on_did_show: flighthq_signals::Signal<f32>,
    pub on_did_hide: flighthq_signals::Signal<()>,
    pub on_did_resize: flighthq_signals::Signal<f32>,
}
