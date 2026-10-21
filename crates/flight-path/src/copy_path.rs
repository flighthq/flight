use flight_entity::allocate_entity;

use crate::path::Path;

/// Allocates a new `Path` that is a deep copy of `source`.
pub fn clone_path(source: &Path) -> Path {
    return copy_path(source);
}

/// Deep-copies all commands, data, and the winding rule from `source` into a new `Path`.
pub fn copy_path(source: &Path) -> Path {
    let mut out: Path = allocate_entity();
    copy_path_into(source, &mut out);
    return out;
}

/// Copies all commands, data, and the winding rule from `source` into `out`.
/// Alias-safe: if `out` points to the same allocation as `source`, the data is still correct.
pub fn copy_path_into(source: &Path, out: &mut Path) {
    let commands = source.commands.clone();
    let data = source.data.clone();
    let winding = source.winding;
    out.commands = commands;
    out.data = data;
    out.winding = winding;
}
