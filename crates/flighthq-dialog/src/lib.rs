//! `flighthq-dialog` — native file/message dialogs over a swappable backend.
//!
//! Free functions delegate to the active [`DialogBackend`]. All functions
//! resolve to sentinels (`[]` / `None` / `false`) on cancel or when the host
//! lacks the surface — dialog dismissal is an expected outcome, not an error.

pub mod dialog;

pub use dialog::{
    get_dialog_backend, set_dialog_backend, show_confirm_dialog, show_message_dialog,
    show_open_file_dialog, show_prompt_dialog, show_save_file_dialog,
};
