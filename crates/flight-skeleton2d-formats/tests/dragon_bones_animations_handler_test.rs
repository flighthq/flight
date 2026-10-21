use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_dragon_bones_section;

mod dragon_bones_animations_section_handler {
    use super::*;

    #[test]
    fn accepts_an_armature_without_animations() {
        with_empty_dragon_bones_section(|context| dragon_bones_animations_section_handler(context));
    }
}
