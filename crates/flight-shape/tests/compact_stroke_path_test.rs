use flight_path::{PathWinding, create_path};
use flight_shape::contract::*;

use crate::support::*;

mod compact_stroke_path {
    use super::*;

    #[test]
    fn returns_a_new_path_for_an_empty_stroke() {
        let path = create_path(Some(PathWinding::NonZero));
        let compacted = compact_stroke_path(&path, &stroke_style(), None);
        assert!(compacted.read().unwrap().commands.is_empty());
    }
}
