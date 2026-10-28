use crate::path::{Path, PathMorph};
use crate::path_morph_geometry::build_path_morph;

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

    fn other_path() -> Path {
        let mut out = create_path(PathWinding::NonZero);
        append_path_move_to(&mut out, 1.0, 1.0);
        append_path_line_to(&mut out, 12.0, 1.0);
        append_path_quadratic_curve_to(&mut out, 15.0, 5.0, 12.0, 12.0);
        append_path_line_to(&mut out, 1.0, 12.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_sample_morph_matches_sample_path_morph() {
        let mut a = test_path();
        let mut b = test_path();
        a.sample_morph(
            &create_path_morph(&test_path(), &other_path()).unwrap(),
            0.5,
        );
        sample_path_morph(
            &mut b,
            &create_path_morph(&test_path(), &other_path()).unwrap(),
            0.5,
        );
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn pathmorph_new_matches_create_path_morph() {
        let ra = PathMorph::new(&test_path(), &other_path());
        let rb = create_path_morph(&test_path(), &other_path());
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// Allocates a prepared interpolation between two paths. Returns `None` when the paths
/// are incompatible (different winding, contour count, closedness, or orientation).
pub fn create_path_morph(start: &Path, end: &Path) -> Option<PathMorph> {
    let result = build_path_morph(start, end);
    return result.morph;
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Samples a prepared morph into `out`. Progress is not clamped: 0 and 1 are the endpoints,
/// while values outside that range permit deliberate easing overshoot.
pub fn sample_path_morph(out: &mut Path, morph: &PathMorph, progress: f64) {
    let commands = &morph.commands;
    out.commands.resize(commands.len(), 0);
    for i in 0..commands.len() {
        out.commands[i] = commands[i];
    }

    let start_data = &morph.start_data;
    let end_data = &morph.end_data;
    out.data.resize(start_data.len(), 0.0);
    if progress == 0.0 || progress == 1.0 {
        let endpoint = if progress == 0.0 {
            start_data
        } else {
            end_data
        };
        for i in 0..endpoint.len() {
            out.data[i] = endpoint[i];
        }
        out.winding = morph.winding;
        return;
    }
    for i in 0..start_data.len() {
        let s = start_data[i];
        let e = end_data[i];
        out.data[i] = s + (e - s) * progress;
    }
    out.winding = morph.winding;
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn sample_morph(&mut self, morph: &PathMorph, progress: f64) {
        return sample_path_morph(self, morph, progress);
    }
}

impl PathMorph {
    pub fn new(start: &Path, end: &Path) -> Option<Self> {
        return create_path_morph(start, end);
    }
}
