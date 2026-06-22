//! Converts a Flight `Path` (the verb/coordinate command stream defined in
//! `flighthq-types`) into a tiny-skia `Path` ready for `fill_path`. Mirrors the
//! `drawPath` verb handling in TS `canvasShapeCommands` (the `NO_OP`/`MOVE_TO`/
//! `LINE_TO`/`CURVE_TO`/`WIDE_*`/`CUBIC_CURVE_TO` switch), but emits tiny-skia
//! path builder calls instead of Canvas2D context calls.

use flighthq_types::Path;
use flighthq_types::misc::path_command;
use flighthq_types::node_types::PathWinding;
use tiny_skia::{FillRule, Path as SkiaPath, PathBuilder};

/// Maps a Flight `PathWinding` to the tiny-skia `FillRule` used when filling the
/// converted path. `NonZero` -> `Winding`, `EvenOdd` -> `EvenOdd`.
pub fn resolve_skia_fill_rule(winding: PathWinding) -> FillRule {
    match winding {
        PathWinding::NonZero => FillRule::Winding,
        PathWinding::EvenOdd => FillRule::EvenOdd,
    }
}

/// Builds a tiny-skia `Path` from a Flight `Path` command stream. Returns `None`
/// when the path is empty or degenerate (no fillable area), matching tiny-skia's
/// own refusal to fill zero-area paths. The coordinate stream is consumed in the
/// same stride-per-verb layout the TS renderer uses.
///
/// As in the TS `drawPath`, an implicit `move_to(0, 0)` is inserted before a
/// `LINE_TO`/`CURVE_TO`/`CUBIC_CURVE_TO` that has no current point, so a path that
/// opens with a draw verb still anchors at the origin.
pub fn build_skia_path(path: &Path) -> Option<SkiaPath> {
    let mut builder = PathBuilder::new();
    let mut has_point = false;
    let mut di = 0usize;
    let data = &path.data;

    let ensure_point = |builder: &mut PathBuilder, has_point: &mut bool| {
        if !*has_point {
            builder.move_to(0.0, 0.0);
            *has_point = true;
        }
    };

    for &verb in &path.commands {
        match verb {
            path_command::NO_OP => {}
            path_command::MOVE_TO => {
                if di + 2 <= data.len() {
                    builder.move_to(data[di], data[di + 1]);
                    has_point = true;
                }
                di += 2;
            }
            path_command::LINE_TO => {
                ensure_point(&mut builder, &mut has_point);
                if di + 2 <= data.len() {
                    builder.line_to(data[di], data[di + 1]);
                }
                di += 2;
            }
            path_command::CURVE_TO => {
                ensure_point(&mut builder, &mut has_point);
                if di + 4 <= data.len() {
                    builder.quad_to(data[di], data[di + 1], data[di + 2], data[di + 3]);
                }
                di += 4;
            }
            path_command::WIDE_MOVE_TO => {
                if di + 4 <= data.len() {
                    builder.move_to(data[di + 2], data[di + 3]);
                    has_point = true;
                }
                di += 4;
            }
            path_command::WIDE_LINE_TO => {
                ensure_point(&mut builder, &mut has_point);
                if di + 4 <= data.len() {
                    builder.line_to(data[di + 2], data[di + 3]);
                }
                di += 4;
            }
            path_command::CUBIC_CURVE_TO => {
                ensure_point(&mut builder, &mut has_point);
                if di + 6 <= data.len() {
                    builder.cubic_to(
                        data[di],
                        data[di + 1],
                        data[di + 2],
                        data[di + 3],
                        data[di + 4],
                        data[di + 5],
                    );
                }
                di += 6;
            }
            _ => {}
        }
    }

    builder.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rectangle_path() -> Path {
        // A 10x10 box at the origin: move, three lines, close-via-line.
        Path {
            commands: vec![
                path_command::MOVE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO,
            ],
            data: vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0],
            winding: PathWinding::NonZero,
        }
    }

    #[test]
    fn build_skia_path_builds_rectangle() {
        let p = build_skia_path(&rectangle_path()).expect("rectangle path");
        let bounds = p.bounds();
        assert_eq!(bounds.left(), 0.0);
        assert_eq!(bounds.top(), 0.0);
        assert_eq!(bounds.right(), 10.0);
        assert_eq!(bounds.bottom(), 10.0);
    }

    #[test]
    fn build_skia_path_empty_returns_none() {
        let p = Path::default();
        assert!(build_skia_path(&p).is_none());
    }

    #[test]
    fn build_skia_path_inserts_implicit_move_for_leading_line() {
        // A path that opens with LINE_TO should anchor at (0,0).
        let path = Path {
            commands: vec![
                path_command::LINE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO,
            ],
            data: vec![10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
            winding: PathWinding::NonZero,
        };
        let p = build_skia_path(&path).expect("anchored path");
        assert_eq!(p.bounds().left(), 0.0);
        assert_eq!(p.bounds().top(), 0.0);
    }

    #[test]
    fn resolve_skia_fill_rule_maps_winding() {
        assert_eq!(
            resolve_skia_fill_rule(PathWinding::NonZero),
            FillRule::Winding
        );
        assert_eq!(
            resolve_skia_fill_rule(PathWinding::EvenOdd),
            FillRule::EvenOdd
        );
    }
}
