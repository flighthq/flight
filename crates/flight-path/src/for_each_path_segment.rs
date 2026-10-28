use crate::path::{Path, PathCommand, PathSegment};

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(PathWinding::NonZero);
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_for_each_segment_matches_for_each_path_segment() {
        let s = test_path();
        let mut a: Vec<PathSegment> = Vec::new();
        let mut b: Vec<PathSegment> = Vec::new();
        s.for_each_segment(&mut |segment| a.push(segment));
        for_each_path_segment(&s, &mut |segment| b.push(segment));
        assert_eq!(a, b);
    }
}

/// Decodes every segment in `path` and passes each to `visitor` in order. WIDE_MOVE_TO and WIDE_LINE_TO are
/// normalized to their moveTo and lineTo equivalents (the dummy coordinate pair is dropped).
/// NO_OP verbs are skipped silently.
pub fn for_each_path_segment(path: &Path, visitor: &mut dyn FnMut(PathSegment)) {
    let commands = &path.commands;
    let data = &path.data;
    let mut di: usize = 0;
    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MoveTo as u8 {
            let x = data[di];
            let y = data[di + 1];
            di += 2;
            visitor(PathSegment::MoveTo { x, y });
        } else if command == PathCommand::WideMoveTo as u8 {
            let x = data[di + 2];
            let y = data[di + 3];
            di += 4;
            visitor(PathSegment::MoveTo { x, y });
        } else if command == PathCommand::LineTo as u8 {
            let x = data[di];
            let y = data[di + 1];
            di += 2;
            visitor(PathSegment::LineTo { x, y });
        } else if command == PathCommand::WideLineTo as u8 {
            let x = data[di + 2];
            let y = data[di + 3];
            di += 4;
            visitor(PathSegment::LineTo { x, y });
        } else if command == PathCommand::QuadraticCurveTo as u8 {
            let control_x = data[di];
            let control_y = data[di + 1];
            let x = data[di + 2];
            let y = data[di + 3];
            di += 4;
            visitor(PathSegment::QuadraticCurveTo {
                control_x,
                control_y,
                x,
                y,
            });
        } else if command == PathCommand::CubicCurveTo as u8 {
            let control_x1 = data[di];
            let control_y1 = data[di + 1];
            let control_x2 = data[di + 2];
            let control_y2 = data[di + 3];
            let x = data[di + 4];
            let y = data[di + 5];
            di += 6;
            visitor(PathSegment::CubicCurveTo {
                control_x1,
                control_y1,
                control_x2,
                control_y2,
                x,
                y,
            });
        } else if command == PathCommand::Close as u8 {
            visitor(PathSegment::Close);
        }
    }
}

impl Path {
    pub fn for_each_segment(&self, visitor: &mut dyn FnMut(PathSegment)) {
        return for_each_path_segment(self, visitor);
    }
}
