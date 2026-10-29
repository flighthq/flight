//! flight-compiler: target-native
//!
//! Rust exercises the public path constructor; the TypeScript companion locks the target-native
//! return-to-out-parameter adapter itself.

use flight_path::{PathWinding, append_path_line_to, append_path_move_to, create_path};

use super::*;

#[test]
fn flattens_path_coordinates() {
    let mut path = create_path(PathWinding::NonZero);
    append_path_move_to(&mut path, 1.0, 2.0);
    append_path_line_to(&mut path, 3.0, 4.0);
    append_path_line_to(&mut path, 5.0, 2.0);
    let clip = create_clip_region_from_path(&path, None);
    assert_eq!(
        clip.read().unwrap().contours,
        Some(vec![vec![1.0, 2.0, 3.0, 4.0, 5.0, 2.0]])
    );
}
