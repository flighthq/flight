use flight_path::{
    append_path_close, append_path_line_to, append_path_move_to, create_path, Path, PathWinding,
};

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
// flight-lint: allow(conform-params) D9b: TS takes an optional trailing `out` and returns it; Rust takes `out` first and returns nothing (the caller allocates it, e.g. with `create_path`)
/// Converts a set of polygon contour rings (flat interleaved `[x, y, ...]` coordinate
/// arrays) into a `Path` of MoveTo/LineTo/Close commands. Each ring with at least three
/// vertices becomes one closed sub-path in the output. The output path's winding is
/// always set to `NonZero`.
pub fn write_path_boolean_contours(out: &mut Path, contours: &[Vec<f64>]) {
    out.commands.clear();
    out.data.clear();
    out.winding = PathWinding::NonZero;
    for ring in contours {
        if ring.len() < 6 {
            continue;
        }
        append_path_move_to(out, ring[0], ring[1]);
        let mut i = 2;
        while i < ring.len() {
            append_path_line_to(out, ring[i], ring[i + 1]);
            i += 2;
        }
        append_path_close(out);
    }
}
