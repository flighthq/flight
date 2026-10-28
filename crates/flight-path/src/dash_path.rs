use crate::flatten_path::flatten_path;
use crate::path::{Path, PathCommand};

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
    fn path_dash_matches_dash_path() {
        let mut oa2 = create_path(PathWinding::NonZero);
        let mut ob2 = create_path(PathWinding::NonZero);
        let s = test_path();
        s.dash(&[4.0, 2.0], 1.0, &mut oa2, Some(0.5));
        dash_path(&s, &[4.0, 2.0], 1.0, &mut ob2, Some(0.5));
        assert_eq!(format!("{:?}", oa2), format!("{:?}", ob2));
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn apply_dash_to_contour(
    pts: &[f64],
    dash: &[f64],
    dash_offset: f64,
    total_dash_length: f64,
    out: &mut Path,
) {
    let n = pts.len() / 2;
    if n < 2 {
        return;
    }

    let offset = ((dash_offset % total_dash_length) + total_dash_length) % total_dash_length;
    let mut dash_index: usize = 0;
    let mut remaining: f64 = 0.0;
    let mut is_on = true;
    {
        let mut acc: f64 = 0.0;
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
            out.commands.push(PathCommand::MoveTo as u8);
            out.data.push(x0);
            out.data.push(y0);
            seg_started = true;
        }

        let mut consumed: f64 = 0.0;
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
                    out.commands.push(PathCommand::MoveTo as u8);
                    out.data.push(x0 + t_start * dx);
                    out.data.push(y0 + t_start * dy);
                    seg_started = true;
                }
                out.commands.push(PathCommand::LineTo as u8);
                out.data.push(ix);
                out.data.push(iy);
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
                    out.commands.push(PathCommand::MoveTo as u8);
                    out.data.push(ix);
                    out.data.push(iy);
                    seg_started = true;
                }
            }
        }
    }
}

fn copy_commands(source: &Path, out: &mut Path) {
    let commands = source.commands.clone();
    let data = source.data.clone();
    let winding = source.winding;
    out.commands = commands;
    out.data = data;
    out.winding = winding;
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Splits `source` into dashed sub-paths according to the given dash pattern and offset.
/// An empty or all-zero dash array copies the source unchanged (solid stroke). Alias-safe.
pub fn dash_path(
    source: &Path,
    dash: &[f64],
    dash_offset: f64,
    out: &mut Path,
    tolerance: Option<f64>,
) {
    let tolerance = tolerance.unwrap_or(0.25);
    let total_dash_length = dash_total(dash);
    if total_dash_length <= 0.0 {
        copy_commands(source, out);
        return;
    }

    let mut contours = Vec::new();
    flatten_path(&mut contours, source, Some(tolerance));
    out.commands.clear();
    out.data.clear();
    out.winding = source.winding;

    for contour in &contours {
        apply_dash_to_contour(contour, dash, dash_offset, total_dash_length, out);
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
fn dash_total(dash: &[f64]) -> f64 {
    let mut total: f64 = 0.0;
    for i in 0..dash.len() {
        total += dash[i];
    }
    return total;
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn dash(&self, dash: &[f64], dash_offset: f64, out: &mut Path, tolerance: Option<f64>) {
        return dash_path(self, dash, dash_offset, out, tolerance);
    }
}
