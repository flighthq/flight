//! flight-compiler: target-native
//!
//! Rust exercises the same nine geometry operations with their concrete storage types. The
//! target-native TypeScript companion locks their established structural public signatures and
//! proves that plain object consumers retain the same behavior.

use flight_geometry::{create_matrix, create_rectangle};

use super::*;

#[test]
fn structural_geometry_operations_keep_their_runtime_behavior() {
    let source = create_rectangle(1.0, 2.0, 6.0, 4.0);
    let clip = create_clip_region_from_rectangle(&source);
    assert!(clip_region_contains_rectangle(
        &clip,
        &create_rectangle(2.0, 3.0, 1.0, 1.0),
    ));
    assert!(clip_region_intersects_rectangle(
        &clip,
        &create_rectangle(6.0, 4.0, 2.0, 2.0),
    ));

    let ellipse = create_clip_region_from_ellipse(&source, None);
    let rounded = create_clip_region_from_rounded_rectangle(&source, 1.0, None);
    assert_eq!(ellipse.read().unwrap().rect, source);
    assert_eq!(rounded.read().unwrap().rect, source);

    initialize_clip_region_from_rectangle(
        &mut clip.write().unwrap(),
        &create_rectangle(3.0, 4.0, 5.0, 6.0),
    );
    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    get_clip_region_bounds(&mut bounds, &clip);
    assert_eq!(bounds, create_rectangle(3.0, 4.0, 5.0, 6.0));

    set_clip_region_to_rectangle(&clip, &source);
    transform_clip_region(&clip, &clip, &create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 7.0));
    get_clip_region_bounds(&mut bounds, &clip);
    assert_eq!(bounds, create_rectangle(6.0, 9.0, 6.0, 4.0));
}
