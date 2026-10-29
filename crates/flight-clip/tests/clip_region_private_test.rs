//! flight-compiler: target-native
//!
//! TypeScript reflects its object representation in the target-native companion. Rust verifies the
//! same public geometry surface while its private runtime remains compile-time inaccessible here.

use flight_geometry::create_rectangle;

use super::*;

#[test]
fn public_geometry_remains_observable() {
    let clip = create_clip_region_from_rectangle(&create_rectangle(1.0, 2.0, 3.0, 4.0));
    let clip = clip.read().unwrap();
    assert_eq!(clip.rect, create_rectangle(1.0, 2.0, 3.0, 4.0));
    assert_eq!(clip.contours, None);
    assert_eq!(clip.winding, PathWinding::NonZero);
    assert_eq!(clip.version, 0);
}
