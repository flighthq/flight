//! `flighthq-keyboard` — on-screen (soft) keyboard visibility, height, and
//! show/hide/resize signals over a swappable web/native backend.
//!
//! The [`SoftKeyboard`] entity holds three signals that fire on keyboard
//! lifecycle events. Call [`attach_soft_keyboard`] to wire up the active
//! backend, and [`detach_soft_keyboard`] or [`dispose_soft_keyboard`] to stop
//! delivery.

pub mod keyboard;

pub use keyboard::{
    attach_soft_keyboard, create_soft_keyboard, create_soft_keyboard_info, detach_soft_keyboard,
    dispose_soft_keyboard, get_soft_keyboard_backend, get_soft_keyboard_info, hide_soft_keyboard,
    is_soft_keyboard_visible, set_soft_keyboard_backend, show_soft_keyboard,
};
