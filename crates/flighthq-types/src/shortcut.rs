//! Global OS hotkey seam types.
//!
//! Free functions in `flighthq-shortcut` delegate to the active
//! [`ShortcutBackend`] (web default or a native host's). Web has no
//! global-hotkey capability, so the web backend returns `false` / no-op /
//! empty sentinels rather than panicking — global shortcuts require a native
//! host (Electron / Tauri).

use flighthq_signals::Signal;

/// A normalized accelerator string (fixed modifier order, canonical key name),
/// e.g. `"Control+Shift+K"`. Two `Accelerator` values that compare equal
/// represent the same chord. Mirrors the TS branded `Accelerator` string type.
pub type Accelerator = String;

/// A modifier key in an accelerator chord. `CommandOrControl` is a portable
/// alias that resolves to `Meta` on macOS and `Control` elsewhere.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ShortcutModifier {
    Control,
    Alt,
    Shift,
    Meta,
    Super,
    CommandOrControl,
}

/// A parsed accelerator: an ordered list of modifiers plus a canonical key
/// token. Use as an `out` argument to the parse functions; allocate with
/// `create_parsed_accelerator`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ParsedAccelerator {
    pub key: String,
    pub modifiers: Vec<ShortcutModifier>,
}

/// Why parsing an accelerator string failed. Mirrors the TS
/// `AcceleratorParseError['reason']` string union.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum AcceleratorParseErrorReason {
    Empty,
    MissingKey,
    UnknownModifier,
    UnknownKey,
    DuplicateModifier,
}

/// A diagnostic describing why an accelerator string could not be parsed, as
/// returned by `parse_accelerator_detailed`. `token` is the offending token
/// (or `""` when not applicable).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AcceleratorParseError {
    pub reason: AcceleratorParseErrorReason,
    pub token: String,
}

/// The payload fired for every global shortcut trigger.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShortcutEvent {
    pub accelerator: String,
}

/// The opt-in global shortcut signal group. `on_trigger` fires after each
/// registered shortcut's direct handler runs.
#[derive(Clone)]
pub struct ShortcutSignals {
    pub on_trigger: Signal<ShortcutEvent>,
}

/// The global OS hotkey backend seam. Free functions in `flighthq-shortcut`
/// delegate to the active backend. The web default returns sentinels for every
/// operation — a native host fulfills real global hotkeys.
pub trait ShortcutBackend: Send + Sync {
    /// Registers `accelerator` with a `handler` invoked (with a
    /// [`ShortcutEvent`]) when the OS triggers the chord. Returns `false` when
    /// unsupported (e.g. web) or on conflict.
    fn register(
        &self,
        accelerator: &str,
        handler: Box<dyn Fn(&ShortcutEvent) + Send + Sync>,
    ) -> bool;
    /// Unregisters a single accelerator. Returns `false` when not registered or
    /// unsupported.
    fn unregister(&self, accelerator: &str) -> bool;
    /// Unregisters every accelerator. No-op when unsupported.
    fn unregister_all(&self);
    /// Returns `true` when `accelerator` is currently registered.
    fn is_registered(&self, accelerator: &str) -> bool;
    /// Returns every currently registered accelerator (normalized form).
    fn get_registered(&self, out: &mut Vec<String>);
    /// Enables or disables a single registered accelerator without
    /// unregistering it. Returns `false` when not registered or unsupported.
    fn set_enabled(&self, accelerator: &str, enabled: bool) -> bool;
    /// Enables or disables all registered accelerators at once. No-op when
    /// unsupported.
    fn set_all_enabled(&self, enabled: bool);
}
