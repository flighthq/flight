use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_json_timeline;

mod spine_json_draw_order_timeline_handler {
    use super::*;

    #[test]
    fn accepts_an_animation_without_draw_order() {
        with_empty_spine_json_timeline(|context, animation| {
            spine_json_draw_order_timeline_handler(context, "empty", animation);
        });
    }
}
