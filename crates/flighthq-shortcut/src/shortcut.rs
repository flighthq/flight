//! Shortcut free functions: accelerator parsing/normalization, display
//! formatting, and global hotkey registration over a swappable backend.

use flighthq_signals::{create_signal, emit_signal};
use flighthq_types::{
    Accelerator, AcceleratorParseError, AcceleratorParseErrorReason, ParsedAccelerator,
    ShortcutBackend, ShortcutEvent, ShortcutModifier, ShortcutSignals,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// True when two accelerator strings (in any accepted spelling) represent the
/// same chord. Returns `false` when either is unparseable.
pub fn are_accelerators_equal(a: &str, b: &str) -> bool {
    let na = normalize_accelerator(a);
    let nb = normalize_accelerator(b);
    match (na, nb) {
        (Some(na), Some(nb)) => na == nb,
        _ => false,
    }
}

/// Allocates a zeroed `ParsedAccelerator` for use as an `out` argument to
/// `parse_accelerator`.
pub fn create_parsed_accelerator() -> ParsedAccelerator {
    ParsedAccelerator {
        key: String::new(),
        modifiers: Vec::new(),
    }
}

/// Builds the default web backend. Web pages cannot register OS-level global
/// hotkeys; every operation returns a sentinel — register / unregister /
/// is_registered / set_enabled are false, get_registered yields nothing, and
/// unregister_all / set_all_enabled are no-ops.
pub fn create_web_shortcut_backend() -> Arc<dyn ShortcutBackend> {
    Arc::new(WebShortcutBackend)
}

/// Disables a registered global shortcut without unregistering it; the handler
/// is preserved and can be re-enabled later. Returns `false` when not
/// registered or unsupported.
pub fn disable_global_shortcut(accelerator: &str) -> bool {
    match normalize_accelerator(accelerator) {
        Some(normalized) => get_shortcut_backend().set_enabled(&normalized, false),
        None => false,
    }
}

/// Re-enables a previously disabled global shortcut. Returns `false` when not
/// registered or unsupported.
pub fn enable_global_shortcut(accelerator: &str) -> bool {
    match normalize_accelerator(accelerator) {
        Some(normalized) => get_shortcut_backend().set_enabled(&normalized, true),
        None => false,
    }
}

/// Opts in to the global shortcut signal group. Returns a [`ShortcutSignals`]
/// whose `on_trigger` is stable across calls (the same underlying signal). The
/// `on_trigger` signal fires for every global shortcut trigger with a
/// [`ShortcutEvent`] payload. Direct handlers registered with
/// `register_global_shortcut` are always called first; the signal fires after.
pub fn enable_global_shortcut_signals() -> ShortcutSignals {
    let mut guard = SIGNALS.lock().expect("shortcut signals mutex poisoned");
    if guard.is_none() {
        *guard = Some(ShortcutSignals {
            on_trigger: create_signal(),
        });
    }
    guard.as_ref().unwrap().clone()
}

/// Formats an accelerator string for human-readable display per the given OS.
///   macOS:         `⌘⇧K`  (symbols, no separator)
///   Windows/Linux: `Ctrl+Shift+K`  (text labels, `+` separator)
/// Returns `""` when `accelerator` is unparseable. Pass `platform` to override
/// OS detection (e.g. `"macos"`, `"windows"`, `"linux"`).
pub fn format_accelerator_for_display(accelerator: &str, platform: Option<&str>) -> String {
    let result = match parse_internal(accelerator) {
        Some(r) => r,
        None => return String::new(),
    };
    let is_mac = is_mac_os(platform);
    let mut parts: Vec<String> = Vec::new();
    for &modifier in &result.modifiers {
        let resolved = if modifier == ShortcutModifier::CommandOrControl {
            resolve_command_or_control_modifier(platform)
        } else {
            modifier
        };
        parts.push(modifier_label(resolved, is_mac));
    }
    parts.push(get_accelerator_key_label(&result.key));
    if is_mac {
        parts.concat()
    } else {
        parts.join("+")
    }
}

/// Returns the canonical key token from a parsed or normalized accelerator, or
/// `None` when unparseable.
pub fn get_accelerator_key(accelerator: &str) -> Option<String> {
    parse_internal(accelerator).map(|r| r.key)
}

/// Renders a key name label for display in menus and tooltips (e.g.
/// `"ArrowUp"` → `"↑"`, `"Return"` → `"↵"`). Returns the key as-is when no
/// special display name is registered.
pub fn get_accelerator_key_label(key: &str) -> String {
    match key_display_names().get(key) {
        Some(label) => (*label).to_string(),
        None => key.to_string(),
    }
}

/// Renders a modifier key label for the given OS (e.g. `Meta` → `⌘` on macOS,
/// `Win` on Windows). `CommandOrControl` is resolved before formatting. Returns
/// `""` for unrecognized modifiers. Pass `platform` to override OS detection.
pub fn get_accelerator_modifier_label(
    modifier: ShortcutModifier,
    platform: Option<&str>,
) -> String {
    let resolved = if modifier == ShortcutModifier::CommandOrControl {
        resolve_command_or_control_modifier(platform)
    } else {
        modifier
    };
    modifier_label(resolved, is_mac_os(platform))
}

/// Returns the modifier list from a parsed or normalized accelerator, written
/// into `out` (cleared and filled in place). Returns `false` (and leaves `out`
/// empty) when unparseable.
pub fn get_accelerator_modifiers(accelerator: &str, out: &mut Vec<ShortcutModifier>) -> bool {
    out.clear();
    match parse_internal(accelerator) {
        Some(result) => {
            out.extend_from_slice(&result.modifiers);
            true
        }
        None => false,
    }
}

/// Returns all currently registered accelerators in normalized form, written
/// into `out` (cleared and filled in place). Empty on the web backend.
pub fn get_registered_global_shortcuts(out: &mut Vec<Accelerator>) {
    out.clear();
    get_shortcut_backend().get_registered(out);
}

/// Returns the active shortcut backend, falling back to a lazily-created web
/// default. There is always a backend.
pub fn get_shortcut_backend() -> Arc<dyn ShortcutBackend> {
    let mut guard = BACKEND.lock().expect("shortcut backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_web_shortcut_backend());
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// True when the (normalized) chord is already registered. A conflict probe
/// over `is_global_shortcut_registered`. Returns `false` when `accelerator` is
/// unparseable.
pub fn has_global_shortcut_conflict(accelerator: &str) -> bool {
    match normalize_accelerator(accelerator) {
        Some(normalized) => is_global_shortcut_registered(&normalized),
        None => false,
    }
}

/// True when `input` is a parseable accelerator (valid modifiers + recognized
/// key).
pub fn is_accelerator_valid(input: &str) -> bool {
    parse_internal(input).is_some()
}

/// True when the accelerator is currently registered. Returns `false` on web
/// (no global hotkeys). Input is normalized before the query so any accepted
/// spelling matches.
pub fn is_global_shortcut_registered(accelerator: &str) -> bool {
    match normalize_accelerator(accelerator) {
        Some(normalized) => get_shortcut_backend().is_registered(&normalized),
        None => false,
    }
}

/// Returns the canonical normalized form of `input` (fixed modifier order,
/// canonical key name), or `None` when unparseable. Two normalized strings that
/// compare equal represent the same chord. Accepted spellings:
/// Ctrl/Control, Cmd/Command/Meta, Alt/Option, Win/Super, Shift; separators
/// `+` or `-`.
pub fn normalize_accelerator(input: &str) -> Option<Accelerator> {
    parse_internal(input).map(|r| format_normalized(&r))
}

/// Parses `input` into modifiers + key and writes into `out`. Returns `true`
/// on success, `false` (leaving `out` unchanged) on malformed input. Case- and
/// separator-insensitive; alias modifiers are resolved. Use
/// `create_parsed_accelerator` to allocate the `out`.
pub fn parse_accelerator(input: &str, out: &mut ParsedAccelerator) -> bool {
    match parse_internal(input) {
        Some(result) => {
            // Read into locals before writing `out` for alias safety, even
            // though `input: &str` cannot alias the owned `out` here.
            let key = result.key;
            let modifiers = result.modifiers;
            out.key = key;
            out.modifiers = modifiers;
            true
        }
        None => false,
    }
}

/// Like `parse_accelerator` but returns an [`AcceleratorParseError`] describing
/// why parsing failed instead of `Err(())`. On success writes into `out` and
/// returns `Ok(())`.
pub fn parse_accelerator_detailed(
    input: &str,
    out: &mut ParsedAccelerator,
) -> Result<(), AcceleratorParseError> {
    match parse_detailed(input) {
        Ok(result) => {
            let key = result.key;
            let modifiers = result.modifiers;
            out.key = key;
            out.modifiers = modifiers;
            Ok(())
        }
        Err(error) => Err(error),
    }
}

/// Registers a global hotkey. Returns `false` when the host lacks global-hotkey
/// support (e.g. web) or `accelerator` is unparseable. Input is normalized
/// before registration so any accepted spelling maps to the same registry slot.
/// When `enable_global_shortcut_signals` has been called, the `on_trigger`
/// signal fires after the handler.
pub fn register_global_shortcut(
    accelerator: &str,
    handler: Box<dyn Fn(&ShortcutEvent) + Send + Sync>,
) -> bool {
    let normalized = match normalize_accelerator(accelerator) {
        Some(n) => n,
        None => return false,
    };
    let wrapped: Box<dyn Fn(&ShortcutEvent) + Send + Sync> = Box::new(move |event| {
        handler(event);
        // Read the signal group lazily at trigger time so signals enabled after
        // registration still fire (matching the TS `_signals !== null` check).
        if let Some(signals) = current_shortcut_signals() {
            emit_signal(&signals.on_trigger, event);
        }
    });
    get_shortcut_backend().register(&normalized, wrapped)
}

/// Resolves `CommandOrControl` to `Meta` on macOS and `Control` on
/// Windows/Linux. Pass `platform` to override OS detection.
pub fn resolve_command_or_control_modifier(platform: Option<&str>) -> ShortcutModifier {
    if is_mac_os(platform) {
        ShortcutModifier::Meta
    } else {
        ShortcutModifier::Control
    }
}

/// Resumes all global shortcuts after `suspend_all_global_shortcuts`. No-op on
/// unsupported hosts.
pub fn resume_all_global_shortcuts() {
    get_shortcut_backend().set_all_enabled(true);
}

/// Installs a native host shortcut backend; pass `None` to fall back to the web
/// default.
pub fn set_shortcut_backend(backend: Option<Arc<dyn ShortcutBackend>>) {
    let mut guard = BACKEND.lock().expect("shortcut backend mutex poisoned");
    *guard = backend;
}

/// Temporarily silences all registered global shortcuts without unregistering
/// them — useful when a modal or text field has focus. Resume with
/// `resume_all_global_shortcuts`. No-op on unsupported hosts.
pub fn suspend_all_global_shortcuts() {
    get_shortcut_backend().set_all_enabled(false);
}

/// Unregisters every global hotkey. No-op when the host lacks global-hotkey
/// support.
pub fn unregister_all_global_shortcuts() {
    get_shortcut_backend().unregister_all();
}

/// Unregisters a global hotkey. Returns `false` when not registered or
/// unsupported (e.g. web). Input is normalized before the lookup.
pub fn unregister_global_shortcut(accelerator: &str) -> bool {
    match normalize_accelerator(accelerator) {
        Some(normalized) => get_shortcut_backend().unregister(&normalized),
        None => false,
    }
}

/// Default web backend. Web pages cannot register OS-level global hotkeys, so
/// every operation returns a sentinel. A native host (Electron's
/// `globalShortcut`, Tauri) is required to fulfill global shortcuts.
pub struct WebShortcutBackend;

impl ShortcutBackend for WebShortcutBackend {
    fn register(
        &self,
        _accelerator: &str,
        _handler: Box<dyn Fn(&ShortcutEvent) + Send + Sync>,
    ) -> bool {
        false
    }
    fn unregister(&self, _accelerator: &str) -> bool {
        false
    }
    fn unregister_all(&self) {}
    fn is_registered(&self, _accelerator: &str) -> bool {
        false
    }
    fn get_registered(&self, _out: &mut Vec<String>) {
        // No-op: web has no global-hotkey registry.
    }
    fn set_enabled(&self, _accelerator: &str, _enabled: bool) -> bool {
        false
    }
    fn set_all_enabled(&self, _enabled: bool) {}
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn ShortcutBackend>>> = Mutex::new(None);
static SIGNALS: Mutex<Option<ShortcutSignals>> = Mutex::new(None);

// Returns a clone of the on_trigger signal group if it has been enabled.
fn current_shortcut_signals() -> Option<ShortcutSignals> {
    SIGNALS
        .lock()
        .expect("shortcut signals mutex poisoned")
        .clone()
}

// Canonical modifier order used in normalized form: Control < Alt < Shift <
// Meta < Super. CommandOrControl ranks alongside Control.
fn modifier_rank(modifier: ShortcutModifier) -> usize {
    match modifier {
        ShortcutModifier::Control | ShortcutModifier::CommandOrControl => 0,
        ShortcutModifier::Alt => 1,
        ShortcutModifier::Shift => 2,
        ShortcutModifier::Meta => 3,
        ShortcutModifier::Super => 4,
    }
}

// Canonical PascalCase token used in the normalized accelerator string.
fn modifier_token(modifier: ShortcutModifier) -> &'static str {
    match modifier {
        ShortcutModifier::Control => "Control",
        ShortcutModifier::Alt => "Alt",
        ShortcutModifier::Shift => "Shift",
        ShortcutModifier::Meta => "Meta",
        ShortcutModifier::Super => "Super",
        ShortcutModifier::CommandOrControl => "CommandOrControl",
    }
}

// Platform-specific label for an already-resolved (non-CommandOrControl)
// modifier. Returns "" for CommandOrControl (callers must resolve it first).
fn modifier_label(resolved: ShortcutModifier, is_mac: bool) -> String {
    match resolved {
        ShortcutModifier::Alt => {
            if is_mac {
                "⌥"
            } else {
                "Alt"
            }
        }
        ShortcutModifier::Control => {
            if is_mac {
                "⌃"
            } else {
                "Ctrl"
            }
        }
        ShortcutModifier::Meta => {
            if is_mac {
                "⌘"
            } else {
                "Win"
            }
        }
        ShortcutModifier::Shift => {
            if is_mac {
                "⇧"
            } else {
                "Shift"
            }
        }
        ShortcutModifier::Super => {
            if is_mac {
                "⌘"
            } else {
                "Super"
            }
        }
        ShortcutModifier::CommandOrControl => "",
    }
    .to_string()
}

// Returns true when running on the macOS platform. The override is a platform
// string (e.g. "macos", "windows"); native hosts have no `navigator.platform`,
// so without an override this returns false.
fn is_mac_os(platform: Option<&str>) -> bool {
    match platform {
        Some(p) => {
            let lower = p.to_ascii_lowercase();
            lower.starts_with("mac")
        }
        None => false,
    }
}

struct Parsed {
    key: String,
    modifiers: Vec<ShortcutModifier>,
}

// Core parser. Returns the parsed chord on success or None on failure.
fn parse_internal(input: &str) -> Option<Parsed> {
    parse_detailed(input).ok()
}

// Core parser with error diagnostics.
fn parse_detailed(input: &str) -> Result<Parsed, AcceleratorParseError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AcceleratorParseError {
            reason: AcceleratorParseErrorReason::Empty,
            token: String::new(),
        });
    }

    let tokens = split_tokens(trimmed);
    if tokens.is_empty() {
        return Err(AcceleratorParseError {
            reason: AcceleratorParseErrorReason::Empty,
            token: String::new(),
        });
    }

    let mut modifiers: Vec<ShortcutModifier> = Vec::new();
    let mut seen: Vec<ShortcutModifier> = Vec::new();
    let mut key: Option<String> = None;

    for token in &tokens {
        let lower = token.to_ascii_lowercase();
        if let Some(&modifier) = modifier_aliases().get(lower.as_str()) {
            if seen.contains(&modifier) {
                return Err(AcceleratorParseError {
                    reason: AcceleratorParseErrorReason::DuplicateModifier,
                    token: (*token).to_string(),
                });
            }
            seen.push(modifier);
            modifiers.push(modifier);
        } else {
            // Could be the key. If we already have a key, the earlier one was
            // an unknown modifier token.
            if let Some(existing_key) = key {
                return Err(AcceleratorParseError {
                    reason: AcceleratorParseErrorReason::UnknownModifier,
                    token: existing_key,
                });
            }
            key = Some((*token).to_string());
        }
    }

    let key = match key {
        Some(k) => k,
        None => {
            return Err(AcceleratorParseError {
                reason: AcceleratorParseErrorReason::MissingKey,
                token: String::new(),
            });
        }
    };

    let canonical_key = match key_aliases().get(key.to_ascii_lowercase().as_str()) {
        Some(&c) => c.to_string(),
        None => {
            return Err(AcceleratorParseError {
                reason: AcceleratorParseErrorReason::UnknownKey,
                token: key,
            });
        }
    };

    // Sort modifiers in canonical order (stable, matching the JS sort by rank).
    modifiers.sort_by_key(|&m| modifier_rank(m));

    Ok(Parsed {
        key: canonical_key,
        modifiers,
    })
}

