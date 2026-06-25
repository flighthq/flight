//! Options for a recursive directory walk on the file system seam.

/// Options controlling a recursive directory walk (`read_directory_recursive`).
/// `max_depth` of `None` means unbounded depth (the TS `Infinity` default);
/// a depth of `0` lists only the immediate entries of the walked directory.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FileWalkOptions {
    /// Maximum descent depth, or `None` for unbounded.
    pub max_depth: Option<u32>,
}
