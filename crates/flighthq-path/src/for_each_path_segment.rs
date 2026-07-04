//! Path segment iteration.

use flighthq_types::{Path, PathSegment, path_command};

/// Iterates over all segments in `path`, calling `visitor` for each decoded segment.
/// WIDE_MOVE_TO/WIDE_LINE_TO are normalized to their standard equivalents. NO_OP is skipped.
pub fn for_each_path_segment<F: FnMut(PathSegment)>(path: &Path, mut visitor: F) {
    let commands = &path.commands;
    let data = &path.data;
    let mut di = 0usize;
    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == path_command::MOVE_TO {
            let x = data[di];
            let y = data[di + 1];
            di += 2;
            visitor(PathSegment::MoveTo { x, y });
        } else if command == path_command::WIDE_MOVE_TO {
            let x = data[di + 2];
            let y = data[di + 3];
            di += 4;
            visitor(PathSegment::MoveTo { x, y });
        } else if command == path_command::LINE_TO {
            let x = data[di];
            let y = data[di + 1];
            di += 2;
            visitor(PathSegment::LineTo { x, y });
        } else if command == path_command::WIDE_LINE_TO {
            let x = data[di + 2];
            let y = data[di + 3];
            di += 4;
            visitor(PathSegment::LineTo { x, y });
        } else if command == path_command::CURVE_TO {
            let control_x = data[di];
            let control_y = data[di + 1];
            let x = data[di + 2];
            let y = data[di + 3];
            di += 4;
            visitor(PathSegment::CurveTo {
                control_x,
                control_y,
                x,
                y,
            });
        } else if command == path_command::CUBIC_CURVE_TO {
            let control1_x = data[di];
            let control1_y = data[di + 1];
            let control2_x = data[di + 2];
            let control2_y = data[di + 3];
            let x = data[di + 4];
            let y = data[di + 5];
            di += 6;
            visitor(PathSegment::CubicCurveTo {
                control1_x,
                control1_y,
                control2_x,
                control2_y,
                x,
                y,
            });
        } else if command == path_command::CLOSE {
            visitor(PathSegment::Close);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{append_path_close, append_path_line_to, append_path_move_to, create_path};
    use flighthq_types::PathWinding;

    #[test]
    fn iterates_move_and_line() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 1.0, 2.0);
        append_path_line_to(&mut p, 3.0, 4.0);
        append_path_close(&mut p);
        let mut segments = Vec::new();
        for_each_path_segment(&p, |seg| segments.push(seg));
        assert_eq!(segments.len(), 3);
        assert_eq!(segments[0], PathSegment::MoveTo { x: 1.0, y: 2.0 });
        assert_eq!(segments[1], PathSegment::LineTo { x: 3.0, y: 4.0 });
        assert_eq!(segments[2], PathSegment::Close);
    }
}
