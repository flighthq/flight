use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_binary_section;

mod skip_spine_binary_events_section {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| skip_spine_binary_events_section(c));
    }
}

mod skip_spine_binary_ik_constraints_section {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| skip_spine_binary_ik_constraints_section(c));
    }
}

mod skip_spine_binary_path_constraints_section {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| skip_spine_binary_path_constraints_section(c));
    }
}

mod skip_spine_binary_transform_constraints_section {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| skip_spine_binary_transform_constraints_section(c));
    }
}

mod spine_binary_events_section_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| spine_binary_events_section_handler(c));
    }
}

mod spine_binary_ik_constraints_section_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| spine_binary_ik_constraints_section_handler(c));
    }
}

mod spine_binary_path_constraints_section_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| spine_binary_path_constraints_section_handler(c));
    }
}

mod spine_binary_transform_constraints_section_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_section(|c| spine_binary_transform_constraints_section_handler(c));
    }
}
