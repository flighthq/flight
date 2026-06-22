//! `flighthq-clipboard` — system clipboard read/write over a swappable backend.
//!
//! Free functions delegate to the active [`ClipboardBackend`]. The web default
//! (lazily installed) is a no-op stub that returns sentinels; real hosts supply
//! a backend via [`set_clipboard_backend`]. Read operations return `""` / `false`
//! when the host denies access — clipboard access is an expected-failure surface,
//! not a programmer error.

pub mod clipboard;

pub use clipboard::{
    clear_clipboard, get_clipboard_backend, has_clipboard_image, has_clipboard_text,
    read_clipboard_bookmark, read_clipboard_html, read_clipboard_image, read_clipboard_rtf,
    read_clipboard_text, set_clipboard_backend, write_clipboard_bookmark, write_clipboard_html,
    write_clipboard_image, write_clipboard_rtf, write_clipboard_text,
};
