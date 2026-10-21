use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_json_section;

mod spine_json_animations_section_handler {
    use super::*;

    #[test]
    fn accepts_a_document_without_animations() {
        with_empty_spine_json_section(|context| spine_json_animations_section_handler(context));
    }
}
