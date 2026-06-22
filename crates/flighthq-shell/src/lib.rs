//! `flighthq-shell` — OS shell integration over a swappable native backend.
//!
//! Provides free functions for opening external URLs and paths, revealing items in
//! the OS file manager, moving paths to the trash, and emitting a system beep.
//!
//! The [`ShellBackend`] trait defining the seam lives in `flighthq-types`; the default
//! implementation here spawns platform-appropriate system commands (`open`, `xdg-open`,
//! `explorer`, etc.). Install a custom backend with [`set_shell_backend`].
//!
//! Operations that the current host does not support return `false` rather than
//! panicking — they are expected-failure surfaces, not programmer errors.

pub mod shell;

// Re-export the complete public surface at the crate root.

// shell
pub use shell::{
    NativeShellBackend, get_shell_backend, move_item_to_trash, open_external_url, open_shell_path,
    set_shell_backend, shell_beep, show_item_in_folder,
};

// Shared seam contract lives in the header layer.
pub use flighthq_types::ShellBackend;
