//! `flighthq-shortcut` — global OS hotkey registration plus accelerator
//! parsing, normalization, and display formatting over a swappable backend.
//!
//! Free functions delegate to the active [`ShortcutBackend`]. The web default
//! (lazily installed) returns false / no-op / empty sentinels for every
//! operation — global shortcuts require a native host (Electron, Tauri).
//! Install a backend via [`set_shortcut_backend`]. Accelerator strings are
//! parsed and normalized into a canonical form (fixed modifier order, canonical
//! key names) that all spelling/alias variants map onto.

pub mod shortcut;

pub use shortcut::{
    WebShortcutBackend, are_accelerators_equal, create_parsed_accelerator,
    create_web_shortcut_backend, disable_global_shortcut, enable_global_shortcut,
    enable_global_shortcut_signals, format_accelerator_for_display, get_accelerator_key,
    get_accelerator_key_label, get_accelerator_modifier_label, get_accelerator_modifiers,
    get_registered_global_shortcuts, get_shortcut_backend, has_global_shortcut_conflict,
    is_accelerator_valid, is_global_shortcut_registered, normalize_accelerator, parse_accelerator,
    parse_accelerator_detailed, register_global_shortcut, resolve_command_or_control_modifier,
    resume_all_global_shortcuts, set_shortcut_backend, suspend_all_global_shortcuts,
    unregister_all_global_shortcuts, unregister_global_shortcut,
};
