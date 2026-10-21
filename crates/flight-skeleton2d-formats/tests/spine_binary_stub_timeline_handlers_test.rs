use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_binary_timeline;

mod skip_spine_binary_deform_timelines {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| skip_spine_binary_deform_timelines(c));
    }
}

mod skip_spine_binary_event_timelines {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| skip_spine_binary_event_timelines(c));
    }
}

mod skip_spine_binary_ik_timelines {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| skip_spine_binary_ik_timelines(c));
    }
}

mod skip_spine_binary_path_timelines {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| skip_spine_binary_path_timelines(c));
    }
}

mod skip_spine_binary_transform_timelines {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| skip_spine_binary_transform_timelines(c));
    }
}

mod spine_binary_deform_timeline_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| spine_binary_deform_timeline_handler(c));
    }
}

mod spine_binary_event_timeline_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| spine_binary_event_timeline_handler(c));
    }
}

mod spine_binary_ik_timeline_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| spine_binary_ik_timeline_handler(c));
    }
}

mod spine_binary_path_timeline_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| spine_binary_path_timeline_handler(c));
    }
}

mod spine_binary_transform_timeline_handler {
    use super::*;
    #[test]
    fn consumes_empty() {
        with_empty_spine_binary_timeline(|c| spine_binary_transform_timeline_handler(c));
    }
}
