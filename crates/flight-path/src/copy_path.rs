use flight_entity::allocate_entity;

use crate::path::Path;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(None);
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_clone_path_matches_clone_path() {
        let s = test_path();
        let ra = s.clone_path();
        let rb = clone_path(&s);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn path_copy_matches_copy_path() {
        let s = test_path();
        let mut a = create_path(None);
        let mut b = create_path(None);
        a.copy(&s);
        copy_path(&mut b, &s);
        assert_eq!(a.commands, s.commands);
        assert_eq!(a.data, s.data);
        assert_eq!(a.winding, s.winding);
        assert_eq!(a, b);
    }

    #[test]
    fn path_copy_into_matches_copy_path_into() {
        let mut oa0 = create_path(None);
        let mut ob0 = create_path(None);
        let s = test_path();
        oa0.copy_into(&s);
        copy_path_into(&mut ob0, &s);
        assert_eq!(format!("{:?}", oa0), format!("{:?}", ob0));
    }
}

/// Allocates a new `Path` that is a deep copy of `source`.
pub fn clone_path(source: &Path) -> Path {
    let mut out: Path = allocate_entity();
    copy_path(&mut out, source);
    return out;
}

/// Copies commands, data, and winding into the caller's path, retaining its field storage.
// flight-lint: allow(conform-params) D24: user-approved required out-first writer; pinned TS still has copyPath(source, out?) and allocation moves to clone_path
pub fn copy_path(out: &mut Path, source: &Path) {
    let commands = source.commands.clone();
    let data = source.data.clone();
    let winding = source.winding;
    out.commands.clear();
    out.commands.extend_from_slice(&commands);
    out.data.clear();
    out.data.extend_from_slice(&data);
    out.winding = winding;
}

// flight-lint: allow(conform-extra) D24: retained required-out compatibility delegate to copy_path; allocation is explicitly clone_path
/// Copies into `out` through the required-out `copy_path` writer.
pub fn copy_path_into(out: &mut Path, source: &Path) {
    return copy_path(out, source);
}

impl Path {
    pub fn clone_path(&self) -> Path {
        return clone_path(self);
    }

    pub fn copy(&mut self, source: &Path) {
        return copy_path(self, source);
    }

    /// Copies `source` into this path (D18 receiver is the `out` argument).
    pub fn copy_into(&mut self, source: &Path) {
        return copy_path_into(self, source);
    }
}