// Splits input into tokens using '+' or '-' as separator, dropping empties.
fn split_tokens(input: &str) -> Vec<&str> {
    input.split(['+', '-']).filter(|t| !t.is_empty()).collect()
}

// Builds the normalized Accelerator string from a parsed result.
fn format_normalized(parsed: &Parsed) -> Accelerator {
    if parsed.modifiers.is_empty() {
        return parsed.key.clone();
    }
    let mut parts: Vec<&str> = parsed
        .modifiers
        .iter()
        .map(|&m| modifier_token(m))
        .collect();
    parts.push(&parsed.key);
    parts.join("+")
}

// Alias map: lowercase alias → canonical ShortcutModifier.
fn modifier_aliases() -> &'static HashMap<&'static str, ShortcutModifier> {
    static MAP: OnceLock<HashMap<&'static str, ShortcutModifier>> = OnceLock::new();
    MAP.get_or_init(|| {
        use ShortcutModifier::*;
        HashMap::from([
            ("alt", Alt),
            ("cmd", Meta),
            ("command", Meta),
            ("commandorcontrol", CommandOrControl),
            ("control", Control),
            ("ctrl", Control),
            ("meta", Meta),
            ("option", Alt),
            ("shift", Shift),
            ("super", Super),
            ("win", Super),
        ])
    })
}

