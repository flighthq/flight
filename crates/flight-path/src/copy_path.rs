use flight_entity::allocate_entity;

use crate::path::Path;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(Some(PathWinding::NonZero));
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
        let mut a = create_path(Some(PathWinding::NonZero));
        let mut b = create_path(Some(PathWinding::NonZero));
        a.copy(&s);
        copy_path(&mut b, &s);
        assert_eq!(a.commands, s.commands);
        assert_eq!(a.data, s.data);
        assert_eq!(a.winding, s.winding);
        assert_eq!(a, b);
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
#[allow(clippy::needless_range_loop)] // indexed loop remains portable to generated TypeScript
pub fn copy_path(out: &mut Path, source: &Path) {
    let commands: Vec<u8> = source.commands.clone();
    let data: Vec<f64> = source.data.clone();
    let winding = source.winding;
    out.commands.clear();
    for i in 0..commands.len() {
        out.commands.push(commands[i]);
    }
    out.data.clear();
    for i in 0..data.len() {
        out.data.push(data[i]);
    }
    out.winding = winding;
}

impl Path {
    pub fn clone_path(&self) -> Path {
        return clone_path(self);
    }

    pub fn copy(&mut self, source: &Path) {
        return copy_path(self, source);
    }
}
