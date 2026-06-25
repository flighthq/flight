//! Disk / quota usage reported by the file system seam.

/// Storage usage for the active file system. On web this is sourced from
/// `navigator.storage.estimate()`; native backends source it from `statvfs`.
/// Returned by `get_file_system_usage`, or `None` when usage is unavailable.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FileSystemUsage {
    /// Bytes currently in use.
    pub used_bytes: u64,
    /// Total quota in bytes (0 when the platform reports no quota).
    pub quota_bytes: u64,
}
