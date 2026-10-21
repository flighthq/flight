use flight_skeleton2d_formats::contract::*;

use crate::support::{with_empty_spine_json_section, with_empty_spine_json_timeline};

mod spine_json_deform_timeline_handler {
    use super::*;
    #[test]
    fn accepts_absent_group() {
        with_empty_spine_json_timeline(|c, a| spine_json_deform_timeline_handler(c, "", a));
    }
}

mod spine_json_event_timeline_handler {
    use super::*;
    #[test]
    fn accepts_absent_group() {
        with_empty_spine_json_timeline(|c, a| spine_json_event_timeline_handler(c, "", a));
    }
}

mod spine_json_events_section_handler {
    use super::*;
    #[test]
    fn accepts_empty_document() {
        with_empty_spine_json_section(|c| spine_json_events_section_handler(c));
    }
}

mod spine_json_ik_constraints_section_handler {
    use super::*;
    #[test]
    fn accepts_empty_document() {
        with_empty_spine_json_section(|c| spine_json_ik_constraints_section_handler(c));
    }
}

mod spine_json_ik_timeline_handler {
    use super::*;
    #[test]
    fn accepts_absent_group() {
        with_empty_spine_json_timeline(|c, a| spine_json_ik_timeline_handler(c, "", a));
    }
}

mod spine_json_path_constraints_section_handler {
    use super::*;
    #[test]
    fn accepts_empty_document() {
        with_empty_spine_json_section(|c| spine_json_path_constraints_section_handler(c));
    }
}

mod spine_json_path_timeline_handler {
    use super::*;
    #[test]
    fn accepts_absent_group() {
        with_empty_spine_json_timeline(|c, a| spine_json_path_timeline_handler(c, "", a));
    }
}

mod spine_json_transform_constraints_section_handler {
    use super::*;
    #[test]
    fn accepts_empty_document() {
        with_empty_spine_json_section(|c| spine_json_transform_constraints_section_handler(c));
    }
}

mod spine_json_transform_timeline_handler {
    use super::*;
    #[test]
    fn accepts_absent_group() {
        with_empty_spine_json_timeline(|c, a| spine_json_transform_timeline_handler(c, "", a));
    }
}
