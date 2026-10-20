use crate::path::{Path, PathCommand, PathSegment};
use crate::for_each_path_segment::for_each_path_segment;

/// Reverses the winding direction of all contours in `source` and writes the result into `out`.
/// Alias-safe: `out` may be the same object as `source`.
pub fn reverse_path(source: &Path, out: &mut Path) {
    let subpaths = decode_subpaths(source);
    out.commands.clear();
    out.data.clear();
    out.winding = source.winding;
    for subpath in &subpaths {
        encode_reversed_subpath(subpath, out);
    }
}

#[derive(Debug, Clone, Copy)]
enum SubpathPointKind {
    Move,
    Line,
    Quad { cx: f64, cy: f64 },
    Cubic { c1x: f64, c1y: f64, c2x: f64, c2y: f64 },
}

#[derive(Debug, Clone, Copy)]
struct SubpathPoint {
    x: f64,
    y: f64,
    kind: SubpathPointKind,
}

struct Subpath {
    closed: bool,
    points: Vec<SubpathPoint>,
}

fn decode_subpaths(path: &Path) -> Vec<Subpath> {
    let segments = for_each_path_segment(path);
    let mut subpaths: Vec<Subpath> = Vec::new();
    let mut current: Option<usize> = None;

    for segment in &segments {
        match segment {
            PathSegment::MoveTo { x, y } => {
                subpaths.push(Subpath {
                    closed: false,
                    points: vec![SubpathPoint { x: *x, y: *y, kind: SubpathPointKind::Move }],
                });
                current = Some(subpaths.len() - 1);
            }
            PathSegment::LineTo { x, y } => {
                if current.is_none() {
                    subpaths.push(Subpath {
                        closed: false,
                        points: vec![SubpathPoint { x: 0.0, y: 0.0, kind: SubpathPointKind::Move }],
                    });
                    current = Some(subpaths.len() - 1);
                }
                subpaths[current.unwrap()].points.push(SubpathPoint {
                    x: *x, y: *y, kind: SubpathPointKind::Line,
                });
            }
            PathSegment::QuadraticCurveTo { control_x, control_y, x, y } => {
                if current.is_none() {
                    subpaths.push(Subpath {
                        closed: false,
                        points: vec![SubpathPoint { x: 0.0, y: 0.0, kind: SubpathPointKind::Move }],
                    });
                    current = Some(subpaths.len() - 1);
                }
                subpaths[current.unwrap()].points.push(SubpathPoint {
                    x: *x, y: *y, kind: SubpathPointKind::Quad { cx: *control_x, cy: *control_y },
                });
            }
            PathSegment::CubicCurveTo { control_x1, control_y1, control_x2, control_y2, x, y } => {
                if current.is_none() {
                    subpaths.push(Subpath {
                        closed: false,
                        points: vec![SubpathPoint { x: 0.0, y: 0.0, kind: SubpathPointKind::Move }],
                    });
                    current = Some(subpaths.len() - 1);
                }
                subpaths[current.unwrap()].points.push(SubpathPoint {
                    x: *x, y: *y,
                    kind: SubpathPointKind::Cubic {
                        c1x: *control_x1, c1y: *control_y1,
                        c2x: *control_x2, c2y: *control_y2,
                    },
                });
            }
            PathSegment::Close => {
                if let Some(idx) = current {
                    subpaths[idx].closed = true;
                }
            }
        }
    }
    return subpaths;
}

fn encode_reversed_subpath(subpath: &Subpath, out: &mut Path) {
    let pts = &subpath.points;
    if pts.is_empty() {
        return;
    }
    let last = &pts[pts.len() - 1];
    out.commands.push(PathCommand::MoveTo as u8);
    out.data.push(last.x);
    out.data.push(last.y);
    let mut i = pts.len() as isize - 1;
    while i >= 1 {
        let from = &pts[i as usize];
        let to = &pts[(i - 1) as usize];
        match from.kind {
            SubpathPointKind::Line | SubpathPointKind::Move => {
                out.commands.push(PathCommand::LineTo as u8);
                out.data.push(to.x);
                out.data.push(to.y);
            }
            SubpathPointKind::Quad { cx, cy } => {
                out.commands.push(PathCommand::QuadraticCurveTo as u8);
                out.data.push(cx);
                out.data.push(cy);
                out.data.push(to.x);
                out.data.push(to.y);
            }
            SubpathPointKind::Cubic { c1x, c1y, c2x, c2y } => {
                out.commands.push(PathCommand::CubicCurveTo as u8);
                out.data.push(c2x);
                out.data.push(c2y);
                out.data.push(c1x);
                out.data.push(c1y);
                out.data.push(to.x);
                out.data.push(to.y);
            }
        }
        i -= 1;
    }
    if subpath.closed {
        out.commands.push(PathCommand::Close as u8);
    }
}
