//! `flighthq-filesystem` — read/write files and directories over a swappable native backend.
//!
//! Provides free functions for common file system operations. All operations return
//! sentinel values (`None`, `[]`, `false`) on expected failures (missing files, denied
//! access) rather than propagating errors — absent files are an expected outcome.
//!
//! The [`FileSystemBackend`] trait and its shared data types are defined in
//! `flighthq-types`; the default implementation here uses [`std::fs`]. Install a
//! custom backend with [`set_file_system_backend`].

pub mod filesystem;

// Re-export the complete public surface at the crate root.

// filesystem
pub use filesystem::{
    NativeFileSystemBackend, append_text_file, copy_file, file_exists, get_file_system_backend,
    get_file_system_path, make_directory, read_binary_file, read_directory, read_text_file,
    remove_file, rename_file, set_file_system_backend, stat_file, watch_path, write_binary_file,
    write_text_file,
};

// Shared seam contract and data types live in the header layer.
pub use flighthq_types::{
    FileEntry, FileStat, FileSystemBackend, FileSystemPathKind, FileWatchEvent, FileWatchEventType,
};
