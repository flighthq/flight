use flight_skeleton2d_formats::contract::*;

use crate::support::{with_empty_dragon_bones_section, with_empty_dragon_bones_timeline};

mod dragon_bones_deform_timeline_handler {
    use super::*;

    #[test]
    fn records_no_crumb_for_an_absent_group() {
        with_empty_dragon_bones_timeline(|context, animation| {
            dragon_bones_deform_timeline_handler(context, "empty", animation);
        });
    }
}

mod dragon_bones_ik_constraints_section_handler {
    use super::*;

    #[test]
    fn records_no_crumb_for_an_absent_group() {
        with_empty_dragon_bones_section(|context| {
            dragon_bones_ik_constraints_section_handler(context);
        });
    }
}

mod dragon_bones_ik_timeline_handler {
    use super::*;

    #[test]
    fn records_no_crumb_for_an_absent_group() {
        with_empty_dragon_bones_timeline(|context, animation| {
            dragon_bones_ik_timeline_handler(context, "empty", animation);
        });
    }
}

mod dragon_bones_z_order_timeline_handler {
    use super::*;

    #[test]
    fn records_no_crumb_for_an_absent_group() {
        with_empty_dragon_bones_timeline(|context, animation| {
            dragon_bones_z_order_timeline_handler(context, "empty", animation);
        });
    }
}
