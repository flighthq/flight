// flight-lint: allow-file(f64) Flight path coordinates and dash measurements use the approved D1 f64 path lane

use flight_entity::Ref;
use flight_path::{Path, PathWinding, create_path, dash_path};
use flight_shape::contract::{Shape, append_shape_path};

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly Path[] and number[] map to shared-reference slices
pub fn append_lottie_dashed_shape_paths(
    paths: &[Ref<Path>],
    shape: &Ref<Shape>,
    winding: Option<PathWinding>,
    dash: &[f64],
    dash_offset: f64,
) {
    if dash.is_empty() {
        append_lottie_shape_paths(paths, shape, winding);
        return;
    }
    let expanded;
    let dash = if dash.len() % 2 == 0 {
        dash
    } else {
        expanded = dash.iter().chain(dash).copied().collect::<Vec<_>>();
        &expanded
    };
    for path in paths {
        let path = path.read().unwrap();
        let mut output = create_path(Some(flight_path::PathWinding::NonZero));
        output.winding = path.winding;
        dash_path(&path, dash, dash_offset, &mut output, None);
        append_shape_path(
            shape,
            &output.commands,
            &output.data,
            Some(winding.unwrap_or(output.winding)),
        );
    }
}

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly Path[] maps to the canonical shared-reference slice lane
pub fn append_lottie_shape_paths(
    paths: &[Ref<Path>],
    shape: &Ref<Shape>,
    winding: Option<PathWinding>,
) {
    for path in paths {
        let path = path.read().unwrap();
        append_shape_path(
            shape,
            &path.commands,
            &path.data,
            Some(winding.unwrap_or(path.winding)),
        );
    }
}
