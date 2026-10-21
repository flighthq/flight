use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_dragon_bones_timeline;

mod dragon_bones_bone_timeline_handler {
    use super::*;

    #[test]
    fn accepts_an_animation_without_bone_timelines() {
        with_empty_dragon_bones_timeline(|context, animation| {
            dragon_bones_bone_timeline_handler(context, "empty", animation);
        });
    }
}
