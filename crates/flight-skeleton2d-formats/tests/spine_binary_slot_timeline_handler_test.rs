use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_binary_timeline;

mod skip_spine_binary_slot_timelines {
    use super::*;
    #[test]
    fn consumes_an_empty_timeline() {
        with_empty_spine_binary_timeline(|c| skip_spine_binary_slot_timelines(c));
    }
}

mod spine_binary_slot_timeline_handler {
    use super::*;
    #[test]
    fn consumes_an_empty_timeline() {
        with_empty_spine_binary_timeline(|c| spine_binary_slot_timeline_handler(c));
    }
}
