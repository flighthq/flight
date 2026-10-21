use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_binary_section;

mod skip_spine_binary_skins_section {
    use super::*;
    #[test]
    fn consumes_an_empty_section() {
        with_empty_spine_binary_section(|c| SKIP_SPINE_BINARY_SKINS_SECTION(c));
    }
}

mod spine_binary_skins_section_handler {
    use super::*;
    #[test]
    fn consumes_an_empty_section() {
        with_empty_spine_binary_section(|c| spine_binary_skins_section_handler(c));
    }
}
