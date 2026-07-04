//! Dash-pattern splitting — converts a solid [`Path`] into dashed sub-paths.
//!
//! Each dash-on segment becomes an open sub-path (`MOVE_TO` + `LINE_TO`s) in the output.
//! The dash pattern is a repeating `[on, off, on, off, ...]` length sequence; `dash_offset`
//! shifts the pattern start. An empty or all-zero dash array copies the source unchanged.

use flighthq_types::{Path, path_command};

use crate::flatten_path::flatten_path;

/// Splits `source` into dashed sub-paths according to the given dash pattern and offset.
///
/// Each dash-on segment becomes an open sub-path (`MOVE_TO` + `LINE_TO`s) in `out`.
/// `tolerance` controls the flatness of curve subdivision before dashing. Alias-safe.
pub fn dash_path(source: &Path, dash: &[f32], dash_offset: f32, out: &mut Path, tolerance: f32) {
    out.commands.clear();
    out.data.clear();
    out.winding = source.winding.clone();

    let total_dash_length = dash_total(dash);
    if total_dash_length <= 0.0 {
        copy_commands(source, out);
        return;
    }

    let contours = flatten_path(source, tolerance);
    for contour in &contours {
        apply_dash_to_contour(contour, dash, dash_offset, total_dash_length, out);
    }
}

fn apply_dash_to_contour(
    pts: &[f32],
    dash: &[f32],
    dash_offset: f32,
    total_dash_length: f32,
    out: &mut Path,
) {
    let n = pts.len() / 2;
    if n < 2 {
        return;
    }

    let offset = ((dash_offset % total_dash_length) + total_dash_length) % total_dash_length;
    let mut dash_index: usize = 0;
    let mut remaining: f32 = 0.0;
    let mut is_on = true;
    {
        let mut acc: f32 = 0.0;
        for i in 0..dash.len() {
            if acc + dash[i] > offset {
                dash_index = i;
                remaining = dash[i] - (offset - acc);
                is_on = i % 2 == 0;
                break;
            }
            acc += dash[i];
        }
    }

    let mut seg_started = false;
    for i in 0..n - 1 {
        let x0 = pts[i * 2];
        let y0 = pts[i * 2 + 1];
        let x1 = pts[(i + 1) * 2];
        let y1 = pts[(i + 1) * 2 + 1];
        let dx = x1 - x0;
        let dy = y1 - y0;
        let seg_len = (dx * dx + dy * dy).sqrt();

        if is_on && !seg_started {
            out.commands.push(path_command::MOVE_TO);
            out.data.extend_from_slice(&[x0, y0]);
            seg_started = true;
        }

        let mut consumed: f32 = 0.0;
        while consumed < seg_len {
            let step = remaining.min(seg_len - consumed);
            let t = if seg_len > 0.0 {
                (consumed + step) / seg_len
            } else {
                0.0
            };
            let ix = x0 + t * dx;
            let iy = y0 + t * dy;

            if is_on {
                if !seg_started {
                    let t_start = if seg_len > 0.0 {
                        consumed / seg_len
                    } else {
                        0.0
                    };
                    out.commands.push(path_command::MOVE_TO);
                    out.data
                        .extend_from_slice(&[x0 + t_start * dx, y0 + t_start * dy]);
                    seg_started = true;
                }
                out.commands.push(path_command::LINE_TO);
                out.data.extend_from_slice(&[ix, iy]);
            }

            consumed += step;
            remaining -= step;
            if remaining <= 1e-10 {
                dash_index = (dash_index + 1) % dash.len();
                remaining = dash[dash_index];
                let was_on = is_on;
                is_on = dash_index % 2 == 0;
                if was_on && !is_on {
                    seg_started = false;
                }
                if !was_on && is_on {
                    out.commands.push(path_command::MOVE_TO);
                    out.data.extend_from_slice(&[ix, iy]);
                    seg_started = true;
                }
            }
        }
    }
}

fn copy_commands(source: &Path, out: &mut Path) {
    out.commands.extend_from_slice(&source.commands);
    out.data.extend_from_slice(&source.data);
}

fn dash_total(dash: &[f32]) -> f32 {
    dash.iter().sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{append_path_line_to, append_path_move_to, create_path};
    use flighthq_types::PathWinding;

    fn make_line_path(x0: f32, y0: f32, x1: f32, y1: f32) -> Path {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, x0, y0);
        append_path_line_to(&mut p, x1, y1);
        p
    }

    // dash_path — empty dash copies source unchanged
    #[test]
    fn dash_path_empty_dash_copies_source() {
        let src = make_line_path(0.0, 0.0, 10.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        dash_path(&src, &[], 0.0, &mut out, 0.25);
        assert_eq!(out.commands, src.commands);
        assert_eq!(out.data, src.data);
    }

    // dash_path — zero-length dash copies source unchanged
    #[test]
    fn dash_path_zero_length_dash_copies_source() {
        let src = make_line_path(0.0, 0.0, 10.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        dash_path(&src, &[0.0, 0.0], 0.0, &mut out, 0.25);
        assert_eq!(out.commands, src.commands);
        assert_eq!(out.data, src.data);
    }

    // dash_path — simple dash on a horizontal line
    #[test]
    fn dash_path_simple_dash_produces_segments() {
        let src = make_line_path(0.0, 0.0, 10.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        dash_path(&src, &[3.0, 2.0], 0.0, &mut out, 0.25);
        // With pattern [3, 2] on length 10: on 0-3, off 3-5, on 5-8, off 8-10
        // Should produce 2 MOVE_TO commands (each on-segment starts a new sub-path)
        let move_count = out
            .commands
            .iter()
            .filter(|&&c| c == path_command::MOVE_TO)
            .count();
        assert_eq!(move_count, 2);
    }

    // dash_path — dash offset shifts the pattern
    #[test]
    fn dash_path_offset_shifts_pattern() {
        let src = make_line_path(0.0, 0.0, 10.0, 0.0);
        let mut out1 = create_path(PathWinding::NonZero);
        let mut out2 = create_path(PathWinding::NonZero);
        dash_path(&src, &[5.0, 5.0], 0.0, &mut out1, 0.25);
        dash_path(&src, &[5.0, 5.0], 5.0, &mut out2, 0.25);
        // offset=0: on 0-5, off 5-10 => 1 segment
        // offset=5: off 0-5, on 5-10 => 1 segment but starting at 5
        let move_count1 = out1
            .commands
            .iter()
            .filter(|&&c| c == path_command::MOVE_TO)
            .count();
        let move_count2 = out2
            .commands
            .iter()
            .filter(|&&c| c == path_command::MOVE_TO)
            .count();
        assert_eq!(move_count1, 1);
        assert_eq!(move_count2, 1);
        // The starting x of the dashed segment should differ
        assert!((out1.data[0] - 0.0).abs() < 1e-4);
        assert!((out2.data[0] - 5.0).abs() < 1e-4);
    }

    // dash_path — preserves winding rule
    #[test]
    fn dash_path_preserves_winding() {
        let mut src = make_line_path(0.0, 0.0, 10.0, 0.0);
        src.winding = PathWinding::EvenOdd;
        let mut out = create_path(PathWinding::NonZero);
        dash_path(&src, &[3.0, 2.0], 0.0, &mut out, 0.25);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}
