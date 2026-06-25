//! `flighthq-keyboard` — on-screen (soft) keyboard visibility, height, and
//! show/hide/resize signals over a swappable web/native backend.
//!
//! The [`SoftKeyboard`] entity holds nine signals that fire on keyboard
//! lifecycle events (the will/did pairs plus the simple-path show/hide/resize
//! aliases). Call [`attach_soft_keyboard`] to wire up the active backend, and
//! [`detach_soft_keyboard`] or [`dispose_soft_keyboard`] to stop delivery.

pub mod keyboard;

pub use keyboard::{
    attach_soft_keyboard, create_soft_keyboard, create_soft_keyboard_info,
    create_soft_keyboard_transition, detach_soft_keyboard, dispose_soft_keyboard,
    get_soft_keyboard_backend, get_soft_keyboard_height, get_soft_keyboard_info,
    get_soft_keyboard_resize_mode, hide_soft_keyboard, is_soft_keyboard_accessory_bar_visible,
    is_soft_keyboard_scroll_assist_enabled, is_soft_keyboard_visible,
    set_soft_keyboard_accessory_bar_visible, set_soft_keyboard_backend,
    set_soft_keyboard_resize_mode, set_soft_keyboard_scroll_assist_enabled,
    set_soft_keyboard_style, show_soft_keyboard,
};
