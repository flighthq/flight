//! flight-compiler: target-native

use flight_path::{Path, flatten_path};

// flight-lint: allow(f64) flattened contours retain Path.data precision
pub fn flatten_clip_path(out: &mut Vec<Vec<f64>>, path: &Path, tolerance: Option<f64>) {
    *out = flatten_path(path, tolerance);
}
