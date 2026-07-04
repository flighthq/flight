//! Path cloning and copying.

use flighthq_types::Path;

/// Allocates a new [`Path`] that is a deep copy of `source`.
pub fn clone_path(source: &Path) -> Path {
    Path {
        commands: source.commands.clone(),
        data: source.data.clone(),
        winding: source.winding,
    }
}

/// Copies all commands, data, and the winding rule from `source` into `out`.
pub fn copy_path(source: &Path, out: &mut Path) {
    out.commands.clear();
    out.commands.extend_from_slice(&source.commands);
    out.data.clear();
    out.data.extend_from_slice(&source.data);
    out.winding = source.winding;
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{PathWinding, path_command};

    // clone_path
    #[test]
    fn clone_path_deep_copies_all_fields() {
        let source = Path {
            commands: vec![path_command::MOVE_TO, path_command::LINE_TO],
            data: vec![1.0, 2.0, 3.0, 4.0],
            winding: PathWinding::EvenOdd,
        };
        let cloned = clone_path(&source);
        assert_eq!(cloned.commands, source.commands);
        assert_eq!(cloned.data, source.data);
        assert_eq!(cloned.winding, source.winding);
    }

    #[test]
    fn clone_path_is_independent() {
        let source = Path {
            commands: vec![path_command::MOVE_TO],
            data: vec![1.0, 2.0],
            winding: PathWinding::NonZero,
        };
        let mut cloned = clone_path(&source);
        cloned.commands.push(path_command::LINE_TO);
        cloned.data.extend_from_slice(&[3.0, 4.0]);
        // Source must be unchanged
        assert_eq!(source.commands.len(), 1);
        assert_eq!(source.data.len(), 2);
    }

    #[test]
    fn clone_path_empty() {
        let source = Path {
            commands: Vec::new(),
            data: Vec::new(),
            winding: PathWinding::NonZero,
        };
        let cloned = clone_path(&source);
        assert!(cloned.commands.is_empty());
        assert!(cloned.data.is_empty());
        assert_eq!(cloned.winding, PathWinding::NonZero);
    }

    // copy_path
    #[test]
    fn copy_path_overwrites_target() {
        let source = Path {
            commands: vec![path_command::MOVE_TO, path_command::LINE_TO],
            data: vec![1.0, 2.0, 3.0, 4.0],
            winding: PathWinding::EvenOdd,
        };
        let mut target = Path {
            commands: vec![path_command::CUBIC_CURVE_TO],
            data: vec![99.0; 6],
            winding: PathWinding::NonZero,
        };
        copy_path(&source, &mut target);
        assert_eq!(target.commands, source.commands);
        assert_eq!(target.data, source.data);
        assert_eq!(target.winding, source.winding);
    }

    #[test]
    fn copy_path_into_empty_target() {
        let source = Path {
            commands: vec![path_command::MOVE_TO],
            data: vec![5.0, 10.0],
            winding: PathWinding::NonZero,
        };
        let mut target = Path {
            commands: Vec::new(),
            data: Vec::new(),
            winding: PathWinding::EvenOdd,
        };
        copy_path(&source, &mut target);
        assert_eq!(target.commands, [path_command::MOVE_TO]);
        assert_eq!(target.data, [5.0, 10.0]);
        assert_eq!(target.winding, PathWinding::NonZero);
    }

    #[test]
    fn copy_path_from_empty_source() {
        let source = Path {
            commands: Vec::new(),
            data: Vec::new(),
            winding: PathWinding::EvenOdd,
        };
        let mut target = Path {
            commands: vec![path_command::MOVE_TO, path_command::LINE_TO],
            data: vec![1.0, 2.0, 3.0, 4.0],
            winding: PathWinding::NonZero,
        };
        copy_path(&source, &mut target);
        assert!(target.commands.is_empty());
        assert!(target.data.is_empty());
        assert_eq!(target.winding, PathWinding::EvenOdd);
    }
}
