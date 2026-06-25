//! File permission attributes for the file system seam.

/// Permission attributes for a path. Returned by `get_file_permissions` and accepted by
/// `set_file_permissions`. Web/OPFS has no permission model, so the web backend always returns
/// `None` / `false`; native POSIX backends map these onto the file's owner read/write/execute
/// bits.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FilePermissions {
    /// `true` when the file may be read.
    pub readable: bool,
    /// `true` when the file may be written.
    pub writable: bool,
    /// `true` when the file may be executed.
    pub executable: bool,
}
