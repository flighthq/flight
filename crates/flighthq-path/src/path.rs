//! [`Path`] construction helpers — drawing commands that build a verb/data stream.

use flighthq_types::{Path, PathWinding, path_command};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Appends a cubic Bézier segment to `path`.
///
/// Consumes 6 data values: `(control1_x, control1_y, control2_x, control2_y, anchor_x, anchor_y)`.
pub fn append_path_cubic_curve_to(
    path: &mut Path,
    control1_x: f32,
    control1_y: f32,
    control2_x: f32,
    control2_y: f32,
    anchor_x: f32,
    anchor_y: f32,
) {
    path.commands.push(path_command::CUBIC_CURVE_TO);
    path.data.extend_from_slice(&[
        control1_x, control1_y, control2_x, control2_y, anchor_x, anchor_y,
    ]);
}

/// Appends a quadratic Bézier segment to `path`.
///
/// Consumes 4 data values: `(control_x, control_y, anchor_x, anchor_y)`.
pub fn append_path_curve_to(
    path: &mut Path,
    control_x: f32,
    control_y: f32,
    anchor_x: f32,
    anchor_y: f32,
) {
    path.commands.push(path_command::CURVE_TO);
    path.data
        .extend_from_slice(&[control_x, control_y, anchor_x, anchor_y]);
}

/// Appends a line segment to `path`.
///
/// Consumes 2 data values: `(x, y)`.
pub fn append_path_line_to(path: &mut Path, x: f32, y: f32) {
    path.commands.push(path_command::LINE_TO);
    path.data.extend_from_slice(&[x, y]);
}

/// Appends a move-to command to `path`, starting a new sub-path at `(x, y)`.
///
/// Consumes 2 data values: `(x, y)`.
pub fn append_path_move_to(path: &mut Path, x: f32, y: f32) {
    path.commands.push(path_command::MOVE_TO);
    path.data.extend_from_slice(&[x, y]);
}

/// Clears all commands and data from `path`, resetting it to an empty state.
pub fn clear_path(path: &mut Path) {
    path.commands.clear();
    path.data.clear();
}

/// Allocates an empty [`Path`].
///
/// `winding` defaults to [`PathWinding::NonZero`]: same-wound sub-paths union and
/// counter-wound sub-paths cut holes. Pass [`PathWinding::EvenOdd`] for parity fills.
pub fn create_path(winding: PathWinding) -> Path {
    Path {
        commands: Vec::new(),
        data: Vec::new(),
        winding,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::path_command;

    // append_path_cubic_curve_to
    #[test]
    fn append_path_cubic_curve_to_writes_command_and_data() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_cubic_curve_to(&mut p, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!(p.commands, [path_command::CUBIC_CURVE_TO]);
        assert_eq!(p.data, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    }

    #[test]
    fn append_path_cubic_curve_to_accumulates() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_cubic_curve_to(&mut p, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!(p.commands.len(), 2);
        assert_eq!(p.data.len(), 8);
    }

    // append_path_curve_to
    #[test]
    fn append_path_curve_to_writes_command_and_data() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_curve_to(&mut p, 10.0, 20.0, 30.0, 40.0);
        assert_eq!(p.commands, [path_command::CURVE_TO]);
        assert_eq!(p.data, [10.0, 20.0, 30.0, 40.0]);
    }

    // append_path_line_to
    #[test]
    fn append_path_line_to_writes_command_and_data() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_line_to(&mut p, 7.0, 8.0);
        assert_eq!(p.commands, [path_command::LINE_TO]);
        assert_eq!(p.data, [7.0, 8.0]);
    }

    // append_path_move_to
    #[test]
    fn append_path_move_to_writes_command_and_data() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 3.0, 4.0);
        assert_eq!(p.commands, [path_command::MOVE_TO]);
        assert_eq!(p.data, [3.0, 4.0]);
    }

    // clear_path
    #[test]
    fn clear_path_empties_commands_and_data() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 1.0, 2.0);
        append_path_line_to(&mut p, 3.0, 4.0);
        clear_path(&mut p);
        assert!(p.commands.is_empty());
        assert!(p.data.is_empty());
    }

    #[test]
    fn clear_path_preserves_winding() {
        let mut p = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut p, 1.0, 2.0);
        clear_path(&mut p);
        assert_eq!(p.winding, PathWinding::EvenOdd);
    }

    // create_path
    #[test]
    fn create_path_defaults_non_zero_winding() {
        let p = create_path(PathWinding::NonZero);
        assert_eq!(p.winding, PathWinding::NonZero);
        assert!(p.commands.is_empty());
        assert!(p.data.is_empty());
    }

    #[test]
    fn create_path_even_odd_winding() {
        let p = create_path(PathWinding::EvenOdd);
        assert_eq!(p.winding, PathWinding::EvenOdd);
    }
}
