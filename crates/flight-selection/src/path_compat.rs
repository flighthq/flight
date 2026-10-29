//! flight-compiler: target-native

use flight_path::{
    Path, PathWinding, append_path_close, append_path_line_to, append_path_move_to, create_path,
};

pub fn create_lasso_path() -> Path {
    return create_path(Some(PathWinding::EvenOdd));
}

pub fn append_lasso_move_to(path: &mut Path, x: f64, y: f64) {
    append_path_move_to(path, x, y);
}

pub fn append_lasso_line_to(path: &mut Path, x: f64, y: f64) {
    append_path_line_to(path, x, y);
}

pub fn append_lasso_close(path: &mut Path) {
    append_path_close(path);
}
