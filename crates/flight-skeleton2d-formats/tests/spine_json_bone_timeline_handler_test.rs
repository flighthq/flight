use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_json_timeline;

mod spine_json_bone_timeline_handler {
    use super::*;

    #[test]
    fn accepts_an_animation_without_bone_timelines() {
        with_empty_spine_json_timeline(|context, animation| {
            spine_json_bone_timeline_handler(context, "empty", animation);
        });
    }
}
