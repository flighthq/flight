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
        let ra = s.copy();
        let rb = copy_path(&s);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn path_copy_into_matches_copy_path_into() {
        let mut oa0 = create_path(None);
        let mut ob0 = create_path(None);
        let s = test_path();
        s.copy_into(&mut oa0);
        copy_path_into(&s, &mut ob0);
        assert_eq!(format!("{:?}", oa0), format!("{:?}", ob0));
    }
}

/// Allocates a new `Path` that is a deep copy of `source`.
pub fn clone_path(source: &Path) -> Path {
    return copy_path(source);
}

/// Deep-copies all commands, data, and the winding rule from `source` into a new `Path`.
// flight-lint: allow(conform-params) D9: TS optional `out` is split into `copy_path` (allocates) and `copy_path_into` (writes `out`)
pub fn copy_path(source: &Path) -> Path {
    let mut out: Path = allocate_entity();
    copy_path_into(source, &mut out);
    return out;
}

/// Copies all commands, data, and the winding rule from `source` into `out`.
// flight-lint: allow(conform-extra) D9: the `out` branch of TS `copyPath(source, out?)`
/// Alias-safe: if `out` points to the same allocation as `source`, the data is still correct.
pub fn copy_path_into(source: &Path, out: &mut Path) {
    let commands = source.commands.clone();
    let data = source.data.clone();
    let winding = source.winding;
    out.commands = commands;
    out.data = data;
    out.winding = winding;
}

impl Path {
    pub fn clone_path(&self) -> Path {
        return clone_path(self);
    }

    pub fn copy(&self) -> Path {
        return copy_path(self);
    }

    pub fn copy_into(&self, out: &mut Path) {
        return copy_path_into(self, out);
    }
}
