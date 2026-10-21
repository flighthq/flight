use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_json_section;

mod spine_json_bones_section_handler {
    use super::*;

    #[test]
    fn accepts_a_document_without_bones() {
        with_empty_spine_json_section(|context| spine_json_bones_section_handler(context));
    }
}

mod spine_json_bones_section_reader {
    use super::*;

    #[test]
    fn returns_a_callable_handler() {
        with_empty_spine_json_section(|context| SPINE_JSON_BONES_SECTION_READER(context));
    }
}