// Human-readable display names for special keys; absent entries use the key
// name itself.
fn key_display_names() -> &'static HashMap<&'static str, &'static str> {
    static MAP: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| {
        HashMap::from([
            ("ArrowDown", "↓"),
            ("ArrowLeft", "←"),
            ("ArrowRight", "→"),
            ("ArrowUp", "↑"),
            ("Backspace", "⌫"),
            ("CapsLock", "⇪"),
            ("Delete", "⌦"),
            ("End", "End"),
            ("Enter", "↵"),
            ("Escape", "Esc"),
            ("Home", "Home"),
            ("Insert", "Ins"),
            ("MediaNextTrack", "⏭"),
            ("MediaPlayPause", "⏯"),
            ("MediaPreviousTrack", "⏮"),
            ("MediaStop", "⏹"),
            ("NumLock", "NumLk"),
            ("PageDown", "PgDn"),
            ("PageUp", "PgUp"),
            ("PrintScreen", "PrtSc"),
            ("Return", "↵"),
            ("ScrollLock", "ScrLk"),
            ("Space", "Space"),
            ("Tab", "⇥"),
            ("VolumeDown", "🔉"),
            ("VolumeMute", "🔇"),
            ("VolumeUp", "🔊"),
        ])
    })
}

// Alias map: lowercase alias → canonical ShortcutKeyName (and other accepted
// key names).
fn key_aliases() -> &'static HashMap<&'static str, &'static str> {
    static MAP: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| {
        HashMap::from([
            // Letters (uppercase canonical form)
            ("a", "A"),
            ("b", "B"),
            ("c", "C"),
            ("d", "D"),
            ("e", "E"),
            ("f", "F"),
            ("g", "G"),
            ("h", "H"),
            ("i", "I"),
            ("j", "J"),
            ("k", "K"),
            ("l", "L"),
            ("m", "M"),
            ("n", "N"),
            ("o", "O"),
            ("p", "P"),
            ("q", "Q"),
            ("r", "R"),
            ("s", "S"),
            ("t", "T"),
            ("u", "U"),
            ("v", "V"),
            ("w", "W"),
            ("x", "X"),
            ("y", "Y"),
            ("z", "Z"),
            // Digits
            ("0", "0"),
            ("1", "1"),
            ("2", "2"),
            ("3", "3"),
            ("4", "4"),
            ("5", "5"),
            ("6", "6"),
            ("7", "7"),
            ("8", "8"),
            ("9", "9"),
            // Function keys
            ("f1", "F1"),
            ("f2", "F2"),
            ("f3", "F3"),
            ("f4", "F4"),
            ("f5", "F5"),
            ("f6", "F6"),
            ("f7", "F7"),
            ("f8", "F8"),
            ("f9", "F9"),
            ("f10", "F10"),
            ("f11", "F11"),
            ("f12", "F12"),
            ("f13", "F13"),
            ("f14", "F14"),
            ("f15", "F15"),
            ("f16", "F16"),
            ("f17", "F17"),
            ("f18", "F18"),
            ("f19", "F19"),
            ("f20", "F20"),
            ("f21", "F21"),
            ("f22", "F22"),
            ("f23", "F23"),
            ("f24", "F24"),
            // Arrows
            ("arrowdown", "ArrowDown"),
            ("arrowleft", "ArrowLeft"),
            ("arrowright", "ArrowRight"),
            ("arrowup", "ArrowUp"),
            ("down", "ArrowDown"),
            ("left", "ArrowLeft"),
            ("right", "ArrowRight"),
            ("up", "ArrowUp"),
            // Navigation
            ("end", "End"),
            ("home", "Home"),
            ("pagedown", "PageDown"),
            ("pageup", "PageUp"),
            ("pgdn", "PageDown"),
            ("pgup", "PageUp"),
            // Editing
            ("backspace", "Backspace"),
            ("delete", "Delete"),
            ("del", "Delete"),
            ("escape", "Escape"),
            ("esc", "Escape"),
            ("enter", "Return"),
            ("return", "Return"),
            ("insert", "Insert"),
            ("ins", "Insert"),
            ("space", "Space"),
            ("spacebar", "Space"),
            (" ", "Space"),
            ("tab", "Tab"),
            // Numpad
            ("num0", "Numpad0"),
            ("num1", "Numpad1"),
            ("num2", "Numpad2"),
            ("num3", "Numpad3"),
            ("num4", "Numpad4"),
            ("num5", "Numpad5"),
            ("num6", "Numpad6"),
            ("num7", "Numpad7"),
            ("num8", "Numpad8"),
            ("num9", "Numpad9"),
            ("numpad0", "Numpad0"),
            ("numpad1", "Numpad1"),
            ("numpad2", "Numpad2"),
            ("numpad3", "Numpad3"),
            ("numpad4", "Numpad4"),
            ("numpad5", "Numpad5"),
            ("numpad6", "Numpad6"),
            ("numpad7", "Numpad7"),
            ("numpad8", "Numpad8"),
            ("numpad9", "Numpad9"),
            ("numpadadd", "NumpadAdd"),
            ("numpaddecimal", "NumpadDecimal"),
            ("numpaddivide", "NumpadDivide"),
            ("numpadenter", "NumpadEnter"),
            ("numpadmultiply", "NumpadMultiply"),
            ("numpadsubtract", "NumpadSubtract"),
            // Punctuation / symbols
            ("'", "Quote"),
            (",", "Comma"),
            ("-", "Minus"),
            (".", "Period"),
            ("/", "Slash"),
            (";", "Semicolon"),
            ("=", "Equal"),
            ("[", "BracketLeft"),
            ("\\", "Backslash"),
            ("]", "BracketRight"),
            ("`", "Backquote"),
            ("backquote", "Backquote"),
            ("backslash", "Backslash"),
            ("bracketleft", "BracketLeft"),
            ("bracketright", "BracketRight"),
            ("comma", "Comma"),
            ("equal", "Equal"),
            ("minus", "Minus"),
            ("period", "Period"),
            ("plus", "Plus"),
            ("quote", "Quote"),
            ("semicolon", "Semicolon"),
            ("slash", "Slash"),
            // Media
            ("medianexttrack", "MediaNextTrack"),
            ("mediaplaypause", "MediaPlayPause"),
            ("mediaprevioustrack", "MediaPreviousTrack"),
            ("mediastop", "MediaStop"),
            ("volumedown", "VolumeDown"),
            ("volumemute", "VolumeMute"),
            ("volumeup", "VolumeUp"),
            // Lock / utility
            ("capslock", "CapsLock"),
            ("numlock", "NumLock"),
            ("print", "PrintScreen"),
            ("printscreen", "PrintScreen"),
            ("scrolllock", "ScrollLock"),
        ])
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::{clear_signal, connect_signal};
    use serial_test::serial;
    use std::sync::Arc as StdArc;

    // A full-featured fake backend for testing. Interior mutability so the
    // shared `Arc<dyn ShortcutBackend>` can record registrations.
    #[derive(Default)]
    struct FakeState {
        entries: Vec<FakeEntry>,
        all_enabled: bool,
    }

    struct FakeEntry {
        accelerator: String,
        handler: Box<dyn Fn(&ShortcutEvent) + Send + Sync>,
        enabled: bool,
    }

    struct FakeBackend {
        state: Mutex<FakeState>,
    }

    impl FakeBackend {
        fn new() -> StdArc<FakeBackend> {
            StdArc::new(FakeBackend {
                state: Mutex::new(FakeState {
                    entries: Vec::new(),
                    all_enabled: true,
                }),
            })
        }

        fn entry_enabled(&self, accelerator: &str) -> Option<bool> {
            let state = self.state.lock().unwrap();
            state
                .entries
                .iter()
                .find(|e| e.accelerator == accelerator)
                .map(|e| e.enabled)
        }

        fn len(&self) -> usize {
            self.state.lock().unwrap().entries.len()
        }

        fn all_enabled(&self) -> bool {
            self.state.lock().unwrap().all_enabled
        }

        fn trigger(&self, accelerator: &str) {
            let state = self.state.lock().unwrap();
            if let Some(entry) = state.entries.iter().find(|e| e.accelerator == accelerator) {
                (entry.handler)(&ShortcutEvent {
                    accelerator: accelerator.to_string(),
                });
            }
        }
    }

    impl ShortcutBackend for FakeBackend {
        fn register(
            &self,
            accelerator: &str,
            handler: Box<dyn Fn(&ShortcutEvent) + Send + Sync>,
        ) -> bool {
            let mut state = self.state.lock().unwrap();
            state.entries.push(FakeEntry {
                accelerator: accelerator.to_string(),
                handler,
                enabled: true,
            });
            true
        }
        fn unregister(&self, accelerator: &str) -> bool {
            let mut state = self.state.lock().unwrap();
            let before = state.entries.len();
            state.entries.retain(|e| e.accelerator != accelerator);
            state.entries.len() != before
        }
        fn unregister_all(&self) {
            self.state.lock().unwrap().entries.clear();
        }
        fn is_registered(&self, accelerator: &str) -> bool {
            self.state
                .lock()
                .unwrap()
                .entries
                .iter()
                .any(|e| e.accelerator == accelerator)
        }
        fn get_registered(&self, out: &mut Vec<String>) {
            let state = self.state.lock().unwrap();
            for entry in &state.entries {
                out.push(entry.accelerator.clone());
            }
        }
        fn set_enabled(&self, accelerator: &str, enabled: bool) -> bool {
            let mut state = self.state.lock().unwrap();
            match state
                .entries
                .iter_mut()
                .find(|e| e.accelerator == accelerator)
            {
                Some(entry) => {
                    entry.enabled = enabled;
                    true
                }
                None => false,
            }
        }
        fn set_all_enabled(&self, enabled: bool) {
            let mut state = self.state.lock().unwrap();
            state.all_enabled = enabled;
            for entry in &mut state.entries {
                entry.enabled = enabled;
            }
        }
    }

    // Resets cross-test global state. Mirrors the TS afterEach.
    fn reset() {
        set_shortcut_backend(None);
        let signals = enable_global_shortcut_signals();
        clear_signal(&signals.on_trigger);
    }

    fn install_fake() -> StdArc<FakeBackend> {
        let backend = FakeBackend::new();
        set_shortcut_backend(Some(backend.clone() as Arc<dyn ShortcutBackend>));
        backend
    }

    // are_accelerators_equal
    #[test]
    #[serial]
    fn are_accelerators_equal_matches_spellings_and_order() {
        reset();
        assert!(are_accelerators_equal("Ctrl+K", "Control+K"));
        assert!(are_accelerators_equal("Cmd+Shift+S", "Meta+Shift+S"));
        assert!(are_accelerators_equal("ctrl+shift+k", "Control+Shift+K"));
        assert!(are_accelerators_equal("Shift+Ctrl+K", "Control+Shift+K"));
        assert!(are_accelerators_equal(
            "Alt+Shift+Control+K",
            "Ctrl+Shift+Alt+K"
        ));

        assert!(!are_accelerators_equal("Ctrl+K", "Ctrl+S"));
        assert!(!are_accelerators_equal("Ctrl+K", "Alt+K"));
        assert!(!are_accelerators_equal("", "Ctrl+K"));
        assert!(!are_accelerators_equal("Ctrl+K", "bad###key"));
        assert!(!are_accelerators_equal("", ""));
    }

    // create_parsed_accelerator
    #[test]
    #[serial]
    fn create_parsed_accelerator_returns_zeroed() {
        let out = create_parsed_accelerator();
        assert_eq!(out.key, "");
        assert_eq!(out.modifiers, Vec::<ShortcutModifier>::new());
    }

    // create_web_shortcut_backend
    #[test]
    #[serial]
    fn create_web_shortcut_backend_returns_sentinels() {
        let backend = create_web_shortcut_backend();
        assert!(!backend.register("Control+K", Box::new(|_| {})));
        assert!(!backend.unregister("Control+K"));
        assert!(!backend.is_registered("Control+K"));
        assert!(!backend.set_enabled("Control+K", false));
        let mut out: Vec<String> = Vec::new();
        backend.get_registered(&mut out);
        assert!(out.is_empty());
        backend.unregister_all();
        backend.set_all_enabled(false);
    }

    // disable_global_shortcut
    #[test]
    #[serial]
    fn disable_global_shortcut_disables_without_unregistering() {
        reset();
        let backend = install_fake();
        register_global_shortcut("Control+K", Box::new(|_| {}));
        assert!(disable_global_shortcut("Control+K"));
        assert_eq!(backend.entry_enabled("Control+K"), Some(false));
        assert!(is_global_shortcut_registered("Control+K"));

        // Alias spelling.
        assert!(disable_global_shortcut("control+k"));
        reset();
        // Web backend.
        assert!(!disable_global_shortcut("Control+K"));
        // Unparseable.
        let _b = install_fake();
        assert!(!disable_global_shortcut(""));
        reset();
    }

    // enable_global_shortcut
    #[test]
    #[serial]
    fn enable_global_shortcut_re_enables() {
        reset();
        let backend = install_fake();
        register_global_shortcut("Control+K", Box::new(|_| {}));
        disable_global_shortcut("Control+K");
        assert!(enable_global_shortcut("Control+K"));
        assert_eq!(backend.entry_enabled("Control+K"), Some(true));
        assert!(!enable_global_shortcut(""));
        reset();
        assert!(!enable_global_shortcut("Control+K"));
        reset();
    }

    // enable_global_shortcut_signals
    #[test]
    #[serial]
    fn enable_global_shortcut_signals_fires_after_handler() {
        reset();
        let backend = install_fake();
        let signals = enable_global_shortcut_signals();

        let order: StdArc<Mutex<Vec<String>>> = StdArc::new(Mutex::new(Vec::new()));
        let order_signal = order.clone();
        // Keep the guard alive: dropping it would disconnect the slot.
        let _guard = connect_signal(
            &signals.on_trigger,
            StdArc::new(move |_event: &ShortcutEvent| {
                order_signal.lock().unwrap().push("signal".to_string());
            }),
            Default::default(),
        );
        let order_handler = order.clone();
        register_global_shortcut(
            "Control+K",
            Box::new(move |_| {
                order_handler.lock().unwrap().push("handler".to_string());
            }),
        );
        backend.trigger("Control+K");
        assert_eq!(
            *order.lock().unwrap(),
            vec!["handler".to_string(), "signal".to_string()]
        );
        reset();
    }

    #[test]
    #[serial]
    fn enable_global_shortcut_signals_fires_with_accelerator_payload() {
        reset();
        let backend = install_fake();
        let signals = enable_global_shortcut_signals();
        let received: StdArc<Mutex<Vec<String>>> = StdArc::new(Mutex::new(Vec::new()));
        let received_clone = received.clone();
        let _guard = connect_signal(
            &signals.on_trigger,
            StdArc::new(move |event: &ShortcutEvent| {
                received_clone
                    .lock()
                    .unwrap()
                    .push(event.accelerator.clone());
            }),
            Default::default(),
        );
        register_global_shortcut("Control+K", Box::new(|_| {}));
        backend.trigger("Control+K");
        assert_eq!(*received.lock().unwrap(), vec!["Control+K".to_string()]);
        reset();
    }

    #[test]
    #[serial]
    fn enable_global_shortcut_signals_does_not_fire_for_unparseable() {
        reset();
        let backend = install_fake();
        let signals = enable_global_shortcut_signals();
        let received: StdArc<Mutex<Vec<String>>> = StdArc::new(Mutex::new(Vec::new()));
        let received_clone = received.clone();
        let _guard = connect_signal(
            &signals.on_trigger,
            StdArc::new(move |event: &ShortcutEvent| {
                received_clone
                    .lock()
                    .unwrap()
                    .push(event.accelerator.clone());
            }),
            Default::default(),
        );
        register_global_shortcut("", Box::new(|_| {}));
        assert_eq!(received.lock().unwrap().len(), 0);
        assert_eq!(backend.len(), 0);
        reset();
    }

    // format_accelerator_for_display
    #[test]
    #[serial]
    fn format_accelerator_for_display_formats_per_platform() {
        assert!(!format_accelerator_for_display("Control+Shift+K", None).is_empty());
        assert_eq!(format_accelerator_for_display("", None), "");
        assert_eq!(format_accelerator_for_display("bad###key", None), "");
        assert_eq!(format_accelerator_for_display("F5", None), "F5");
        assert!(format_accelerator_for_display("Control+K", None).contains('K'));
        assert_eq!(
            format_accelerator_for_display("Control+Shift+K", Some("macos")),
            "⌃⇧K"
        );
        assert_eq!(
            format_accelerator_for_display("Control+Shift+K", Some("windows")),
            "Ctrl+Shift+K"
        );
        assert_eq!(
            format_accelerator_for_display("Control+Shift+K", Some("linux")),
            "Ctrl+Shift+K"
        );
        assert_eq!(
            format_accelerator_for_display("CommandOrControl+K", Some("macos")),
            "⌘K"
        );
        assert_eq!(
            format_accelerator_for_display("CommandOrControl+K", Some("windows")),
            "Ctrl+K"
        );
    }

    // get_accelerator_key
    #[test]
    #[serial]
    fn get_accelerator_key_returns_canonical_or_none() {
        assert_eq!(get_accelerator_key("Control+K").as_deref(), Some("K"));
        assert_eq!(get_accelerator_key("Shift+F1").as_deref(), Some("F1"));
        assert_eq!(
            get_accelerator_key("Ctrl+shift+arrowup").as_deref(),
            Some("ArrowUp")
        );
        assert_eq!(get_accelerator_key("Escape").as_deref(), Some("Escape"));
        assert_eq!(get_accelerator_key(""), None);
        assert_eq!(get_accelerator_key("Control+"), None);
        assert_eq!(get_accelerator_key("Control+InvalidKey123"), None);
        assert_eq!(get_accelerator_key("Ctrl+Esc").as_deref(), Some("Escape"));
        assert_eq!(get_accelerator_key("Cmd+Del").as_deref(), Some("Delete"));
        assert_eq!(get_accelerator_key("Alt+Enter").as_deref(), Some("Return"));
    }

    // get_accelerator_key_label
    #[test]
    #[serial]
    fn get_accelerator_key_label_returns_symbols_or_as_is() {
        assert_eq!(get_accelerator_key_label("ArrowUp"), "↑");
        assert_eq!(get_accelerator_key_label("ArrowDown"), "↓");
        assert_eq!(get_accelerator_key_label("Return"), "↵");
        assert_eq!(get_accelerator_key_label("Escape"), "Esc");
        assert_eq!(get_accelerator_key_label("Tab"), "⇥");
        assert_eq!(get_accelerator_key_label("Backspace"), "⌫");
        assert_eq!(get_accelerator_key_label("K"), "K");
        assert_eq!(get_accelerator_key_label("F1"), "F1");
        assert_eq!(get_accelerator_key_label("Space"), "Space");
    }

    // get_accelerator_modifier_label
    #[test]
    #[serial]
    fn get_accelerator_modifier_label_per_platform() {
        for m in [
            ShortcutModifier::Alt,
            ShortcutModifier::Control,
            ShortcutModifier::Meta,
            ShortcutModifier::Shift,
            ShortcutModifier::Super,
            ShortcutModifier::CommandOrControl,
        ] {
            assert!(!get_accelerator_modifier_label(m, None).is_empty());
        }
        assert_ne!(
            get_accelerator_modifier_label(ShortcutModifier::CommandOrControl, None),
            ""
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Control, Some("macos")),
            "⌃"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Alt, Some("macos")),
            "⌥"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Shift, Some("macos")),
            "⇧"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Meta, Some("macos")),
            "⌘"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Control, Some("windows")),
            "Ctrl"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Alt, Some("linux")),
            "Alt"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Shift, Some("windows")),
            "Shift"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Meta, Some("linux")),
            "Win"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::CommandOrControl, Some("macos")),
            "⌘"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::CommandOrControl, Some("windows")),
            "Ctrl"
        );
    }

    // get_accelerator_modifiers
    #[test]
    #[serial]
    fn get_accelerator_modifiers_fills_out() {
        let mut out: Vec<ShortcutModifier> = Vec::new();
        assert!(get_accelerator_modifiers("Shift+Control+K", &mut out));
        assert_eq!(
            out,
            vec![ShortcutModifier::Control, ShortcutModifier::Shift]
        );

        let mut out2: Vec<ShortcutModifier> = vec![ShortcutModifier::Meta];
        assert!(get_accelerator_modifiers("Alt+K", &mut out2));
        assert_eq!(out2, vec![ShortcutModifier::Alt]);

        let mut out3: Vec<ShortcutModifier> = Vec::new();
        assert!(!get_accelerator_modifiers("", &mut out3));
        assert!(out3.is_empty());

        let mut out4: Vec<ShortcutModifier> = Vec::new();
        assert!(get_accelerator_modifiers("F5", &mut out4));
        assert!(out4.is_empty());
    }

    // get_registered_global_shortcuts
    #[test]
    #[serial]
    fn get_registered_global_shortcuts_lists_normalized() {
        reset();
        let mut out: Vec<Accelerator> = Vec::new();
        get_registered_global_shortcuts(&mut out);
        assert!(out.is_empty());

        let _backend = install_fake();
        register_global_shortcut("Control+K", Box::new(|_| {}));
        register_global_shortcut("Meta+Shift+S", Box::new(|_| {}));
        let mut registered: Vec<Accelerator> = Vec::new();
        get_registered_global_shortcuts(&mut registered);
        assert!(registered.contains(&"Control+K".to_string()));
        assert!(registered.contains(&"Shift+Meta+S".to_string()));
        assert_eq!(registered.len(), 2);
        reset();
    }

    // get_shortcut_backend
    #[test]
    #[serial]
    fn get_shortcut_backend_falls_back_and_returns_registered() {
        reset();
        // Falls back to web; must not panic.
        let _b = get_shortcut_backend();
        let backend = install_fake();
        // Same underlying object: register through the returned backend reflects.
        get_shortcut_backend().register("Control+K", Box::new(|_| {}));
        assert!(backend.is_registered("Control+K"));
        reset();
    }

    // has_global_shortcut_conflict
    #[test]
    #[serial]
    fn has_global_shortcut_conflict_detects_existing() {
        reset();
        let _backend = install_fake();
        register_global_shortcut("Control+K", Box::new(|_| {}));
        assert!(has_global_shortcut_conflict("Control+K"));
        assert!(has_global_shortcut_conflict("ctrl+k"));
        assert!(!has_global_shortcut_conflict("Alt+K"));
        assert!(!has_global_shortcut_conflict(""));
        assert!(!has_global_shortcut_conflict("bad###key"));
        reset();
    }

    // is_accelerator_valid
    #[test]
    #[serial]
    fn is_accelerator_valid_checks_form() {
        assert!(is_accelerator_valid("Control+K"));
        assert!(is_accelerator_valid("Meta+Shift+S"));
        assert!(is_accelerator_valid("F5"));
        assert!(is_accelerator_valid("Escape"));
        assert!(is_accelerator_valid("ctrl+shift+k"));
        assert!(is_accelerator_valid("CommandOrControl+Q"));

        assert!(!is_accelerator_valid(""));
        assert!(!is_accelerator_valid("Control+"));
        assert!(!is_accelerator_valid("UnknownMod+K"));
        assert!(!is_accelerator_valid("Control+InvalidKey999"));

        for key in [
            "A",
            "Z",
            "0",
            "9",
            "F1",
            "F12",
            "F24",
            "Space",
            "Tab",
            "Return",
            "ArrowUp",
            "Home",
            "End",
            "PageDown",
            "Numpad0",
            "MediaPlayPause",
            "CapsLock",
        ] {
            assert!(is_accelerator_valid(key), "{key} should be valid");
        }
    }

    // is_global_shortcut_registered
    #[test]
    #[serial]
    fn is_global_shortcut_registered_reflects_backend() {
        reset();
        let _backend = install_fake();
        assert!(!is_global_shortcut_registered("Control+S"));
        register_global_shortcut("Control+S", Box::new(|_| {}));
        assert!(is_global_shortcut_registered("Control+S"));
        assert!(is_global_shortcut_registered("ctrl+s"));
        assert!(!is_global_shortcut_registered(""));
        reset();
        assert!(!is_global_shortcut_registered("Control+S"));
        reset();
    }

    // normalize_accelerator
    #[test]
    #[serial]
    fn normalize_accelerator_canonicalizes() {
        assert_eq!(
            normalize_accelerator("Control+K").as_deref(),
            Some("Control+K")
        );
        assert_eq!(
            normalize_accelerator("Meta+Shift+S").as_deref(),
            Some("Shift+Meta+S")
        );
        assert_eq!(normalize_accelerator("F5").as_deref(), Some("F5"));

        assert_eq!(
            normalize_accelerator("Ctrl+K").as_deref(),
            Some("Control+K")
        );
        assert_eq!(normalize_accelerator("Cmd+K").as_deref(), Some("Meta+K"));
        assert_eq!(
            normalize_accelerator("Command+K").as_deref(),
            Some("Meta+K")
        );
        assert_eq!(normalize_accelerator("Option+K").as_deref(), Some("Alt+K"));
        assert_eq!(normalize_accelerator("Win+K").as_deref(), Some("Super+K"));

        assert_eq!(
            normalize_accelerator("ctrl+shift+k").as_deref(),
            Some("Control+Shift+K")
        );
        assert_eq!(
            normalize_accelerator("CTRL+SHIFT+K").as_deref(),
            Some("Control+Shift+K")
        );

        assert_eq!(
            normalize_accelerator("Shift+Control+K").as_deref(),
            Some("Control+Shift+K")
        );
        assert_eq!(
            normalize_accelerator("Alt+Shift+Control+K").as_deref(),
            Some("Control+Alt+Shift+K")
        );
        assert_eq!(
            normalize_accelerator("Meta+Alt+Shift+Control+K").as_deref(),
            Some("Control+Alt+Shift+Meta+K")
        );
        assert_eq!(
            normalize_accelerator("Meta+Shift+K").as_deref(),
            Some("Shift+Meta+K")
        );

        assert_eq!(
            normalize_accelerator("Ctrl+Esc").as_deref(),
            Some("Control+Escape")
        );
        assert_eq!(
            normalize_accelerator("Ctrl+Del").as_deref(),
            Some("Control+Delete")
        );
        assert_eq!(
            normalize_accelerator("Ctrl+Enter").as_deref(),
            Some("Control+Return")
        );
        assert_eq!(
            normalize_accelerator("Ctrl+Up").as_deref(),
            Some("Control+ArrowUp")
        );
        assert_eq!(
            normalize_accelerator("Ctrl+Down").as_deref(),
            Some("Control+ArrowDown")
        );

        assert_eq!(normalize_accelerator(""), None);
        assert_eq!(normalize_accelerator("   "), None);
        assert_eq!(normalize_accelerator("Control+"), None);
        assert_eq!(normalize_accelerator("Control+Shift+"), None);
        assert_eq!(normalize_accelerator("UnknownMod+K"), None);
        assert_eq!(normalize_accelerator("Control+InvalidKey999"), None);

        assert_eq!(
            normalize_accelerator("Ctrl-K").as_deref(),
            Some("Control+K")
        );
        assert_eq!(
            normalize_accelerator("Ctrl-Shift-K").as_deref(),
            Some("Control+Shift+K")
        );

        let once = normalize_accelerator("ctrl+shift+k").unwrap();
        let twice = normalize_accelerator(&once).unwrap();
        assert_eq!(once, twice);
    }

    // parse_accelerator
    #[test]
    #[serial]
    fn parse_accelerator_fills_out() {
        let mut out = create_parsed_accelerator();
        assert!(parse_accelerator("Control+Shift+K", &mut out));
        assert_eq!(out.key, "K");
        assert_eq!(
            out.modifiers,
            vec![ShortcutModifier::Control, ShortcutModifier::Shift]
        );

        let mut out2 = create_parsed_accelerator();
        assert!(parse_accelerator("Cmd+Option+S", &mut out2));
        assert_eq!(out2.key, "S");
        assert_eq!(
            out2.modifiers,
            vec![ShortcutModifier::Alt, ShortcutModifier::Meta]
        );

        let mut out3 = create_parsed_accelerator();
        assert!(!parse_accelerator("", &mut out3));
        assert!(!parse_accelerator("Control+", &mut out3));
        assert!(!parse_accelerator("Control+BadKey999", &mut out3));
        // Out unchanged on failure.
        assert_eq!(out3.key, "");
        assert!(out3.modifiers.is_empty());

        for (alias, expected) in [
            ("Ctrl", ShortcutModifier::Control),
            ("Control", ShortcutModifier::Control),
            ("Cmd", ShortcutModifier::Meta),
            ("Command", ShortcutModifier::Meta),
            ("Meta", ShortcutModifier::Meta),
            ("Option", ShortcutModifier::Alt),
            ("Alt", ShortcutModifier::Alt),
            ("Shift", ShortcutModifier::Shift),
            ("Win", ShortcutModifier::Super),
            ("Super", ShortcutModifier::Super),
        ] {
            let mut o = create_parsed_accelerator();
            assert!(parse_accelerator(&format!("{alias}+K"), &mut o));
            assert!(o.modifiers.contains(&expected));
        }
    }

    // Aliased out — re-using the same out object as a prior fill.
    #[test]
    #[serial]
    fn parse_accelerator_aliased_out() {
        let mut out = create_parsed_accelerator();
        assert!(parse_accelerator("Ctrl+K", &mut out));
        assert!(parse_accelerator("Alt+F", &mut out));
        assert_eq!(out.key, "F");
        assert_eq!(out.modifiers, vec![ShortcutModifier::Alt]);
    }

    // parse_accelerator_detailed
    #[test]
    #[serial]
    fn parse_accelerator_detailed_reports_errors() {
        let mut out = create_parsed_accelerator();
        assert!(parse_accelerator_detailed("Control+K", &mut out).is_ok());
        assert_eq!(out.key, "K");

        let mut out2 = create_parsed_accelerator();
        let err = parse_accelerator_detailed("", &mut out2).unwrap_err();
        assert_eq!(err.reason, AcceleratorParseErrorReason::Empty);

        let mut out3 = create_parsed_accelerator();
        let err = parse_accelerator_detailed("Control+Shift", &mut out3).unwrap_err();
        assert_eq!(err.reason, AcceleratorParseErrorReason::MissingKey);

        let mut out4 = create_parsed_accelerator();
        let err = parse_accelerator_detailed("Control+InvalidKey999", &mut out4).unwrap_err();
        assert_eq!(err.reason, AcceleratorParseErrorReason::UnknownKey);
        assert_eq!(err.token, "InvalidKey999");

        let mut out5 = create_parsed_accelerator();
        let err = parse_accelerator_detailed("Ctrl+Control+K", &mut out5).unwrap_err();
        assert_eq!(err.reason, AcceleratorParseErrorReason::DuplicateModifier);
    }

    // register_global_shortcut
    #[test]
    #[serial]
    fn register_global_shortcut_normalizes_and_fires() {
        reset();
        let backend = install_fake();
        assert!(register_global_shortcut("Ctrl+Q", Box::new(|_| {})));
        assert!(backend.is_registered("Control+Q"));

        let received: StdArc<Mutex<Vec<String>>> = StdArc::new(Mutex::new(Vec::new()));
        let received_clone = received.clone();
        register_global_shortcut(
            "Control+K",
            Box::new(move |event| {
                received_clone
                    .lock()
                    .unwrap()
                    .push(event.accelerator.clone());
            }),
        );
        backend.trigger("Control+K");
        assert_eq!(*received.lock().unwrap(), vec!["Control+K".to_string()]);
        reset();

        assert!(!register_global_shortcut("Control+Q", Box::new(|_| {})));
        let _b = install_fake();
        assert!(!register_global_shortcut("", Box::new(|_| {})));
        assert!(!register_global_shortcut("Bad###Key", Box::new(|_| {})));
        reset();
    }

    // resolve_command_or_control_modifier
    #[test]
    #[serial]
    fn resolve_command_or_control_modifier_per_platform() {
        let result = resolve_command_or_control_modifier(None);
        assert!(matches!(
            result,
            ShortcutModifier::Control | ShortcutModifier::Meta
        ));
        assert_eq!(
            resolve_command_or_control_modifier(Some("macos")),
            ShortcutModifier::Meta
        );
        assert_eq!(
            resolve_command_or_control_modifier(Some("MacOS")),
            ShortcutModifier::Meta
        );
        assert_eq!(
            resolve_command_or_control_modifier(Some("macintosh")),
            ShortcutModifier::Meta
        );
        assert_eq!(
            resolve_command_or_control_modifier(Some("windows")),
            ShortcutModifier::Control
        );
        assert_eq!(
            resolve_command_or_control_modifier(Some("linux")),
            ShortcutModifier::Control
        );
        assert_eq!(
            resolve_command_or_control_modifier(Some("Windows NT")),
            ShortcutModifier::Control
        );
    }

    // resume_all_global_shortcuts
    #[test]
    #[serial]
    fn resume_all_global_shortcuts_re_enables() {
        reset();
        let backend = install_fake();
        register_global_shortcut("Control+K", Box::new(|_| {}));
        suspend_all_global_shortcuts();
        resume_all_global_shortcuts();
        assert!(backend.all_enabled());
        reset();
        resume_all_global_shortcuts(); // web no-op
        reset();
    }

    // set_shortcut_backend
    #[test]
    #[serial]
    fn set_shortcut_backend_clears_to_web() {
        reset();
        install_fake();
        set_shortcut_backend(None);
        let mut out: Vec<Accelerator> = Vec::new();
        get_registered_global_shortcuts(&mut out);
        assert!(out.is_empty());
        reset();
    }

    // suspend_all_global_shortcuts
    #[test]
    #[serial]
    fn suspend_all_global_shortcuts_disables_all() {
        reset();
        let backend = install_fake();
        register_global_shortcut("Control+K", Box::new(|_| {}));
        register_global_shortcut("Meta+S", Box::new(|_| {}));
        suspend_all_global_shortcuts();
        assert!(!backend.all_enabled());
        assert_eq!(backend.entry_enabled("Control+K"), Some(false));
        assert_eq!(backend.entry_enabled("Meta+S"), Some(false));
        reset();
        suspend_all_global_shortcuts(); // web no-op
        reset();
    }

    // unregister_all_global_shortcuts
    #[test]
    #[serial]
    fn unregister_all_global_shortcuts_clears() {
        reset();
        let backend = install_fake();
        register_global_shortcut("Control+A", Box::new(|_| {}));
        register_global_shortcut("Control+B", Box::new(|_| {}));
        unregister_all_global_shortcuts();
        assert_eq!(backend.len(), 0);
        reset();
        unregister_all_global_shortcuts(); // web no-op
        reset();
    }

    // unregister_global_shortcut
    #[test]
    #[serial]
    fn unregister_global_shortcut_normalizes() {
        reset();
        let backend = install_fake();
        register_global_shortcut("Control+W", Box::new(|_| {}));
        assert!(unregister_global_shortcut("Control+W"));
        assert!(!backend.is_registered("Control+W"));

        register_global_shortcut("Ctrl+W", Box::new(|_| {}));
        assert!(unregister_global_shortcut("control+w"));
        assert_eq!(backend.len(), 0);

        assert!(!unregister_global_shortcut(""));
        reset();
        assert!(!unregister_global_shortcut("Control+W")); // web
        reset();
    }
}
