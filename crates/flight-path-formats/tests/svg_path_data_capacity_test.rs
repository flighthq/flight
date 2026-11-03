//! flight-compiler: rust-only
//!
//! Rust locks that appending reuses the destination's reserved command buffer. TypeScript arrays
//! have no observable capacity, so only the winding half of this check has a generated twin.

use flight_path::{PathWinding, create_path};
use flight_path_formats::contract::*;

mod append_svg_path_data {
    use super::*;

    #[test]
    fn keeps_the_destination_buffers_and_winding() {
        let mut path = create_path(Some(PathWinding::NonZero));
        path.winding = PathWinding::EvenOdd;
        path.commands.reserve(64);
        let capacity = path.commands.capacity();
        assert!(append_svg_path_data(&mut path, "M0 0 L1 1"));
        assert_eq!(path.commands.capacity(), capacity);
        assert_eq!(path.winding, PathWinding::EvenOdd);
    }
}
