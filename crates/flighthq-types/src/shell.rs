//! Shell value types shared across the OS-shell integration seam.
//!
//! These are plain data descriptors passed to the [`crate::ShellBackend`] methods —
//! options for opening URLs/paths and the Windows `.lnk` shortcut payload. The backend
//! trait itself lives in `platform.rs`; these are the value-typed inputs/outputs.

/// Options for [`crate::ShellBackend::open_external`].
///
/// `activate` requests that the opened handler be raised to the foreground (macOS); it has
/// no web equivalent and is silently ignored there.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShellOpenExternalOptions {
    pub activate: Option<bool>,
}

/// Options for opening a local path with its default OS application.
///
/// `working_directory` sets the process working directory for the launched application;
/// `application` names a specific application to open the path with instead of the default;
/// `arguments` are extra command-line arguments forwarded to that application.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShellOpenPathOptions {
    pub working_directory: Option<String>,
    pub application: Option<String>,
    pub arguments: Option<Vec<String>>,
}

/// A Windows `.lnk` shell shortcut payload — the target the shortcut points at plus optional
/// metadata. `target` is the only required field.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShellShortcutLink {
    pub target: String,
    pub args: Option<String>,
    pub description: Option<String>,
    pub cwd: Option<String>,
    pub icon: Option<String>,
    pub icon_index: Option<i32>,
    pub app_user_model_id: Option<String>,
}

/// The write mode for [`crate::ShellBackend::write_shortcut_link`]: create a new shortcut,
/// replace an existing one, or update it in place. Defaults to `Create`.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Hash)]
pub enum ShellShortcutWriteOperation {
    #[default]
    Create,
    Replace,
    Update,
}
